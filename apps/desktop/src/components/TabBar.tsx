import { AlertTriangle, Columns2, Cpu, FileCode2, PanelRight, Plus, X } from 'lucide-react';
import type { EditorTab } from '../types/workspace';

interface TabBarProps {
  tabs: EditorTab[];
  activeTabPath: string | null;
  assistantOpen: boolean;
  inspectorOpen: boolean;
  onSelectTab: (relativePath: string) => void;
  onCloseTab: (relativePath: string) => void;
  onNewTab: () => void;
  onToggleAssistant: () => void;
  onToggleInspector: () => void;
}

export function TabBar({
  tabs,
  activeTabPath,
  assistantOpen,
  inspectorOpen,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onToggleAssistant,
  onToggleInspector,
}: TabBarProps) {
  return (
    <div
      role="tablist"
      aria-label="Open editor tabs"
      data-testid="editor-tabbar"
      className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-panel)] px-1.5 select-none"
    >
      <div className="anar-scroll flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1">
        {tabs.map((tab) => {
          const active = tab.relativePath === activeTabPath;
          return (
            <div
              key={tab.relativePath}
              className={`group relative flex h-7 max-w-[190px] min-w-[100px] shrink-0 items-center rounded-md border transition-colors duration-150 ${
                active
                  ? 'border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                  : 'border-transparent bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
              }`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                title={tab.relativePath}
                onClick={() => onSelectTab(tab.relativePath)}
                className="flex h-full min-w-0 flex-1 items-center gap-1.5 pr-1 pl-2.5 text-left text-xs"
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
                  <FileCode2 className="h-3 w-3" />
                </span>
                <span className="truncate font-medium">{tab.name}</span>
                {(tab.externallyModified || tab.deletedOnDisk) && (
                  <span title="Modified on disk" aria-label="Modified on disk">
                    <AlertTriangle className="h-3 w-3 shrink-0 text-[var(--status-warn)]" />
                  </span>
                )}
              </button>

              <button
                type="button"
                aria-label={`Close ${tab.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseTab(tab.relativePath);
                }}
                className="mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)]"
              >
                {tab.dirty ? (
                  <span
                    aria-label="Unsaved changes"
                    className="h-2 w-2 rounded-full bg-[var(--accent)] group-hover:hidden"
                  />
                ) : null}
                <X className={`h-3 w-3 ${tab.dirty ? 'hidden group-hover:block' : 'block'}`} />
              </button>
            </div>
          );
        })}

        <button
          type="button"
          onClick={onNewTab}
          title="Welcome / New Scratch Tab"
          aria-label="New tab"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="ml-2 flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label="Toggle right inspector panel"
          aria-pressed={inspectorOpen}
          title="Toolchain & Framework Inspector (Ctrl/Cmd+Shift+I)"
          onClick={onToggleInspector}
          className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150 ${
            inspectorOpen
              ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
              : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Cpu className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Toggle split layout"
          title="Layout"
          onClick={onToggleInspector}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <Columns2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Toggle Arena Assistant panel"
          aria-pressed={assistantOpen}
          title="Toggle Arena Assistant"
          onClick={onToggleAssistant}
          className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150 ${
            assistantOpen
              ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
              : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
          }`}
        >
          <PanelRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
