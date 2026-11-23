use crate::diagnostics::{parse_cargo_stdout_line, parse_rustc_stderr_line, ParsedCargoLine};
use crate::rusturbo::{find_rusturbo_binary, rusturbo_args_for, StderrDiagnosticParser};
use crate::{cargo_args_for, executable_for, OutputStream, RunnerAction, RunnerEvent};
use anar_core::{configure_background_command, CompilerBackend, DiagnosticItem};
use std::collections::HashSet;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Component, Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

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

    /// Starts a build/run/check/test command using the selected [`CompilerBackend`],
    /// automatically falling back to `rustc` for standalone `.rs` folders without `Cargo.toml`.
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
        self.start_run_with_backend_and_file(workspace_root, action, backend, None, emit)
    }

    /// Starts a build/run/check/test command, preferring `Cargo.toml` if present and
    /// falling back to `rustc` on `active_file` (or detected entry `.rs` file) otherwise.
    pub fn start_run_with_backend_and_file<F>(
        self: &Arc<Self>,
        workspace_root: &Path,
        action: RunnerAction,
        backend: CompilerBackend,
        active_file: Option<&str>,
        emit: F,
    ) -> Result<u64, String>
    where
        F: Fn(RunnerEvent) + Send + Sync + 'static,
    {
        if let Some(manifest_dir) = find_cargo_manifest_dir(workspace_root, active_file) {
            if backend == CompilerBackend::Cargo {
                return self.start_cargo_run(&manifest_dir, action, emit);
            }

            let Some(rt_args) = rusturbo_args_for(&manifest_dir, action) else {
                // Rusturbo v0.1.2 does not expose `check` or `test`; fall back to Cargo.
                return self.start_cargo_run(&manifest_dir, action, emit);
            };

            let binary = find_rusturbo_binary().ok_or_else(|| {
                String::from(
                    "rusturbo binary not found on PATH. Install Rusturbo or switch compiler backend to Cargo.",
                )
            })?;
            let program = binary.to_string_lossy().into_owned();
            let arg_refs: Vec<&str> = rt_args.iter().map(String::as_str).collect();
            return self.spawn_command_with_env(
                &manifest_dir,
                action,
                &program,
                &arg_refs,
                &[("NO_COLOR", "1")],
                false,
                true,
                emit,
            );
        }

        self.start_rustc_run(workspace_root, action, active_file, emit)
    }

    fn start_rustc_run<F>(
        self: &Arc<Self>,
        workspace_root: &Path,
        action: RunnerAction,
        active_file: Option<&str>,
        emit: F,
    ) -> Result<u64, String>
    where
        F: Fn(RunnerEvent) + Send + Sync + 'static,
    {
        let source_path = resolve_standalone_rs_file(workspace_root, active_file)?;
        let rel_source = source_path
            .strip_prefix(workspace_root)
            .unwrap_or(&source_path)
            .to_string_lossy()
            .replace('\\', "/");

        let stem = source_path
            .file_stem()
            .and_then(|s| s.to_str())
            .filter(|s| !s.is_empty())
            .unwrap_or("main");
        let exe_suffix = std::env::consts::EXE_SUFFIX;
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);

        let (output_artifact, temp_dir_to_clean) = match action {
            RunnerAction::Build => {
                let out = workspace_root.join(format!("{stem}{exe_suffix}"));
                (out, None)
            }
            RunnerAction::Check => {
                let tag = format!("anar-rustc-{}-{nonce}", std::process::id());
                let tmp_dir = std::env::temp_dir().join(tag);
                fs::create_dir_all(&tmp_dir)
                    .map_err(|e| format!("failed to prepare rustc temp dir: {e}"))?;
                (tmp_dir.join(format!("lib{stem}.rmeta")), Some(tmp_dir))
            }
            RunnerAction::Run | RunnerAction::Test => {
                let tag = format!("anar-rustc-{}-{nonce}", std::process::id());
                let tmp_dir = std::env::temp_dir().join(tag);
                fs::create_dir_all(&tmp_dir)
                    .map_err(|e| format!("failed to prepare rustc temp dir: {e}"))?;
                (tmp_dir.join(format!("{stem}{exe_suffix}")), Some(tmp_dir))
            }
        };

        let mut rustc_args: Vec<String> = vec!["--error-format=json".to_string()];
        match action {
            RunnerAction::Check => {
                rustc_args.push("--emit=metadata".to_string());
            }
            RunnerAction::Test => {
                rustc_args.push("--test".to_string());
            }
            RunnerAction::Build | RunnerAction::Run => {}
        }
        rustc_args.push("-o".to_string());
        rustc_args.push(output_artifact.to_string_lossy().into_owned());
        rustc_args.push(source_path.to_string_lossy().into_owned());

        let _ = self.stop();

        let mut compile_cmd = Command::new("rustc");
        configure_background_command(&mut compile_cmd);
        compile_cmd
            .args(&rustc_args)
            .current_dir(workspace_root)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            compile_cmd.process_group(0);
        }

        let mut child = compile_cmd.spawn().map_err(|e| {
            if let Some(ref dir) = temp_dir_to_clean {
                let _ = fs::remove_dir_all(dir);
            }
            format!("failed to start `rustc`: {e}")
        })?;

        let run_id = self.next_run_id.fetch_add(1, Ordering::SeqCst) + 1;
        let pid = child.id();
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
                stdin: None,
                cancelled: Arc::clone(&cancelled),
                child: Arc::clone(&child_arc),
            });
        }

        let out_display = output_artifact
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("app");
        let command_label = match action {
            RunnerAction::Check => format!("rustc --emit=metadata {rel_source}"),
            RunnerAction::Build => format!("rustc {rel_source} -o {out_display}"),
            RunnerAction::Run => format!("rustc {rel_source} && {out_display}"),
            RunnerAction::Test => format!("rustc --test {rel_source} && {out_display}"),
        };

        let emit = Arc::new(emit);
        emit(RunnerEvent::Started {
            run_id,
            action,
            command: command_label,
        });

        let manager = Arc::clone(self);
        let root_buf = workspace_root.to_path_buf();
        let should_exec = matches!(action, RunnerAction::Run | RunnerAction::Test);

        thread::spawn(move || {
            let started_at = Instant::now();

            let stdout_handle = stdout.map(|out| {
                let emit_out = Arc::clone(&emit);
                let root_clone = root_buf.clone();
                thread::spawn(move || {
                    read_stdout_stream(out, run_id, &root_clone, false, &*emit_out);
                })
            });

            let stderr_handle = stderr.map(|err| {
                let emit_err = Arc::clone(&emit);
                let root_clone = root_buf.clone();
                thread::spawn(move || {
                    read_stderr_stream(err, run_id, &root_clone, false, true, &*emit_err);
                })
            });

            if let Some(handle) = stdout_handle {
                let _ = handle.join();
            }
            if let Some(handle) = stderr_handle {
                let _ = handle.join();
            }

            let mut exit_code = if let Ok(mut guard) = child_arc.lock() {
                guard.wait().ok().and_then(|status| status.code())
            } else {
                None
            };

            if should_exec && exit_code == Some(0) && !cancelled.load(Ordering::SeqCst) {
                let mut exec_cmd = Command::new(&output_artifact);
                configure_background_command(&mut exec_cmd);
                exec_cmd
                    .current_dir(&root_buf)
                    .stdin(Stdio::piped())
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped());

                #[cfg(unix)]
                {
                    use std::os::unix::process::CommandExt;
                    exec_cmd.process_group(0);
                }

                match exec_cmd.spawn() {
                    Ok(mut run_child) => {
                        let run_pid = run_child.id();
                        let run_stdin = run_child.stdin.take();
                        let run_stdout = run_child.stdout.take();
                        let run_stderr = run_child.stderr.take();
                        let run_child_arc = Arc::new(Mutex::new(run_child));

                        if let Ok(mut guard) = manager.active.lock() {
                            if guard.as_ref().is_some_and(|a| a.run_id == run_id) {
                                *guard = Some(ActiveProcess {
                                    run_id,
                                    pid: run_pid,
                                    stdin: run_stdin,
                                    cancelled: Arc::clone(&cancelled),
                                    child: Arc::clone(&run_child_arc),
                                });
                            }
                        }

                        let out_h = run_stdout.map(|out| {
                            let emit_out = Arc::clone(&emit);
                            let root_clone = root_buf.clone();
                            thread::spawn(move || {
                                read_stdout_stream(out, run_id, &root_clone, false, &*emit_out);
                            })
                        });
                        let err_h = run_stderr.map(|err| {
                            let emit_err = Arc::clone(&emit);
                            let root_clone = root_buf.clone();
                            thread::spawn(move || {
                                read_stderr_stream(err, run_id, &root_clone, false, false, &*emit_err);
                            })
                        });
                        if let Some(h) = out_h {
                            let _ = h.join();
                        }
                        if let Some(h) = err_h {
                            let _ = h.join();
                        }

                        exit_code = if let Ok(mut guard) = run_child_arc.lock() {
                            guard.wait().ok().and_then(|status| status.code())
                        } else {
                            None
                        };
                    }
                    Err(e) => {
                        emit(RunnerEvent::Output {
                            run_id,
                            stream: OutputStream::Stderr,
                            line: format!("failed to execute compiled binary: {e}"),
                        });
                        exit_code = Some(1);
                    }
                }
            }

            if let Some(dir) = temp_dir_to_clean {
                let _ = fs::remove_dir_all(dir);
            }

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
        configure_background_command(&mut cmd);
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
                        false,
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
    parse_rustc_json: bool,
    emit: &F,
) {
    let mut parser = StderrDiagnosticParser::default();
    let mut seen = HashSet::<DiagnosticItem>::new();
    let buf = BufReader::new(reader);
    for line in buf.lines().map_while(Result::ok) {
        if parse_rustc_json {
            match parse_rustc_stderr_line(Some(workspace_root), &line) {
                ParsedCargoLine::Diagnostic(diag) => {
                    if seen.insert(diag.clone()) {
                        emit(RunnerEvent::Diagnostic {
                            run_id,
                            diagnostic: diag,
                        });
                    }
                    continue;
                }
                ParsedCargoLine::Metadata => continue,
                ParsedCargoLine::PlainStdout(text) => {
                    emit(RunnerEvent::Output {
                        run_id,
                        stream: OutputStream::Stderr,
                        line: text,
                    });
                    continue;
                }
            }
        }

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

fn safe_resolve_relative(workspace_root: &Path, rel: &str) -> Option<PathBuf> {
    let p = Path::new(rel.trim());
    if p.as_os_str().is_empty() || p.is_absolute() {
        return None;
    }
    for comp in p.components() {
        match comp {
            Component::Normal(_) | Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => return None,
        }
    }
    let joined = workspace_root.join(p);
    let canon_root = fs::canonicalize(workspace_root).ok()?;
    let canon_file = fs::canonicalize(&joined).ok()?;
    if canon_file.starts_with(&canon_root) {
        Some(joined)
    } else {
        None
    }
}

fn find_cargo_manifest_dir(workspace_root: &Path, active_file: Option<&str>) -> Option<PathBuf> {
    if let Some(rel) = active_file {
        if let Some(file_path) = safe_resolve_relative(workspace_root, rel) {
            let mut cursor = file_path.parent();
            while let Some(dir) = cursor {
                if dir.join("Cargo.toml").is_file() {
                    return Some(dir.to_path_buf());
                }
                if dir == workspace_root {
                    break;
                }
                cursor = dir.parent();
            }
        }
    }

    if workspace_root.join("Cargo.toml").is_file() {
        return Some(workspace_root.to_path_buf());
    }
    None
}

fn resolve_standalone_rs_file(
    workspace_root: &Path,
    active_file: Option<&str>,
) -> Result<PathBuf, String> {
    if let Some(rel) = active_file {
        if let Some(candidate) = safe_resolve_relative(workspace_root, rel) {
            if candidate.is_file()
                && candidate
                    .extension()
                    .and_then(|e| e.to_str())
                    .is_some_and(|e| e.eq_ignore_ascii_case("rs"))
            {
                return Ok(candidate);
            }
        }
    }

    for common in ["main.rs", "src/main.rs", "app.rs", "src/app.rs"] {
        let candidate = workspace_root.join(common);
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    let mut rs_files = Vec::<PathBuf>::new();
    for dir in [workspace_root.to_path_buf(), workspace_root.join("src")] {
        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_file()
                    && p.extension()
                        .and_then(|e| e.to_str())
                        .is_some_and(|e| e.eq_ignore_ascii_case("rs"))
                {
                    rs_files.push(p);
                }
            }
        }
    }
    rs_files.sort();
    if let Some(with_main) = rs_files.iter().find(|p| {
        fs::read_to_string(p)
            .map(|c| c.contains("fn main"))
            .unwrap_or(false)
    }) {
        return Ok(with_main.clone());
    }
    if let Some(first) = rs_files.into_iter().next() {
        return Ok(first);
    }

    Err(String::from(
        "No Cargo.toml found in workspace. Open a `.rs` file to run it directly with `rustc`, or create a `Cargo.toml`.",
    ))
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
        let mut cmd = Command::new("taskkill");
        configure_background_command(&mut cmd);
        let _ = cmd
            .args(["/PID", &pid_str, "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }

    if let Ok(mut guard) = child.lock() {
        let _ = guard.kill();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runs_standalone_rs_file_with_rustc_when_cargo_toml_is_absent() {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir_name = format!("anar-rustc-run-{}-{nanos}", std::process::id());
        let dir = std::env::temp_dir().join(dir_name);
        let src_dir = dir.join("src");
        fs::create_dir_all(&src_dir).unwrap();
        fs::write(
            src_dir.join("app.rs"),
            "fn main() {\n    println!(\"hello from standalone rustc\");\n}\n",
        )
        .unwrap();

        let manager = Arc::new(RunnerManager::new());
        let events = Arc::new(Mutex::new(Vec::<RunnerEvent>::new()));
        let events_cb = Arc::clone(&events);

        let run_id = manager
            .start_run_with_backend_and_file(
                &dir,
                RunnerAction::Run,
                CompilerBackend::Cargo,
                Some("src/app.rs"),
                move |evt| {
                    if let Ok(mut guard) = events_cb.lock() {
                        guard.push(evt);
                    }
                },
            )
            .expect("start rustc run");

        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
        loop {
            let done = events
                .lock()
                .map(|g| g.iter().any(|e| matches!(e, RunnerEvent::Finished { .. })))
                .unwrap_or(false);
            if done || std::time::Instant::now() >= deadline {
                break;
            }
            thread::sleep(std::time::Duration::from_millis(25));
        }

        let captured = events.lock().unwrap().clone();
        assert!(captured.iter().any(|e| matches!(
            e,
            RunnerEvent::Started {
                run_id: id,
                command,
                ..
            } if *id == run_id && command.contains("rustc")
        )));
        assert!(captured.iter().any(|e| matches!(
            e,
            RunnerEvent::Output {
                stream: OutputStream::Stdout,
                line,
                ..
            } if line.contains("hello from standalone rustc")
        )));
        assert!(captured.iter().any(|e| matches!(
            e,
            RunnerEvent::Finished {
                exit_code: Some(0),
                cancelled: false,
                ..
            }
        )));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn check_standalone_rs_file_emits_rustc_diagnostics() {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir_name = format!("anar-rustc-chk-{}-{nanos}", std::process::id());
        let dir = std::env::temp_dir().join(dir_name);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("broken.rs"), "fn main() { let x: i32 = \"oops\"; }\n").unwrap();

        let manager = Arc::new(RunnerManager::new());
        let events = Arc::new(Mutex::new(Vec::<RunnerEvent>::new()));
        let events_cb = Arc::clone(&events);

        manager
            .start_run_with_backend_and_file(
                &dir,
                RunnerAction::Check,
                CompilerBackend::Cargo,
                Some("broken.rs"),
                move |evt| {
                    if let Ok(mut guard) = events_cb.lock() {
                        guard.push(evt);
                    }
                },
            )
            .expect("start rustc check");

        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
        loop {
            let done = events
                .lock()
                .map(|g| g.iter().any(|e| matches!(e, RunnerEvent::Finished { .. })))
                .unwrap_or(false);
            if done || std::time::Instant::now() >= deadline {
                break;
            }
            thread::sleep(std::time::Duration::from_millis(25));
        }

        let captured = events.lock().unwrap().clone();
        assert!(captured.iter().any(|e| matches!(e, RunnerEvent::Diagnostic { .. })));
        assert!(captured.iter().any(|e| matches!(
            e,
            RunnerEvent::Finished {
                exit_code: Some(code),
                ..
            } if *code != 0
        )));

        let _ = fs::remove_dir_all(&dir);
    }
}
