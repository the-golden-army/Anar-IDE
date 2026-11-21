import { AlertTriangle, FileCode, Home, X } from 'lucide-react';
import type { EditorTab } from '../types/workspace';

interface TabBarProps {
  tabs: EditorTab[];
  activeTabPath: string | null;
  onSelectTab: (relativePath: string) => void;
  onCloseTab: (relativePath: string) => void;
  onShowWelcome: () => void;
}

export function TabBar({
  tabs,
  activeTabPath,
  onSelectTab,
  onCloseTab,
  onShowWelcome,
}: TabBarProps) {
  if (tabs.length === 0) {
    return null;
  }

  return (
    <div
      role="tablist"
      aria-label="Open editor tabs"
      data-testid="editor-tabbar"
      className="anar-scroll flex h-9 shrink-0 items-center overflow-x-auto border-b border-[var(--border-subtle)] bg-[var(--bg-panel)] select-none"
    >
      <button
        type="button"
        onClick={onShowWelcome}
        title="Show Welcome Screen"
        aria-label="Welcome screen"
        className={`flex h-full shrink-0 items-center gap-1.5 border-r border-[var(--border-subtle)] px-2.5 text-xs transition-colors ${
          activeTabPath === null
            ? 'bg-[var(--bg-app)] font-medium text-[var(--text-primary)]'
            : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
        }`}
      >
        <Home className="h-3.5 w-3.5" />
      </button>

      {tabs.map((tab) => {
        const active = tab.relativePath === activeTabPath;
        return (
          <div
            key={tab.relativePath}
            className={`group relative flex h-full max-w-[200px] min-w-[110px] shrink-0 items-center border-r border-[var(--border-subtle)] ${
              active
                ? 'bg-[var(--bg-app)] text-[var(--text-primary)]'
                : 'bg-[var(--bg-panel)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            {active && (
              <span
                className="absolute top-0 right-0 left-0 h-0.5 bg-[var(--accent)]"
                aria-hidden="true"
              />
            )}

            <button
              type="button"
              role="tab"
              aria-selected={active}
              title={tab.relativePath}
              onClick={() => onSelectTab(tab.relativePath)}
              className="flex h-full min-w-0 flex-1 items-center gap-1.5 pr-1 pl-2.5 text-left text-xs"
            >
              <FileCode
                className={`h-3.5 w-3.5 shrink-0 ${
                  tab.name.endsWith('.rs') ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                }`}
              />
              <span className="truncate">{tab.name}</span>
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
              className="mr-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)]"
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
    </div>
  );
}
