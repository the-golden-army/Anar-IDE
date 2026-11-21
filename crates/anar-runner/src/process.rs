use crate::diagnostics::{parse_cargo_stdout_line, ParsedCargoLine};
use crate::rusturbo::{find_rusturbo_binary, rusturbo_args_for, StderrDiagnosticParser};
use crate::{cargo_args_for, executable_for, OutputStream, RunnerAction, RunnerEvent};
use anar_core::{CompilerBackend, DiagnosticItem};
use std::collections::HashSet;
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Instant;

struct ActiveProcess {
    run_id: u64,
    pid: u32,
    stdin: Option<ChildStdin>,
    cancelled: Arc<AtomicBool>,
    child: Arc<Mutex<Child>>,
}

/// Manages the active build/run subprocess and cross-platform termination.
#[derive(Default)]
pub struct RunnerManager {
    next_run_id: AtomicU64,
    active: Mutex<Option<ActiveProcess>>,
}

impl RunnerManager {
    /// Creates a new idle [`RunnerManager`].
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns `true` if a build or run process is currently active.
    pub fn is_running(&self) -> bool {
        self.active
            .lock()
            .map(|guard| guard.is_some())
            .unwrap_or(false)
    }

    /// Stops any currently running process tree and returns `true` if one was active.
    pub fn stop(&self) -> Result<bool, String> {
        let active_info = {
            let guard = self
                .active
                .lock()
                .map_err(|_| String::from("runner lock poisoned"))?;
            guard.as_ref().map(|proc_handle| {
                proc_handle.cancelled.store(true, Ordering::SeqCst);
                (proc_handle.pid, Arc::clone(&proc_handle.child))
            })
        };

        let Some((pid, child)) = active_info else {
            return Ok(false);
        };

        terminate_process_tree(pid, &child);
        Ok(true)
    }

    /// Writes a line of input to the running child process's `stdin`.
    pub fn write_stdin(&self, input: &str) -> Result<(), String> {
        let mut guard = self
            .active
            .lock()
            .map_err(|_| String::from("runner lock poisoned"))?;
        let Some(active) = guard.as_mut() else {
            return Err(String::from("no process is currently running"));
        };
        let Some(stdin) = active.stdin.as_mut() else {
            return Err(String::from("process stdin is closed"));
        };

        stdin
            .write_all(input.as_bytes())
            .map_err(|e| format!("failed to write to stdin: {e}"))?;
        if !input.ends_with('\n') {
            stdin
                .write_all(b"\n")
                .map_err(|e| format!("failed to write newline to stdin: {e}"))?;
        }
        stdin
            .flush()
            .map_err(|e| format!("failed to flush stdin: {e}"))?;
        Ok(())
    }

    /// Starts a Cargo command in `workspace_root` and streams [`RunnerEvent`]s to `emit`.
    pub fn start_cargo_run<F>(
        self: &Arc<Self>,
        workspace_root: &Path,
        action: RunnerAction,
        emit: F,
    ) -> Result<u64, String>
    where
        F: Fn(RunnerEvent) + Send + Sync + 'static,
    {
        let exe = executable_for(CompilerBackend::Cargo, action);
        let args = cargo_args_for(action);
        self.spawn_command(workspace_root, action, exe, &args, true, emit)
    }

    /// Starts a build/run/check/test command using the selected [`CompilerBackend`].
    pub fn start_run_with_backend<F>(
        self: &Arc<Self>,
        workspace_root: &Path,
        action: RunnerAction,
        backend: CompilerBackend,
        emit: F,
    ) -> Result<u64, String>
    where
        F: Fn(RunnerEvent) + Send + Sync + 'static,
    {
        if backend == CompilerBackend::Cargo {
            return self.start_cargo_run(workspace_root, action, emit);
        }

        let Some(rt_args) = rusturbo_args_for(workspace_root, action) else {
            // Rusturbo v0.1.2 does not expose `check` or `test`; fall back to Cargo.
            return self.start_cargo_run(workspace_root, action, emit);
        };

        let binary = find_rusturbo_binary().ok_or_else(|| {
            String::from(
                "rusturbo binary not found on PATH. Install Rusturbo or switch compiler backend to Cargo.",
            )
        })?;
        let program = binary.to_string_lossy().into_owned();
        let arg_refs: Vec<&str> = rt_args.iter().map(String::as_str).collect();
        self.spawn_command_with_env(
            workspace_root,
            action,
            &program,
            &arg_refs,
            &[("NO_COLOR", "1")],
            false,
            true,
            emit,
        )
    }

    /// Spawns `program` with `args` in `working_dir` and streams [`RunnerEvent`]s.
    pub fn spawn_command<F>(
        self: &Arc<Self>,
        working_dir: &Path,
        action: RunnerAction,
        program: &str,
        args: &[&str],
        parse_cargo_json: bool,
        emit: F,
    ) -> Result<u64, String>
    where
        F: Fn(RunnerEvent) + Send + Sync + 'static,
    {
        self.spawn_command_with_env(
            working_dir,
            action,
            program,
            args,
            &[],
            parse_cargo_json,
            false,
            emit,
        )
    }

