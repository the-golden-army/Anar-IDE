import { AlertCircle, AlertTriangle } from 'lucide-react';
import { languageLabelFor } from './editor/codemirrorTheme';
import type { ResolvedTheme, ThemeMode } from '../types/preferences';
import type { EditorTab } from '../types/workspace';

interface StatusBarProps {
  activeTab: EditorTab | null;
  statusMessage: string | null;
  isRunning: boolean;
  errorCount: number;
  warningCount: number;
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  zoomPercent: number;
  isNarrow: boolean;
  onOpenProblems: () => void;
  onCycleTheme: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onZoomIn: () => void;
}

export function StatusBar({
  activeTab,
  statusMessage,
  isRunning,
  errorCount,
  warningCount,
  themeMode,
  resolvedTheme,
  zoomPercent,
  isNarrow,
  onOpenProblems,
  onCycleTheme,
  onZoomOut,
  onZoomReset,
  onZoomIn,
}: StatusBarProps) {
  const themeLabel =
    themeMode === 'system' ? `System (${resolvedTheme})` : themeMode === 'dark' ? 'Dark' : 'Light';

  return (
    <footer
      data-testid="statusbar"
      className="flex h-[var(--statusbar-height)] shrink-0 items-center justify-between gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-rail)] px-3 text-[11px] text-[var(--text-secondary)] select-none"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="inline-flex shrink-0 items-center gap-1.5 font-medium text-[var(--text-primary)]">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isRunning ? 'animate-pulse bg-[var(--accent)]' : 'bg-[var(--status-ok)]'
            }`}
            aria-hidden="true"
          />
          <span>Cargo</span>
        </span>

        <button
          type="button"
          onClick={onOpenProblems}
          aria-label="Open problems panel"
          title="View compiler problems"
          className="inline-flex shrink-0 items-center gap-2 rounded px-1 py-0.5 text-[11px] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <span
            className={`inline-flex items-center gap-1 ${
              errorCount > 0 ? 'text-[var(--status-err)]' : ''
            }`}
          >
            <AlertCircle className="h-3 w-3" />
            <span>{errorCount}</span>
          </span>
          <span
            className={`inline-flex items-center gap-1 ${
              warningCount > 0 ? 'text-[var(--status-warn)]' : ''
            }`}
          >
            <AlertTriangle className="h-3 w-3" />
            <span>{warningCount}</span>
          </span>
        </button>

        {!isNarrow && statusMessage && (
          <span className="truncate text-[var(--accent)]">{statusMessage}</span>
        )}
        {!isNarrow && !statusMessage && (
          <span className="truncate text-[var(--text-muted)]">rust-analyzer: idle</span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {activeTab && (
          <>
            <span className="font-[family-name:var(--font-mono)] text-[11px]">
              Ln {activeTab.cursor.line}, Col {activeTab.cursor.col}
            </span>
            {!isNarrow && (
              <>
                <span className="uppercase">{activeTab.lineEnding}</span>
                <span>{languageLabelFor(activeTab.relativePath)}</span>
                {activeTab.isLargeFile && (
                  <span className="rounded bg-[var(--accent-muted)] px-1.5 text-[10px] font-medium text-[var(--accent)]">
                    Large file mode
                  </span>
                )}
              </>
            )}
          </>
        )}

        {!isNarrow && (
          <div
            className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[11px] text-[var(--text-secondary)]"
            aria-label="Zoom controls"
          >
            <button
              type="button"
              aria-label="Zoom out"
              title="Zoom out (Ctrl/Cmd+-)"
              onClick={onZoomOut}
              className="rounded px-1 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              -
            </button>
            <button
              type="button"
              aria-label="Reset zoom"
              title="Reset zoom (Ctrl/Cmd+0)"
              onClick={onZoomReset}
              className="rounded px-1 font-[family-name:var(--font-mono)] text-[10px] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              {zoomPercent}%
            </button>
            <button
              type="button"
              aria-label="Zoom in"
              title="Zoom in (Ctrl/Cmd++)"
              onClick={onZoomIn}
              className="rounded px-1 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              +
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={onCycleTheme}
          title="Click to cycle theme (Dark / Light / System)"
          className="rounded px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          Theme: {themeLabel}
        </button>
        {!isNarrow && (
          <span className="font-[family-name:var(--font-mono)] text-[10px] text-[var(--text-muted)]">
            v0.1.0
          </span>
        )}
      </div>
    </footer>
  );
}
