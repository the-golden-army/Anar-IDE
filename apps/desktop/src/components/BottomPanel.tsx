import {
  AlertCircle,
  AlertTriangle,
  CornerDownLeft,
  Info,
  Square,
  Terminal,
  TerminalSquare,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { LAYOUT_LIMITS, type BottomTab } from '../types/preferences';
import type { DiagnosticItem, OutputLine, RunnerAction } from '../types/runner';

interface BottomPanelProps {
  open: boolean;
  height: number;
  activeTab: BottomTab;
  outputLines: OutputLine[];
  diagnostics: DiagnosticItem[];
  isRunning: boolean;
  activeRunAction: RunnerAction | null;
  lastExitSummary: string | null;
  onClose: () => void;
  onResize: (height: number) => void;
  onSelectTab: (tab: BottomTab) => void;
  onClearOutput: () => void;
  onStopRun: () => void;
  onSendStdin: (input: string) => void;
  onSelectDiagnostic: (diagnostic: DiagnosticItem) => void;
}

const TABS: { id: BottomTab; label: string; Icon: typeof Terminal }[] = [
  { id: 'output', label: 'Output', Icon: TerminalSquare },
  { id: 'problems', label: 'Problems', Icon: AlertTriangle },
  { id: 'terminal', label: 'Terminal', Icon: Terminal },
];

export function BottomPanel({
  open,
  height,
  activeTab,
  outputLines,
  diagnostics,
  isRunning,
  activeRunAction,
  lastExitSummary,
  onClose,
  onResize,
  onSelectTab,
  onClearOutput,
  onStopRun,
  onSendStdin,
  onSelectDiagnostic,
}: BottomPanelProps) {
  const startYRef = useRef(0);
  const startHeightRef = useRef(height);
  const outputEndRef = useRef<HTMLDivElement | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [stdinValue, setStdinValue] = useState('');

  useEffect(() => {
    if (activeTab === 'output' && outputEndRef.current?.scrollIntoView) {
      outputEndRef.current.scrollIntoView({ block: 'end' });
    }
  }, [activeTab, outputLines.length]);

  if (!open) {
    return null;
  }

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    startYRef.current = event.clientY;
    startHeightRef.current = height;
    setIsResizing(true);
    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const onMove = (moveEvent: PointerEvent) => {
      const delta = startYRef.current - moveEvent.clientY;
      const next = Math.min(
        LAYOUT_LIMITS.maxBottomHeight,
        Math.max(LAYOUT_LIMITS.minBottomHeight, startHeightRef.current + delta),
      );
      onResize(next);
    };

    const onUp = () => {
      setIsResizing(false);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleStdinSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSendStdin(stdinValue);
    setStdinValue('');
  };

  return (
    <section
      aria-label="Bottom panel"
      data-testid="bottom-panel"
      style={{ height: `${height}px` }}
      className="relative flex max-h-[45%] min-h-[120px] shrink-0 flex-col border-t border-[var(--border-subtle)] bg-[var(--bg-panel)]"
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize bottom panel"
        onPointerDown={handlePointerDown}
        className="group absolute -top-1 right-0 left-0 z-10 flex h-2 cursor-row-resize touch-none items-center"
      >
        <span
          className={`h-0.5 w-full transition-colors duration-150 ${
            isResizing ? 'bg-[var(--accent)]' : 'bg-transparent group-hover:bg-[var(--accent)]'
          }`}
        />
      </div>

      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-3">
        <div role="tablist" aria-label="Bottom panel views" className="flex items-center gap-1">
          {TABS.map(({ id, label, Icon }) => {
            const selected = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onSelectTab(id)}
                className={`inline-flex h-6 items-center gap-1.5 rounded-[var(--radius-sm)] px-2 text-xs font-medium transition-colors ${
                  selected
                    ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
                {id === 'problems' && diagnostics.length > 0 && (
                  <span
                    className={`rounded-full px-1.5 text-[10px] font-semibold ${
                      errorCount > 0
                        ? 'bg-[var(--status-err)]/20 text-[var(--status-err)]'
                        : 'bg-[var(--status-warn)]/20 text-[var(--status-warn)]'
                    }`}
                  >
                    {diagnostics.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          {activeTab === 'output' && (
            <>
              {isRunning && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--accent)]">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
                  <span>cargo {activeRunAction}</span>
                </span>
              )}
              {!isRunning && lastExitSummary && (
                <span className="text-[11px] text-[var(--text-muted)]">{lastExitSummary}</span>
              )}
              {isRunning && (
                <button
                  type="button"
                  aria-label="Stop run from output"
                  title="Stop running process"
                  onClick={onStopRun}
                  className="inline-flex h-6 items-center gap-1 rounded-[var(--radius-sm)] px-1.5 text-[11px] text-[var(--status-err)] hover:bg-[var(--status-err)]/15"
                >
                  <Square className="h-3 w-3 fill-current" />
                  <span>Stop</span>
                </button>
              )}
              <button
                type="button"
                aria-label="Clear output"
                title="Clear output"
                onClick={onClearOutput}
                className="inline-flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}

          {activeTab === 'problems' && (
            <span className="text-[11px] text-[var(--text-muted)]">
              {errorCount} errors · {warningCount} warnings
            </span>
          )}

          <button
            type="button"
            aria-label="Close bottom panel"
            onClick={onClose}
            className="inline-flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {activeTab === 'output' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            data-testid="runner-output"
            className="anar-scroll flex-1 overflow-auto p-3 font-[family-name:var(--font-mono)] text-xs"
          >
            {outputLines.length === 0 ? (
              <p className="leading-relaxed text-[var(--text-secondary)]">
                Run Cargo Build, Run, Check, or Test to stream live compiler and application output
                here.
              </p>
            ) : (
              <div className="space-y-0.5">
                {outputLines.map((entry) => (
                  <div
                    key={entry.id}
                    className={`break-words whitespace-pre-wrap ${
                      entry.stream === 'system'
                        ? 'font-medium text-[var(--accent)]'
                        : entry.stream === 'stderr'
                          ? 'text-[var(--text-secondary)]'
                          : 'text-[var(--text-primary)]'
                    }`}
                  >
                    {entry.text}
                  </div>
                ))}
                <div ref={outputEndRef} />
              </div>
            )}
          </div>

          {isRunning && (
            <form
              onSubmit={handleStdinSubmit}
              className="flex shrink-0 items-center gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-1.5"
            >
              <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--accent)]">
                &gt;
              </span>
              <input
                type="text"
                value={stdinValue}
                onChange={(e) => setStdinValue(e.target.value)}
                placeholder="Type input for running process and press Enter..."
                aria-label="Process stdin input"
                className="min-w-0 flex-1 bg-transparent font-[family-name:var(--font-mono)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
              />
              <button
                type="submit"
                aria-label="Send stdin"
                className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <CornerDownLeft className="h-3 w-3" />
                <span>Send</span>
              </button>
            </form>
          )}
        </div>
      )}

      {activeTab === 'problems' && (
        <div
          data-testid="problems-list"
          className="anar-scroll flex-1 overflow-auto p-2 text-xs text-[var(--text-secondary)]"
        >
          {diagnostics.length === 0 ? (
            <p className="p-1 font-[family-name:var(--font-mono)] leading-relaxed">
              No compiler errors or warnings. Run Check or Build to inspect diagnostics.
            </p>
          ) : (
            <ul className="space-y-1">
              {diagnostics.map((diag, idx) => {
                const span = diag.primarySpan;
                const Icon =
                  diag.severity === 'error'
                    ? AlertCircle
                    : diag.severity === 'warning'
                      ? AlertTriangle
                      : Info;
                const colorClass =
                  diag.severity === 'error'
                    ? 'text-[var(--status-err)]'
                    : diag.severity === 'warning'
                      ? 'text-[var(--status-warn)]'
                      : 'text-[var(--status-info)]';
                return (
                  <li key={`${diag.message}-${idx}`}>
                    <button
                      type="button"
                      onClick={() => onSelectDiagnostic(diag)}
                      className="flex w-full items-start justify-between gap-3 rounded-[var(--radius-sm)] px-2 py-1.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
                    >
                      <div className="flex min-w-0 items-start gap-2">
                        <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${colorClass}`} />
                        <div className="min-w-0">
                          <div className="font-medium text-[var(--text-primary)]">
                            {diag.code ? `[${diag.code}] ` : ''}
                            {diag.message}
                          </div>
                          {span?.label && (
                            <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                              {span.label}
                            </div>
                          )}
                        </div>
                      </div>
                      {span && (
                        <span className="shrink-0 font-[family-name:var(--font-mono)] text-[11px] text-[var(--text-muted)]">
                          {span.fileName}:{span.lineStart}:{span.columnStart}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {activeTab === 'terminal' && (
        <div className="anar-scroll flex-1 overflow-auto p-3 font-[family-name:var(--font-mono)] text-xs text-[var(--text-secondary)]">
          <p className="leading-relaxed">
            Integrated cross-platform PTY terminal powered by portable-pty and xterm.js (Phase 8).
          </p>
        </div>
      )}
    </section>
  );
}
