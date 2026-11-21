import { X } from 'lucide-react';
import { useRef, useState } from 'react';
import { ExplorerView } from './ExplorerView';
import { GitView } from './GitView';
import { SearchView } from './SearchView';
import type { GitChangedFile, GitDiffResult, GitStatusReport } from '../types/git';
import type { LspLocation } from '../types/lsp';
import { LAYOUT_LIMITS, type SidebarTab } from '../types/preferences';
import type { WorkspaceSearchResult } from '../types/search';
import type { FileEntry, WorkspaceInfo } from '../types/workspace';

interface SidebarPanelProps {
  open: boolean;
  width: number;
  activeTab: SidebarTab;
  isCompact: boolean;
  workspace: WorkspaceInfo | null;
  dirCache: Record<string, FileEntry[]>;
  expandedDirs: Set<string>;
  activeFilePath: string | null;
  dirtyPaths: Set<string>;
  searchResult: WorkspaceSearchResult | null;
  isSearching: boolean;
  gitStatus: GitStatusReport | null;
  selectedGitDiff: GitDiffResult | null;
  gitLoading: boolean;
  onClose: () => void;
  onResize: (width: number) => void;
  onSelectTab: (tab: SidebarTab) => void;
  onOpenFolder: () => void;
  onRefreshExplorer: () => void;
  onToggleDir: (relativePath: string) => void;
  onSelectFile: (relativePath: string) => void;
  onCreateFile: (relativePath: string) => Promise<void>;
  onCreateDir: (relativePath: string) => Promise<void>;
  onRenameEntry: (from: string, to: string) => Promise<void>;
  onDeleteEntry: (relativePath: string) => Promise<void>;
  onSearchWorkspace: (query: string, caseSensitive: boolean) => void;
  onOpenLocation: (loc: LspLocation) => void;
  onRefreshGit: () => void;
  onSelectGitDiff: (entry: GitChangedFile) => void;
  onStageGitFile: (relPath: string) => void;
  onUnstageGitFile: (relPath: string) => void;
}

const TAB_TITLES: Record<SidebarTab, string> = {
  explorer: 'Explorer',
  search: 'Search',
  git: 'Source Control',
};

export function SidebarPanel({
  open,
  width,
  activeTab,
  isCompact,
  workspace,
  dirCache,
  expandedDirs,
  activeFilePath,
  dirtyPaths,
  searchResult,
  isSearching,
  gitStatus,
  selectedGitDiff,
  gitLoading,
  onClose,
  onResize,
  onSelectTab,
  onOpenFolder,
  onRefreshExplorer,
  onToggleDir,
  onSelectFile,
  onCreateFile,
  onCreateDir,
  onRenameEntry,
  onDeleteEntry,
  onSearchWorkspace,
  onOpenLocation,
  onRefreshGit,
  onSelectGitDiff,
  onStageGitFile,
  onUnstageGitFile,
}: SidebarPanelProps) {
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);
  const [isResizing, setIsResizing] = useState(false);

  if (!open) {
    return null;
  }

  const headerTitle = TAB_TITLES[activeTab];

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    startXRef.current = event.clientX;
    startWidthRef.current = width;
    setIsResizing(true);
    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startXRef.current;
      const next = Math.min(
        LAYOUT_LIMITS.maxSidebarWidth,
        Math.max(LAYOUT_LIMITS.minSidebarWidth, startWidthRef.current + delta),
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

  const panelBody = (
    <aside
      aria-label="Sidebar panel"
      data-testid="sidebar-panel"
      style={isCompact ? { width: 'min(280px, calc(100vw - 44px))' } : { width: `${width}px` }}
      className={`relative flex h-full shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-panel)] ${
        isCompact ? 'shadow-xl' : ''
      }`}
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
            {headerTitle}
          </span>
        </div>
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={onClose}
          className="inline-flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex gap-1 border-b border-[var(--border-subtle)] px-2 py-1.5">
        {(['explorer', 'search', 'git'] as SidebarTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onSelectTab(tab)}
            className={`rounded-[var(--radius-sm)] px-2 py-0.5 text-xs capitalize transition-colors ${
              activeTab === tab
                ? 'bg-[var(--bg-active)] font-medium text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'explorer' ? (
        <ExplorerView
          workspace={workspace}
          dirCache={dirCache}
          expandedDirs={expandedDirs}
          activeFilePath={activeFilePath}
          dirtyPaths={dirtyPaths}
          onOpenFolder={onOpenFolder}
          onRefresh={onRefreshExplorer}
          onToggleDir={onToggleDir}
          onSelectFile={onSelectFile}
          onCreateFile={onCreateFile}
          onCreateDir={onCreateDir}
          onRenameEntry={onRenameEntry}
          onDeleteEntry={onDeleteEntry}
        />
      ) : activeTab === 'search' ? (
        <SearchView
          hasWorkspace={workspace !== null}
          searchResult={searchResult}
          isSearching={isSearching}
          onSearch={onSearchWorkspace}
          onOpenLocation={onOpenLocation}
        />
      ) : (
        <GitView
          hasWorkspace={workspace !== null}
          status={gitStatus}
          selectedDiff={selectedGitDiff}
          isLoading={gitLoading}
          onRefresh={onRefreshGit}
          onSelectDiff={onSelectGitDiff}
          onStageFile={onStageGitFile}
          onUnstageFile={onUnstageGitFile}
          onOpenFile={onSelectFile}
        />
      )}

      {!isCompact && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          onPointerDown={handlePointerDown}
          className="group absolute top-0 -right-1 bottom-0 z-10 flex w-2 cursor-col-resize touch-none justify-center"
        >
          <span
            className={`h-full w-0.5 transition-colors duration-150 ${
              isResizing ? 'bg-[var(--accent)]' : 'bg-transparent group-hover:bg-[var(--accent)]'
            }`}
          />
        </div>
      )}
    </aside>
  );

  if (isCompact) {
    return (
      <div className="fixed inset-y-[var(--titlebar-height)] right-0 bottom-[var(--statusbar-height)] left-[var(--rail-width)] z-30 flex">
        {panelBody}
        <button
          type="button"
          aria-label="Dismiss sidebar overlay"
          onClick={onClose}
          className="flex-1 bg-black/40"
        />
      </div>
    );
  }

  return panelBody;
}