    #[allow(clippy::too_many_arguments)]
    fn spawn_command_with_env<F>(
        self: &Arc<Self>,
        working_dir: &Path,
        action: RunnerAction,
        program: &str,
        args: &[&str],
        extra_env: &[(&str, &str)],
        parse_cargo_json: bool,
        parse_stderr_diagnostics: bool,
        emit: F,
    ) -> Result<u64, String>
    where
        F: Fn(RunnerEvent) + Send + Sync + 'static,
    {
        // Stop any previous active run before launching a new one.
        let _ = self.stop();

        let mut cmd = Command::new(program);
        cmd.args(args)
            .current_dir(working_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        for (k, v) in extra_env {
            cmd.env(k, v);
        }

        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            cmd.process_group(0);
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("failed to start `{program}`: {e}"))?;

        let run_id = self.next_run_id.fetch_add(1, Ordering::SeqCst) + 1;
        let pid = child.id();
        let stdin = child.stdin.take();
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let cancelled = Arc::new(AtomicBool::new(false));
        let child_arc = Arc::new(Mutex::new(child));

        {
            let mut guard = self
                .active
                .lock()
                .map_err(|_| String::from("runner lock poisoned"))?;
            *guard = Some(ActiveProcess {
                run_id,
                pid,
                stdin,
                cancelled: Arc::clone(&cancelled),
                child: Arc::clone(&child_arc),
            });
        }

        let command_label = if args.is_empty() {
            program.to_string()
        } else {
            format!("{program} {}", args.join(" "))
        };
        let emit = Arc::new(emit);
        emit(RunnerEvent::Started {
            run_id,
            action,
            command: command_label,
        });

        let manager = Arc::clone(self);
        let root_buf = working_dir.to_path_buf();
        thread::spawn(move || {
            let started_at = Instant::now();

            let stdout_handle = stdout.map(|out| {
                let emit_out = Arc::clone(&emit);
                let root_clone = root_buf.clone();
                thread::spawn(move || {
                    read_stdout_stream(out, run_id, &root_clone, parse_cargo_json, &*emit_out);
                })
            });

            let stderr_handle = stderr.map(|err| {
                let emit_err = Arc::clone(&emit);
                let root_clone = root_buf.clone();
                thread::spawn(move || {
                    read_stderr_stream(
                        err,
                        run_id,
                        &root_clone,
                        parse_stderr_diagnostics,
                        &*emit_err,
                    );
                })
            });

            if let Some(handle) = stdout_handle {
                let _ = handle.join();
            }
            if let Some(handle) = stderr_handle {
                let _ = handle.join();
            }

            let exit_code = if let Ok(mut guard) = child_arc.lock() {
                guard.wait().ok().and_then(|status| status.code())
            } else {
                None
            };

            if let Ok(mut guard) = manager.active.lock() {
                if guard.as_ref().is_some_and(|a| a.run_id == run_id) {
                    *guard = None;
                }
            }

            let duration_ms = u64::try_from(started_at.elapsed().as_millis()).unwrap_or(u64::MAX);
            emit(RunnerEvent::Finished {
                run_id,
                action,
                exit_code,
                cancelled: cancelled.load(Ordering::SeqCst),
                duration_ms,
            });
        });

        Ok(run_id)
    }
}

fn read_stdout_stream<R: std::io::Read, F: Fn(RunnerEvent)>(
    reader: R,
    run_id: u64,
    workspace_root: &Path,
    parse_cargo_json: bool,
    emit: &F,
) {
    let mut seen = HashSet::<DiagnosticItem>::new();
    let buf = BufReader::new(reader);
    for line in buf.lines().map_while(Result::ok) {
        if !parse_cargo_json {
            emit(RunnerEvent::Output {
                run_id,
                stream: OutputStream::Stdout,
                line,
            });
            continue;
        }

        match parse_cargo_stdout_line(Some(workspace_root), &line) {
            ParsedCargoLine::Diagnostic(diag) => {
                if seen.insert(diag.clone()) {
                    emit(RunnerEvent::Diagnostic {
                        run_id,
                        diagnostic: diag,
                    });
                }
            }
            ParsedCargoLine::Metadata => {}
            ParsedCargoLine::PlainStdout(text) => {
                emit(RunnerEvent::Output {
                    run_id,
                    stream: OutputStream::Stdout,
                    line: text,
                });
            }
        }
    }
}

fn read_stderr_stream<R: std::io::Read, F: Fn(RunnerEvent)>(
    reader: R,
    run_id: u64,
    workspace_root: &Path,
    parse_diagnostics: bool,
    emit: &F,
) {
    let mut parser = StderrDiagnosticParser::default();
    let mut seen = HashSet::<DiagnosticItem>::new();
    let buf = BufReader::new(reader);
    for line in buf.lines().map_while(Result::ok) {
        if parse_diagnostics {
            if let Some(diag) = parser.push_line(Some(workspace_root), &line) {
                if seen.insert(diag.clone()) {
                    emit(RunnerEvent::Diagnostic {
                        run_id,
                        diagnostic: diag,
                    });
                }
            }
        }
        emit(RunnerEvent::Output {
            run_id,
            stream: OutputStream::Stderr,
            line,
        });
    }
}

fn terminate_process_tree(pid: u32, child: &Arc<Mutex<Child>>) {
    #[cfg(unix)]
    {
        let pgid_arg = format!("-{pid}");
        let _ = Command::new("kill")
            .args(["-TERM", &pgid_arg])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        thread::sleep(std::time::Duration::from_millis(80));
        let _ = Command::new("kill")
            .args(["-KILL", &pgid_arg])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }

    #[cfg(windows)]
    {
        let pid_str = pid.to_string();
        let _ = Command::new("taskkill")
            .args(["/PID", &pid_str, "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }

    if let Ok(mut guard) = child.lock() {
        let _ = guard.kill();
    }
}
