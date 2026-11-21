import { FolderOpen, PanelBottom, PanelLeft, PanelRight, Play, Save } from 'lucide-react';
import { ThemeSwitcher } from './ThemeSwitcher';
import type { ThemeMode } from '../types/preferences';

interface TitleBarProps {
  workspaceName: string | null;
  hasUnsavedActiveTab: boolean;
  themeMode: ThemeMode;
  sidebarOpen: boolean;
  bottomPanelOpen: boolean;
  inspectorOpen: boolean;
  isNarrow: boolean;
  onOpenFolder: () => void;
  onSaveActive: () => void;
  onThemeChange: (mode: ThemeMode) => void;
  onThemeCycle: () => void;
  onToggleSidebar: () => void;
  onToggleBottomPanel: () => void;
  onToggleInspector: () => void;
}

export function TitleBar({
  workspaceName,
  hasUnsavedActiveTab,
  themeMode,
  sidebarOpen,
  bottomPanelOpen,
  inspectorOpen,
  isNarrow,
  onOpenFolder,
  onSaveActive,
  onThemeChange,
  onThemeCycle,
  onToggleSidebar,
  onToggleBottomPanel,
  onToggleInspector,
}: TitleBarProps) {
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
          <button
            type="button"
            disabled
            title="Build & Run arrives in Phase 4"
            className="mr-1 inline-flex h-7 cursor-not-allowed items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 text-xs font-medium text-[var(--text-muted)] opacity-60"
          >
            <Play className="h-3 w-3" />
            <span>Run</span>
          </button>
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
      </div>
    </header>
  );
}
