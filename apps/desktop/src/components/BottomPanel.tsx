import {
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  CornerDownLeft,
  FileOutput,
  Info,
  MoreHorizontal,
  Plus,
  Square,
  Terminal,
  TerminalSquare,
  Trash2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { TerminalView, type TerminalViewHandle } from './TerminalView';
import { LAYOUT_LIMITS, type BottomPanelView, type ResolvedTheme } from '../types/preferences';
import type { DiagnosticItem, OutputLine, RunnerAction } from '../types/runner';

interface BottomPanelProps {
  open: boolean;
  height: number;
  activeTab: BottomPanelView;
  workspaceKey: string | null;
  resolvedTheme: ResolvedTheme;
  outputLines: OutputLine[];
  diagnostics: DiagnosticItem[];
  isRunning: boolean;
  activeRunAction: RunnerAction | null;
  lastExitSummary: string | null;
  onClose: () => void;
  onResize: (height: number) => void;
  onSelectTab: (tab: BottomPanelView) => void;
  onClearOutput: () => void;
  onStopRun: () => void;
  onSendStdin: (input: string) => void;
  onSelectDiagnostic: (diagnostic: DiagnosticItem) => void;
}

const TABS: { id: BottomPanelView; label: string; Icon: typeof Terminal }[] = [
  { id: 'terminal', label: 'Terminal', Icon: Terminal },
  { id: 'problems', label: 'Problems', Icon: AlertCircle },
  { id: 'output', label: 'Output', Icon: FileOutput },
  { id: 'debug-console', label: 'Debug Console', Icon: TerminalSquare },
];

const SHELL_OPTIONS = ['PowerShell', 'bash', 'zsh', 'sh'] as const;

export function BottomPanel({
  open,
  height,
  activeTab,
  workspaceKey,
  resolvedTheme,
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
  const terminalRef = useRef<TerminalViewHandle | null>(null);

  const [isResizing, setIsResizing] = useState(false);
  const [stdinValue, setStdinValue] = useState('');
  const [selectedShell, setSelectedShell] = useState<string>('PowerShell');
  const [shellMenuOpen, setShellMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

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
  const badgeCount = diagnostics.length > 0 ? diagnostics.length : 0;

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

      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-3 select-none">
        <div role="tablist" aria-label="Bottom panel views" className="flex items-center gap-1.5">
          {TABS.map(({ id, label, Icon }) => {
            const selected = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onSelectTab(id)}
                className={`inline-flex h-6 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors duration-150 ${
                  selected
                    ? 'border-[var(--accent-ring)] bg-[var(--accent-muted)] text-[var(--text-primary)]'
                    : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
                {id === 'problems' && badgeCount > 0 && (
                  <span
                    className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white ${
                      errorCount > 0 ? 'bg-[var(--status-err)]' : 'bg-[var(--status-warn)]'
                    }`}
                  >
                    {badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="relative flex items-center gap-1">
          {activeTab === 'output' && isRunning && (
            <>
              <span className="mr-1 inline-flex items-center gap-1.5 text-[11px] text-[var(--accent)]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
                <span>cargo {activeRunAction}</span>
              </span>
              <button
                type="button"
                aria-label="Stop run from output"
                onClick={onStopRun}
                className="mr-1 inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-[var(--status-err)] hover:bg-[var(--status-err)]/15"
              >
                <Square className="h-3 w-3 fill-current" />
                <span>Stop</span>
              </button>
            </>
          )}
          {activeTab === 'output' && !isRunning && lastExitSummary && (
            <span className="mr-1 text-[11px] text-[var(--text-muted)]">{lastExitSummary}</span>
          )}

          <button
            type="button"
            aria-label="New terminal session"
            title="New / Restart Terminal"
            onClick={() => {
              onSelectTab('terminal');
              terminalRef.current?.restart();
            }}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            aria-label={activeTab === 'terminal' ? 'Kill terminal' : 'Clear output'}
            title={activeTab === 'terminal' ? 'Kill Terminal' : 'Clear Output'}
            onClick={() => {
              if (activeTab === 'terminal') {
                terminalRef.current?.kill();
              } else {
                onClearOutput();
              }
            }}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>

          <div className="relative">
            <button
              type="button"
              aria-label="Terminal actions menu"
              aria-expanded={moreMenuOpen}
              onClick={() => {
                setMoreMenuOpen((prev) => !prev);
                setShellMenuOpen(false);
              }}
              className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>

            <AnimatePresence>
              {moreMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.14 }}
                  className="absolute right-0 bottom-7 z-30 w-40 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-1 text-xs shadow-xl"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      terminalRef.current?.restart();
                    }}
                    className="flex w-full items-center rounded px-2 py-1.5 text-left text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                  >
                    Restart Terminal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      onClearOutput();
                    }}
                    className="flex w-full items-center rounded px-2 py-1.5 text-left text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                  >
                    Clear Output
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      onClose();
                    }}
                    className="flex w-full items-center rounded px-2 py-1.5 text-left text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                  >
                    Hide Panel
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="relative ml-1">
            <button
              type="button"
              aria-label="Select shell"
              aria-expanded={shellMenuOpen}
              onClick={() => {
                setShellMenuOpen((prev) => !prev);
                setMoreMenuOpen(false);
              }}
              className="inline-flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <span>{selectedShell}</span>
              <ChevronDown className="h-3 w-3" />
            </button>

            <AnimatePresence>
              {shellMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.14 }}
                  className="absolute right-0 bottom-7 z-30 w-32 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-1 text-xs shadow-xl"
                >
                  {SHELL_OPTIONS.map((shell) => (
                    <button
                      key={shell}
                      type="button"
                      onClick={() => {
                        setSelectedShell(shell);
                        setShellMenuOpen(false);
                        terminalRef.current?.restart();
                      }}
                      className={`flex w-full items-center rounded px-2 py-1 text-left transition-colors ${
                        selectedShell === shell
                          ? 'bg-[var(--accent-muted)] font-medium text-[var(--text-primary)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      {shell}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {activeTab === 'output' && (
        <div className="flex min-h-0 flex-1 flex-col bg-[var(--bg-editor)]">
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
          className="anar-scroll flex-1 overflow-auto bg-[var(--bg-editor)] p-2.5 text-xs text-[var(--text-secondary)]"
        >
          <div className="mb-1.5 flex items-center justify-between px-2 text-[11px] text-[var(--text-muted)]">
            <span>
              {errorCount} errors · {warningCount} warnings
            </span>
          </div>
          {diagnostics.length === 0 ? (
            <p className="px-2 py-1 font-[family-name:var(--font-mono)] leading-relaxed">
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
                      className="flex w-full items-start justify-between gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
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

      {activeTab === 'debug-console' && (
        <div
          data-testid="debug-console"
          className="anar-scroll flex-1 overflow-auto bg-[var(--bg-editor)] p-3 font-[family-name:var(--font-mono)] text-xs text-[var(--text-secondary)]"
        >
          <p>Debug Console ready. Start Run or Check to inspect target output.</p>
        </div>
      )}

      <TerminalView
        ref={terminalRef}
        active={activeTab === 'terminal'}
        workspaceKey={workspaceKey}
        resolvedTheme={resolvedTheme}
      />
    </section>
  );
}
