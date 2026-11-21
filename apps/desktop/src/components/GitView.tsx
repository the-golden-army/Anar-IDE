import { FileDiff, GitBranch, Minus, Plus, RefreshCw } from 'lucide-react';
import type { GitChangedFile, GitDiffResult, GitStatusReport } from '../types/git';

interface GitViewProps {
  hasWorkspace: boolean;
  status: GitStatusReport | null;
  selectedDiff: GitDiffResult | null;
  isLoading: boolean;
  onRefresh: () => void;
  onSelectDiff: (entry: GitChangedFile) => void;
  onStageFile: (relPath: string) => void;
  onUnstageFile: (relPath: string) => void;
  onOpenFile: (relPath: string) => void;
}

function statusBadgeFor(entry: GitChangedFile): { label: string; colorClass: string } {
  if (entry.untracked) {
    return { label: 'U', colorClass: 'text-[var(--status-ok)]' };
  }
  const code = entry.staged ? entry.indexStatus : entry.worktreeStatus;
  if (code === 'D') {
    return { label: 'D', colorClass: 'text-[var(--status-err)]' };
  }
  if (code === 'A') {
    return { label: 'A', colorClass: 'text-[var(--status-ok)]' };
  }
  return { label: code || 'M', colorClass: 'text-[var(--status-warn)]' };
}

