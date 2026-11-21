import { FitAddon } from '@xterm/addon-fit';
import { Terminal as XTerm } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { RotateCw, Square, Terminal } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isTauriRuntime } from '../services/preferencesClient';
import { killPty, resizePty, spawnPty, writePty } from '../services/ptyClient';
import type { ResolvedTheme } from '../types/preferences';
import type { PtyEvent } from '../types/pty';

interface TerminalViewProps {
  active: boolean;
  workspaceKey: string | null;
  resolvedTheme: ResolvedTheme;
}

export function TerminalView({ active, workspaceKey, resolvedTheme }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<number | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 12,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      theme:
        resolvedTheme === 'light'
          ? {
              background: '#f8fafc',
              foreground: '#0f172a',
              cursor: '#2563eb',
            }
          : {
              background: '#11161d',
              foreground: '#e5e7eb',
              cursor: '#60a5fa',
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
    // Mount once; theme updates are applied in a dedicated effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!termRef.current) return;
    termRef.current.options.theme =
      resolvedTheme === 'light'
        ? { background: '#f8fafc', foreground: '#0f172a', cursor: '#2563eb' }
        : { background: '#11161d', foreground: '#e5e7eb', cursor: '#60a5fa' };
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
    // Restart shell only when opened workspace changes while terminal is active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceKey]);

  return (
    <div
      data-testid="terminal-view"
      className={`flex min-h-0 flex-1 flex-col ${active ? '' : 'hidden'}`}
    >
      <div className="flex h-7 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 text-[11px] text-[var(--text-secondary)]">
        <div className="flex items-center gap-1.5">
          <Terminal className="h-3 w-3 text-[var(--accent)]" />
          <span>{sessionId !== null ? `Shell session #${sessionId}` : 'Shell idle'}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Restart terminal"
            onClick={() => void startSession()}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <RotateCw className="h-3 w-3" />
            <span>Restart</span>
          </button>
          {sessionId !== null && (
            <button
              type="button"
              aria-label="Kill terminal"
              onClick={() => {
                const sid = sessionIdRef.current;
                if (sid !== null) {
                  sessionIdRef.current = null;
                  setSessionId(null);
                  void killPty(sid).catch(() => {});
                }
              }}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[var(--status-err)] hover:bg-[var(--status-err)]/15"
            >
              <Square className="h-2.5 w-2.5 fill-current" />
              <span>Kill</span>
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="border-b border-[var(--status-err)] bg-[var(--bg-elevated)] px-3 py-1 text-[11px] text-[var(--status-err)]">
          {errorMsg}
        </div>
      )}

      <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden p-1" />
    </div>
  );
}
