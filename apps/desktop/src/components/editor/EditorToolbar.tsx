import { Bug, Hammer, Play, RefreshCw, Save, Square } from 'lucide-react';
import type { CompilerBackend } from '../../types/preferences';
import type { RunnerAction } from '../../types/runner';

interface EditorToolbarProps {
  hasWorkspace: boolean;
  hasUnsavedActiveTab: boolean;
  isRunning: boolean;
  activeRunAction: RunnerAction | null;
  compilerBackend: CompilerBackend;
  onRunAction: (action: RunnerAction) => void;
  onStopRun: () => void;
  onDebugAction: () => void;
  onSaveActive: () => void;
}

export function EditorToolbar({
  hasWorkspace,
  hasUnsavedActiveTab,
  isRunning,
  activeRunAction,
  compilerBackend,
  onRunAction,
  onStopRun,
  onDebugAction,
  onSaveActive,
}: EditorToolbarProps) {
  const backendLabel = compilerBackend === 'rusturbo' ? 'Rusturbo' : 'Cargo';

  return (
    <div
      data-testid="editor-toolbar"
      className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-editor)] px-3 select-none"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={!hasWorkspace}
          onClick={() => onRunAction('run')}
          title={hasWorkspace ? `${backendLabel} Run (F5)` : 'Open a Cargo project first'}
          aria-label="Run project"
          className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors duration-150 ${
            !hasWorkspace
              ? 'cursor-not-allowed border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)] opacity-55'
              : isRunning && activeRunAction === 'run'
                ? 'border-[var(--accent-ring)] bg-[var(--accent-muted)] text-[var(--text-primary)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          <Play className="h-3 w-3 text-[var(--text-secondary)]" />
          <span>Run</span>
        </button>

        <button
          type="button"
          disabled={!hasWorkspace}
          onClick={() => onRunAction('build')}
          title={`${backendLabel} Build (Ctrl/Cmd+Shift+B)`}
          aria-label="Build project"
          className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors duration-150 ${
            !hasWorkspace
              ? 'cursor-not-allowed border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)] opacity-55'
              : isRunning && activeRunAction === 'build'
                ? 'border-[var(--accent-ring)] bg-[var(--accent-muted)] text-[var(--text-primary)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          <Hammer className="h-3 w-3 text-[var(--text-secondary)]" />
          <span>Build</span>
        </button>

        <button
          type="button"
          disabled={!hasWorkspace}
          onClick={() => onRunAction('check')}
          title="Cargo Check"
          aria-label="Check project"
          className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors duration-150 ${
            !hasWorkspace
              ? 'cursor-not-allowed border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)] opacity-55'
              : isRunning && activeRunAction === 'check'
                ? 'border-[var(--accent-ring)] bg-[var(--accent-muted)] text-[var(--text-primary)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          <RefreshCw className="h-3 w-3 text-[var(--text-secondary)]" />
          <span>Check</span>
        </button>

        <button
          type="button"
          onClick={onDebugAction}
          title="Debug / Open Debug Console"
          aria-label="Debug project"
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 text-xs font-medium text-[var(--text-primary)] transition-colors duration-150 hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
        >
          <Bug className="h-3 w-3 text-[var(--text-secondary)]" />
          <span>Debug</span>
        </button>

        <button
          type="button"
          disabled={!isRunning}
          onClick={onStopRun}
          title="Stop running process (Shift+F5)"
          aria-label="Stop running process"
          className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors duration-150 ${
            isRunning
              ? 'border-[var(--status-err)]/40 bg-[var(--status-err)]/15 text-[var(--status-err)] hover:bg-[var(--status-err)]/25'
              : 'cursor-not-allowed border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)] opacity-50'
          }`}
        >
          <Square className="h-3 w-3" />
          <span>Stop</span>
        </button>
      </div>

      {hasUnsavedActiveTab && (
        <button
          type="button"
          onClick={onSaveActive}
          title="Save active file (Ctrl/Cmd+S)"
          aria-label="Save active file"
          className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[var(--accent-strong)] px-2.5 text-xs font-medium text-white transition-colors duration-150 hover:bg-[var(--accent)]"
        >
          <Save className="h-3 w-3" />
          <span>Save</span>
        </button>
      )}
    </div>
  );
}
