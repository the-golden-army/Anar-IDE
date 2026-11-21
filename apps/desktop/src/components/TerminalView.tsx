import { FitAddon } from '@xterm/addon-fit';
import { Terminal as XTerm } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { isTauriRuntime } from '../services/preferencesClient';
import { killPty, resizePty, spawnPty, writePty } from '../services/ptyClient';
import type { ResolvedTheme } from '../types/preferences';
import type { PtyEvent } from '../types/pty';

export interface TerminalViewHandle {
  restart: () => void;
  kill: () => void;
}

interface TerminalViewProps {
  active: boolean;
  workspaceKey: string | null;
  resolvedTheme: ResolvedTheme;
}

export const TerminalView = forwardRef<TerminalViewHandle, TerminalViewProps>(function TerminalView(
  { active, workspaceKey, resolvedTheme },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<number | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const isTauri = isTauriRuntime();

  const startSession = useCallback(async () => {
    if (!isTauriRuntime()) {
      return;
    }
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) {
      return;
    }
    setErrorMsg(null);

    if (sessionIdRef.current !== null) {
      const prevId = sessionIdRef.current;
      sessionIdRef.current = null;
      setSessionId(null);
      await killPty(prevId).catch(() => {});
    }

    try {
      fit.fit();
    } catch {
      // Ignore layout fit errors before container has non-zero dimensions.
    }
    const cols = Math.max(20, term.cols || 80);
    const rows = Math.max(6, term.rows || 24);

    try {
      const id = await spawnPty(cols, rows, (evt: PtyEvent) => {
        if (evt.type === 'data') {
          term.write(new Uint8Array(evt.data));
        } else if (evt.type === 'exited') {
          if (sessionIdRef.current === evt.sessionId) {
            sessionIdRef.current = null;
            setSessionId(null);
          }
          term.writeln(`\r\n[shell exited (${evt.exitCode ?? '?'})]`);
        }
      });
      sessionIdRef.current = id;
      setSessionId(id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const killSession = useCallback(() => {
    const sid = sessionIdRef.current;
    if (sid !== null) {
      sessionIdRef.current = null;
      setSessionId(null);
      void killPty(sid).catch(() => {});
    }
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      restart: () => {
        void startSession();
      },
      kill: killSession,
    }),
    [killSession, startSession],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 12,
      fontFamily:
        'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      theme:
        resolvedTheme === 'light'
          ? {
              background: '#ffffff',
              foreground: '#141224',
              cursor: '#7c3aed',
            }
          : {
              background: '#09080e',
              foreground: '#e5e7eb',
              cursor: '#8b5cf6',
            },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);

    try {
      term.open(container);
      fit.fit();
    } catch {
      // Gracefully skip canvas setup in headless test environments.
    }

    termRef.current = term;
    fitRef.current = fit;

    const dataDisposable = term.onData((data) => {
      const sid = sessionIdRef.current;
      if (sid !== null) {
        void writePty(sid, data).catch(() => {});
      }
    });

    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            try {
              fit.fit();
              const sid = sessionIdRef.current;
              if (sid !== null && term.cols > 0 && term.rows > 0) {
                void resizePty(sid, term.cols, term.rows).catch(() => {});
              }
            } catch {
              // Ignore zero-size container errors.
            }
          })
        : null;
    observer?.observe(container);

    return () => {
      observer?.disconnect();
      dataDisposable.dispose();
      const sid = sessionIdRef.current;
      sessionIdRef.current = null;
      if (sid !== null) {
        void killPty(sid).catch(() => {});
      }
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!termRef.current) return;
    termRef.current.options.theme =
      resolvedTheme === 'light'
        ? { background: '#ffffff', foreground: '#141224', cursor: '#7c3aed' }
        : { background: '#09080e', foreground: '#e5e7eb', cursor: '#8b5cf6' };
  }, [resolvedTheme]);

  useEffect(() => {
    if (!active) return;
    try {
      fitRef.current?.fit();
      const sid = sessionIdRef.current;
      const term = termRef.current;
      if (sid !== null && term && term.cols > 0 && term.rows > 0) {
        void resizePty(sid, term.cols, term.rows).catch(() => {});
      }
    } catch {
      // Ignore layout fit errors.
    }
    if (isTauriRuntime() && sessionIdRef.current === null) {
      void startSession();
    }
  }, [active, startSession]);

  useEffect(() => {
    if (workspaceKey !== null && active && isTauriRuntime()) {
      void startSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceKey]);

  return (
    <div
      data-testid="terminal-view"
      data-session-id={sessionId ?? ''}
      className={`relative flex min-h-0 flex-1 flex-col bg-[var(--bg-editor)] ${active ? '' : 'hidden'}`}
    >
      {errorMsg && (
        <div className="border-b border-[var(--status-err)] bg-[var(--bg-elevated)] px-3 py-1 text-[11px] text-[var(--status-err)]">
          {errorMsg}
        </div>
      )}

      {!isTauri && (
        <div className="anar-scroll flex-1 overflow-auto p-3 font-[family-name:var(--font-mono)] text-xs leading-relaxed">
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--status-ok)]">▸</span>
            <span className="text-amber-400">PS</span>
            <span className="text-[var(--text-secondary)]">C:\Users\Nour\rust-project&gt;</span>
            <span className="text-[var(--text-primary)]">cargo run</span>
          </div>
          <div className="pl-6 text-[var(--status-ok)]">
            Compiling <span className="text-[var(--text-secondary)]">rust-project v0.1.0</span>
          </div>
          <div className="pl-6 text-[var(--status-ok)]">
            Finished{' '}
            <span className="text-[var(--text-secondary)]">
              `dev` profile [unoptimized + debuginfo] target(s) in 0.48s
            </span>
          </div>
          <div className="pl-6 text-[var(--status-ok)]">
            Running{' '}
            <span className="text-[var(--text-secondary)]">`target\debug\rust-project.exe`</span>
          </div>
          <div className="mt-1 text-[var(--text-primary)]">Hello from Anar!</div>
          <div className="text-[var(--text-primary)]">Give me a value:</div>
          <div className="mt-0.5 inline-block h-3.5 w-2 border border-[var(--text-secondary)] align-middle" />
        </div>
      )}

      <div
        ref={containerRef}
        className={`min-h-0 flex-1 overflow-hidden px-2 py-1 ${isTauri ? '' : 'hidden'}`}
      />
    </div>
  );
});