export function GitView({
  hasWorkspace,
  status,
  selectedDiff,
  isLoading,
  onRefresh,
  onSelectDiff,
  onStageFile,
  onUnstageFile,
  onOpenFile,
}: GitViewProps) {
  if (!hasWorkspace) {
    return (
      <div
        data-testid="git-view"
        className="flex flex-1 flex-col items-center justify-center p-5 text-center text-xs text-[var(--text-secondary)]"
      >
        <GitBranch className="h-5 w-5 text-[var(--accent)]" />
        <p className="mt-2 font-medium text-[var(--text-primary)]">Source Control</p>
        <p className="mt-1">Open a Git repository folder to inspect branch status and diffs.</p>
      </div>
    );
  }

  if (status && !status.isGitRepo) {
    return (
      <div
        data-testid="git-view"
        className="flex flex-1 flex-col items-center justify-center p-5 text-center text-xs text-[var(--text-secondary)]"
      >
        <GitBranch className="h-5 w-5 text-[var(--text-muted)]" />
        <p className="mt-2 font-medium text-[var(--text-primary)]">Not a Git Repository</p>
        <p className="mt-1">
          {status.error ?? 'Initialize Git in this workspace to track changes and view diffs.'}
        </p>
        <button
          type="button"
          onClick={onRefresh}
          className="mt-3 inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
        >
          <RefreshCw className="h-3 w-3" />
          <span>Refresh</span>
        </button>
      </div>
    );
  }

  const stagedEntries = (status?.entries ?? []).filter((e) => e.staged);
  const unstagedEntries = (status?.entries ?? []).filter((e) => !e.staged);

  return (
    <div data-testid="git-view" className="flex min-h-0 flex-1 flex-col text-xs">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
          <span className="truncate font-semibold text-[var(--text-primary)]">
            {status?.branch ?? 'Loading…'}
          </span>
          {status && (status.ahead > 0 || status.behind > 0) && (
            <span className="shrink-0 rounded bg-[var(--bg-elevated)] px-1 text-[10px] text-[var(--text-muted)]">
              +{status.ahead} -{status.behind}
            </span>
          )}
        </div>
        <button
          type="button"
          aria-label="Refresh git status"
          onClick={onRefresh}
          disabled={isLoading}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-45"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="anar-scroll flex-1 space-y-3 overflow-y-auto p-2.5">
        {status && status.entries.length === 0 ? (
          <p className="px-1 text-[var(--text-muted)]">Working tree clean.</p>
        ) : (
          <>
            {stagedEntries.length > 0 && (
              <div>
                <div className="mb-1 flex items-center justify-between px-1 text-[10px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
                  <span>Staged Changes</span>
                  <span>{stagedEntries.length}</span>
                </div>
                <ul className="space-y-0.5">
                  {stagedEntries.map((entry) => {
                    const badge = statusBadgeFor(entry);
                    return (
                      <li
                        key={`staged:${entry.relativePath}`}
                        className="flex items-center gap-1 rounded-[var(--radius-sm)] px-1.5 py-1 hover:bg-[var(--bg-hover)]"
                      >
                        <button
                          type="button"
                          onClick={() => onSelectDiff(entry)}
                          className="min-w-0 flex-1 truncate text-left text-[var(--text-primary)]"
                          title={`View staged diff for ${entry.relativePath}`}
                        >
                          {entry.relativePath}
                        </button>
                        <span
                          className={`shrink-0 font-[family-name:var(--font-mono)] text-[10px] font-semibold ${badge.colorClass}`}
                        >
                          {badge.label}
                        </span>
                        <button
                          type="button"
                          aria-label={`Unstage ${entry.relativePath}`}
                          title="Unstage"
                          onClick={() => onUnstageFile(entry.relativePath)}
                          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {unstagedEntries.length > 0 && (
              <div>
                <div className="mb-1 flex items-center justify-between px-1 text-[10px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
                  <span>Changes</span>
                  <span>{unstagedEntries.length}</span>
                </div>
                <ul className="space-y-0.5">
                  {unstagedEntries.map((entry) => {
                    const badge = statusBadgeFor(entry);
                    return (
                      <li
                        key={`unstaged:${entry.relativePath}`}
                        className="flex items-center gap-1 rounded-[var(--radius-sm)] px-1.5 py-1 hover:bg-[var(--bg-hover)]"
                      >
                        <button
                          type="button"
                          onClick={() => onSelectDiff(entry)}
                          onDoubleClick={() => onOpenFile(entry.relativePath)}
                          className="min-w-0 flex-1 truncate text-left text-[var(--text-primary)]"
                          title={`View diff for ${entry.relativePath}`}
                        >
                          {entry.relativePath}
                        </button>
                        <span
                          className={`shrink-0 font-[family-name:var(--font-mono)] text-[10px] font-semibold ${badge.colorClass}`}
                        >
                          {badge.label}
                        </span>
                        <button
                          type="button"
                          aria-label={`Stage ${entry.relativePath}`}
                          title="Stage"
                          onClick={() => onStageFile(entry.relativePath)}
                          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        )}

        {selectedDiff && (
          <div
            data-testid="git-diff-viewer"
            className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2"
          >
            <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-1">
              <div className="flex min-w-0 items-center gap-1.5 font-medium text-[var(--text-primary)]">
                <FileDiff className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                <span className="truncate">{selectedDiff.relativePath}</span>
              </div>
              <button
                type="button"
                onClick={() => onOpenFile(selectedDiff.relativePath)}
                className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-[var(--accent)] hover:bg-[var(--bg-hover)]"
              >
                Open
              </button>
            </div>
            {selectedDiff.diff.trim() === '' ? (
              <p className="text-[11px] text-[var(--text-muted)]">No textual diff available.</p>
            ) : (
              <pre className="anar-scroll max-h-56 overflow-auto font-[family-name:var(--font-mono)] text-[10px] leading-relaxed">
                {selectedDiff.diff.split('\n').map((line, idx) => {
                  const lineClass =
                    line.startsWith('+') && !line.startsWith('+++')
                      ? 'text-[var(--status-ok)]'
                      : line.startsWith('-') && !line.startsWith('---')
                        ? 'text-[var(--status-err)]'
                        : line.startsWith('@@')
                          ? 'text-[var(--accent)]'
                          : 'text-[var(--text-secondary)]';
                  return (
                    <div key={idx} className={lineClass}>
                      {line || ' '}
                    </div>
                  );
                })}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
