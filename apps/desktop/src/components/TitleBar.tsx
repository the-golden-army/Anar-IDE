import {
  CheckCircle2,
  FlaskConical,
  FolderOpen,
  Hammer,
  Maximize2,
  Minimize2,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Play,
  Save,
  Square,
} from 'lucide-react';
import { ThemeSwitcher } from './ThemeSwitcher';
import type { ThemeMode } from '../types/preferences';
import type { RunnerAction } from '../types/runner';

interface TitleBarProps {
  workspaceName: string | null;
  hasUnsavedActiveTab: boolean;
  isRunning: boolean;
  activeRunAction: RunnerAction | null;
  themeMode: ThemeMode;
  sidebarOpen: boolean;
  bottomPanelOpen: boolean;
  inspectorOpen: boolean;
  isFullscreen: boolean;
  isNarrow: boolean;
  onOpenFolder: () => void;
  onSaveActive: () => void;
  onRunAction: (action: RunnerAction) => void;
  onStopRun: () => void;
  onThemeChange: (mode: ThemeMode) => void;
  onThemeCycle: () => void;
  onToggleSidebar: () => void;
  onToggleBottomPanel: () => void;
  onToggleInspector: () => void;
  onToggleFullscreen: () => void;
}

export function TitleBar({
  workspaceName,
  hasUnsavedActiveTab,
  isRunning,
  activeRunAction,
  themeMode,
  sidebarOpen,
  bottomPanelOpen,
  inspectorOpen,
  isFullscreen,
  isNarrow,
  onOpenFolder,
  onSaveActive,
  onRunAction,
  onStopRun,
  onThemeChange,
  onThemeCycle,
  onToggleSidebar,
  onToggleBottomPanel,
  onToggleInspector,
  onToggleFullscreen,
}: TitleBarProps) {
  const hasWorkspace = workspaceName !== null;
  return (
    <header
      className="flex h-[var(--titlebar-height)] shrink-0 items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-rail)] px-3 select-none"
      data-testid="titlebar"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <div
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent)] text-xs font-bold text-[var(--text-on-accent)]"
          aria-hidden="true"
        >
          A
        </div>
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="text-sm font-semibold tracking-tight text-[var(--text-primary)]">
            Anar
          </span>
          {!isNarrow && (
            <span className="truncate text-xs text-[var(--text-muted)]">
              {workspaceName ?? 'No project open'}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenFolder}
          title="Open Folder (Ctrl/Cmd+O)"
          aria-label="Open folder"
          className="inline-flex h-7 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
        >
          <FolderOpen className="h-3.5 w-3.5 text-[var(--accent)]" />
          {!isNarrow && <span>Open</span>}
        </button>

        {hasUnsavedActiveTab && (
          <button
            type="button"
            onClick={onSaveActive}
            title="Save active file (Ctrl/Cmd+S)"
            aria-label="Save active file"
            className="inline-flex h-7 items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] px-2.5 text-xs font-semibold text-[var(--text-on-accent)] transition-colors hover:bg-[var(--accent-hover)]"
          >
            <Save className="h-3.5 w-3.5" />
            {!isNarrow && <span>Save</span>}
          </button>
        )}

        {!isNarrow && (
          <div
            className="mr-1 flex items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-input)] p-0.5"
            aria-label="Cargo build actions"
          >
            <button
              type="button"
              disabled={!hasWorkspace}
              onClick={() => onRunAction('run')}
              title={hasWorkspace ? 'Cargo Run (F5)' : 'Open a Cargo project first'}
              aria-label="Run project"
              className={`inline-flex h-6 items-center gap-1 rounded-[var(--radius-sm)] px-2 text-xs font-medium transition-colors ${
                !hasWorkspace
                  ? 'cursor-not-allowed text-[var(--text-muted)] opacity-50'
                  : isRunning && activeRunAction === 'run'
                    ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                    : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              <Play className="h-3 w-3 text-[var(--status-ok)]" />
              <span>Run</span>
            </button>
            <button
              type="button"
              disabled={!hasWorkspace}
              onClick={() => onRunAction('build')}
              title="Cargo Build (Ctrl/Cmd+Shift+B)"
              aria-label="Build project"
              className={`inline-flex h-6 items-center gap-1 rounded-[var(--radius-sm)] px-1.5 text-xs transition-colors ${
                !hasWorkspace
                  ? 'cursor-not-allowed text-[var(--text-muted)] opacity-50'
                  : isRunning && activeRunAction === 'build'
                    ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Hammer className="h-3 w-3" />
              <span>Build</span>
            </button>
            <button
              type="button"
              disabled={!hasWorkspace}
              onClick={() => onRunAction('check')}
              title="Cargo Check"
              aria-label="Check project"
              className={`inline-flex h-6 items-center gap-1 rounded-[var(--radius-sm)] px-1.5 text-xs transition-colors ${
                !hasWorkspace
                  ? 'cursor-not-allowed text-[var(--text-muted)] opacity-50'
                  : isRunning && activeRunAction === 'check'
                    ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
              }`}
            >
              <CheckCircle2 className="h-3 w-3" />
              <span>Check</span>
            </button>
            <button
              type="button"
              disabled={!hasWorkspace}
              onClick={() => onRunAction('test')}
              title="Cargo Test"
              aria-label="Test project"
              className={`inline-flex h-6 items-center gap-1 rounded-[var(--radius-sm)] px-1.5 text-xs transition-colors ${
                !hasWorkspace
                  ? 'cursor-not-allowed text-[var(--text-muted)] opacity-50'
                  : isRunning && activeRunAction === 'test'
                    ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
              }`}
            >
              <FlaskConical className="h-3 w-3" />
              <span>Test</span>
            </button>
            {isRunning && (
              <button
                type="button"
                onClick={onStopRun}
                title="Stop running process (Shift+F5)"
                aria-label="Stop running process"
                className="inline-flex h-6 items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--status-err)]/15 px-2 text-xs font-medium text-[var(--status-err)] transition-colors hover:bg-[var(--status-err)]/25"
              >
                <Square className="h-3 w-3 fill-current" />
                <span>Stop</span>
              </button>
            )}
          </div>
        )}

        <div className="flex items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-input)] p-0.5">
          <button
            type="button"
            aria-label="Toggle left sidebar"
            aria-pressed={sidebarOpen}
            title="Toggle left sidebar (Ctrl/Cmd+B)"
            onClick={onToggleSidebar}
            className={`inline-flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] transition-colors ${
              sidebarOpen
                ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <PanelLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Toggle bottom panel"
            aria-pressed={bottomPanelOpen}
            title="Toggle bottom panel (Ctrl/Cmd+J)"
            onClick={onToggleBottomPanel}
            className={`inline-flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] transition-colors ${
              bottomPanelOpen
                ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <PanelBottom className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Toggle right inspector panel"
            aria-pressed={inspectorOpen}
            title="Toggle inspector panel (Ctrl/Cmd+Shift+I)"
            onClick={onToggleInspector}
            className={`inline-flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] transition-colors ${
              inspectorOpen
                ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <PanelRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <ThemeSwitcher
          mode={themeMode}
          compact={isNarrow}
          onChange={onThemeChange}
          onCycle={onThemeCycle}
        />

        <button
          type="button"
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          aria-pressed={isFullscreen}
          title={isFullscreen ? 'Exit fullscreen (F11)' : 'Enter fullscreen (F11)'}
          onClick={onToggleFullscreen}
          className={`inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] border transition-colors ${
            isFullscreen
              ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--accent)]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
          }`}
        >
          {isFullscreen ? (
            <Minimize2 className="h-3.5 w-3.5" />
          ) : (
            <Maximize2 className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </header>
  );
}
