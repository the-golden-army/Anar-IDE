use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

/// Stream event emitted from an interactive PTY terminal session.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum PtyEvent {
    #[serde(rename_all = "camelCase")]
    Data { session_id: u64, data: Vec<u8> },
    #[serde(rename_all = "camelCase")]
    Exited {
        session_id: u64,
        exit_code: Option<u32>,
    },
}

struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

/// Manages active interactive PTY sessions across Unix PTYs and Windows ConPTY.
#[derive(Default)]
pub struct PtyManager {
    next_session_id: AtomicU64,
    sessions: Mutex<HashMap<u64, PtySession>>,
}

impl PtyManager {
    /// Creates an idle [`PtyManager`].
    pub fn new() -> Self {
        Self::default()
    }

    /// Spawns the user's configured shell inside a PTY rooted at `working_dir`.
    pub fn spawn<F>(
        self: &Arc<Self>,
        working_dir: &Path,
        cols: u16,
        rows: u16,
        emit: F,
    ) -> Result<u64, String>
    where
        F: Fn(PtyEvent) + Send + Sync + 'static,
    {
        let pty_system = native_pty_system();
        let size = PtySize {
            rows: rows.max(4),
            cols: cols.max(10),
            pixel_width: 0,
            pixel_height: 0,
        };
        let pair = pty_system
            .openpty(size)
            .map_err(|e| format!("failed to open PTY: {e}"))?;

        let shell = default_shell();
        let mut cmd = CommandBuilder::new(&shell);
        cmd.cwd(working_dir);
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("failed to spawn shell `{shell}`: {e}"))?;
        drop(pair.slave);

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("failed to open PTY reader: {e}"))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("failed to open PTY writer: {e}"))?;

        let session_id = self.next_session_id.fetch_add(1, Ordering::SeqCst) + 1;
        {
            let mut guard = self
                .sessions
                .lock()
                .map_err(|_| String::from("PTY manager lock poisoned"))?;
            guard.insert(
                session_id,
                PtySession {
                    master: pair.master,
                    writer,
                    child,
                },
            );
        }

        let manager = Arc::clone(self);
        thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        emit(PtyEvent::Data {
                            session_id,
                            data: buf[..n].to_vec(),
                        });
                    }
                }
            }

            let removed = manager
                .sessions
                .lock()
                .ok()
                .and_then(|mut guard| guard.remove(&session_id));

            let exit_code = match removed {
                Some(mut session) => session.child.wait().ok().map(|s| s.exit_code()),
                None => None,
            };

            emit(PtyEvent::Exited {
                session_id,
                exit_code,
            });
        });

        Ok(session_id)
    }

    /// Writes raw keyboard/paste bytes into an active PTY session.
    pub fn write(&self, session_id: u64, data: &str) -> Result<(), String> {
        let mut guard = self
            .sessions
            .lock()
            .map_err(|_| String::from("PTY manager lock poisoned"))?;
        let Some(session) = guard.get_mut(&session_id) else {
            return Err(format!("terminal session {session_id} is not active"));
        };
        session
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("failed to write to PTY: {e}"))?;
        session
            .writer
            .flush()
            .map_err(|e| format!("failed to flush PTY: {e}"))?;
        Ok(())
    }

    /// Resizes an active PTY session to `cols` x `rows`.
    pub fn resize(&self, session_id: u64, cols: u16, rows: u16) -> Result<(), String> {
        let guard = self
            .sessions
            .lock()
            .map_err(|_| String::from("PTY manager lock poisoned"))?;
        let Some(session) = guard.get(&session_id) else {
            return Err(format!("terminal session {session_id} is not active"));
        };
        session
            .master
            .resize(PtySize {
                rows: rows.max(4),
                cols: cols.max(10),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("failed to resize PTY: {e}"))
    }

    /// Terminates an active PTY session and returns `true` if it existed.
    pub fn kill(&self, session_id: u64) -> Result<bool, String> {
        let mut guard = self
            .sessions
            .lock()
            .map_err(|_| String::from("PTY manager lock poisoned"))?;
        let Some(session) = guard.get_mut(&session_id) else {
            return Ok(false);
        };
        let _ = session.child.kill();
        Ok(true)
    }

    /// Terminates all active PTY sessions (e.g., on workspace switch or shutdown).
    pub fn kill_all(&self) {
        if let Ok(mut guard) = self.sessions.lock() {
            for session in guard.values_mut() {
                let _ = session.child.kill();
            }
        }
    }
}

/// Resolves the default interactive shell executable for the host OS.
pub fn default_shell() -> String {
    #[cfg(windows)]
    {
        if let Some(path_var) = std::env::var_os("PATH") {
            for dir in std::env::split_paths(&path_var) {
                if dir.join("powershell.exe").is_file() {
                    return String::from("powershell.exe");
                }
            }
        }
        std::env::var("COMSPEC").unwrap_or_else(|_| String::from("cmd.exe"))
    }

    #[cfg(not(windows))]
    {
        std::env::var("SHELL")
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| String::from("/bin/sh"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_shell_is_non_empty() {
        let shell = default_shell();
        assert!(!shell.trim().is_empty());
    }

    #[test]
    fn write_and_resize_reject_unknown_session() {
        let manager = PtyManager::new();
        assert!(manager.write(999, "ls\n").is_err());
        assert!(manager.resize(999, 80, 24).is_err());
        assert!(!manager.kill(999).unwrap());
    }

    #[test]
    fn spawns_pty_session_and_exits_on_command() {
        let manager = Arc::new(PtyManager::new());
        let events = Arc::new(Mutex::new(Vec::<PtyEvent>::new()));
        let events_cb = Arc::clone(&events);

        let cwd = std::env::temp_dir();
        let session_id = manager
            .spawn(&cwd, 80, 24, move |evt| {
                if let Ok(mut guard) = events_cb.lock() {
                    guard.push(evt);
                }
            })
            .expect("spawn PTY shell");

        manager.resize(session_id, 100, 30).expect("resize PTY");
        manager.write(session_id, "exit\r\n").expect("write exit");

        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(8);
        loop {
            let done = events
                .lock()
                .map(|g| g.iter().any(|e| matches!(e, PtyEvent::Exited { .. })))
                .unwrap_or(false);
            if done || std::time::Instant::now() >= deadline {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(30));
        }

        let captured = events.lock().unwrap();
        assert!(captured.iter().any(|e| matches!(
            e,
            PtyEvent::Exited {
                session_id: id,
                ..
            } if *id == session_id
        )));
    }
}
