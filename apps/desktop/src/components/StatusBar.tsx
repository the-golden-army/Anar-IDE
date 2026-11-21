import { CheckCircle2, GitBranch, RefreshCw, Settings } from 'lucide-react';
import { ANAR_VERSION_LABEL } from './sampleWorkspace';
import { languageLabelFor } from './editor/codemirrorTheme';
import type { DetectedFramework } from '../types/frameworks';
import type { LspStatusEvent } from '../types/lsp';
import type { CompilerBackend } from '../types/preferences';
import type { EditorTab } from '../types/workspace';

interface StatusBarProps {
  activeTab: EditorTab | null;
  branchName: string | null;
  statusMessage: string | null;
  isRunning: boolean;
  compilerBackend: CompilerBackend;
  lspStatus: LspStatusEvent;
  detectedFrameworks: DetectedFramework[];
  isNarrow: boolean;
  onRefreshGit: () => void;
  onOpenInspector: () => void;
  onOpenSettings: () => void;
}

export function StatusBar({
  activeTab,
  branchName,
  statusMessage,
  isRunning,
  compilerBackend,
  lspStatus,
  detectedFrameworks,
  isNarrow,
  onRefreshGit,
  onOpenInspector,
  onOpenSettings,
}: StatusBarProps) {
  const lspReadyColor =
    lspStatus.status === 'crashed' || lspStatus.status === 'unavailable'
      ? 'text-[var(--status-warn)]'
      : 'text-[var(--status-ok)]';

  const lspTitle =
    lspStatus.status === 'stopped'
      ? 'Rust Analyzer'
      : lspStatus.detail
        ? `Rust Analyzer (${lspStatus.status}: ${lspStatus.detail})`
        : `Rust Analyzer (${lspStatus.status})`;

  return (
    <footer
      data-testid="statusbar"
      data-backend={compilerBackend}
      className="flex h-[var(--statusbar-height)] shrink-0 items-center justify-between gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-rail)] px-3 text-xs text-[var(--text-secondary)] select-none"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="inline-flex shrink-0 items-center gap-1.5 font-medium text-[var(--text-primary)]">
          <GitBranch className="h-3 w-3 text-[var(--text-secondary)]" />
          <span>{branchName ?? 'main'}</span>
        </span>

        <button
          type="button"
          onClick={onRefreshGit}
          aria-label="Sync Git status"
          title="Refresh Git status"
          className="inline-flex h-4 w-4 items-center justify-center rounded text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          <RefreshCw className={`h-3 w-3 ${isRunning ? 'animate-spin' : ''}`} />
        </button>

        <button
          type="button"
          onClick={onOpenInspector}
          data-testid="lsp-status-label"
          data-lsp-status={lspStatus.status}
          title={lspTitle}
          className="inline-flex shrink-0 items-center gap-1.5 rounded px-1 py-0.5 transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <CheckCircle2 className={`h-3.5 w-3.5 ${lspReadyColor}`} />
          <span>Rust Analyzer</span>
        </button>

        {!isNarrow && compilerBackend === 'rusturbo' && (
          <span
            data-testid="statusbar-backend"
            className="rounded bg-[var(--accent-muted)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)]"
          >
            Rusturbo
          </span>
        )}

        {!isNarrow && detectedFrameworks.length > 0 && (
          <span
            data-testid="statusbar-frameworks"
            className="truncate rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)]"
          >
            {detectedFrameworks.map((f) => f.displayName).join(' · ')}
          </span>
        )}

        {!isNarrow && statusMessage && (
          <span className="truncate text-[var(--accent)]">{statusMessage}</span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3.5">
        {activeTab && (
          <>
            <span className="font-[family-name:var(--font-sans)] text-xs">
              Ln {activeTab.cursor.line}, Col {activeTab.cursor.col}
            </span>
            {!isNarrow && (
              <>
                <span>Spaces: 4</span>
                <span>UTF-8</span>
                <span>{activeTab.lineEnding.toUpperCase()}</span>
                <span>{languageLabelFor(activeTab.relativePath)}</span>
                {activeTab.isLargeFile && (
                  <span className="rounded bg-[var(--accent-muted)] px-1.5 text-[0.6875rem] font-medium text-[var(--accent)]">
                    Large file mode
                  </span>
                )}
              </>
            )}
          </>
        )}

        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Status bar settings"
          title="Settings"
          className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>

        <span className="font-[family-name:var(--font-sans)] text-xs text-[var(--text-secondary)]">
          {ANAR_VERSION_LABEL}
        </span>

        <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden="true" />
      </div>
    </footer>
  );
}
