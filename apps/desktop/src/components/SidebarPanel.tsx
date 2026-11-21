import { useRef, useState } from 'react';
import { ExplorerView } from './ExplorerView';
import { ExtensionsView } from './ExtensionsView';
import { GitView } from './GitView';
import { SearchView } from './SearchView';
import { AboutSidebarView, DebugSidebarView, SettingsSidebarView } from './SidebarExtraViews';
import type { GitChangedFile, GitDiffResult, GitStatusReport } from '../types/git';
import type { LspLocation, LspStatusEvent } from '../types/lsp';
import {
  LAYOUT_LIMITS,
  type ActivityView,
  type CompilerBackend,
  type ThemeMode,
} from '../types/preferences';
import type { RunnerAction } from '../types/runner';
import type { WorkspaceSearchResult } from '../types/search';
import type { FileEntry, WorkspaceInfo } from '../types/workspace';

interface SidebarPanelProps {
  open: boolean;
  width: number;
  activeView: ActivityView;
  isCompact: boolean;
  workspace: WorkspaceInfo;
  isSampleWorkspace: boolean;
  dirCache: Record<string, FileEntry[]>;
  expandedDirs: Set<string>;
  activeFilePath: string | null;
  dirtyPaths: Set<string>;
  searchResult: WorkspaceSearchResult | null;
  isSearching: boolean;
  gitStatus: GitStatusReport | null;
  selectedGitDiff: GitDiffResult | null;
  gitLoading: boolean;
  themeMode: ThemeMode;
  zoomPercent: number;
  compilerBackend: CompilerBackend;
  lspStatus: LspStatusEvent;
  isRunning: boolean;
  onClose: () => void;
  onResize: (width: number) => void;
  onOpenFolder: () => void;
  onNewProject: () => void;
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
  onRunAction: (action: RunnerAction) => void;
  onOpenDebugConsole: () => void;
  onThemeChange: (mode: ThemeMode) => void;
  onThemeCycle: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onZoomIn: () => void;
  onOpenInspector: () => void;
}

export function SidebarPanel({
  open,
  width,
  activeView,
  isCompact,
  workspace,
  isSampleWorkspace,
  dirCache,
  expandedDirs,
  activeFilePath,
  dirtyPaths,
  searchResult,
  isSearching,
  gitStatus,
  selectedGitDiff,
  gitLoading,
  themeMode,
  zoomPercent,
  compilerBackend,
  lspStatus,
  isRunning,
  onClose,
  onResize,
  onOpenFolder,
  onNewProject,
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
  onRunAction,
  onOpenDebugConsole,
  onThemeChange,
  onThemeCycle,
  onZoomOut,
  onZoomReset,
  onZoomIn,
  onOpenInspector,
}: SidebarPanelProps) {
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);
  const [isResizing, setIsResizing] = useState(false);

  if (!open) {
    return null;
  }

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
      style={isCompact ? { width: 'min(260px, calc(100vw - 68px))' } : { width: `${width}px` }}
      className={`relative flex h-full shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-panel)] ${
        isCompact ? 'shadow-2xl' : ''
      }`}
    >
      {activeView === 'explorer' && (
        <ExplorerView
          workspace={workspace}
          isSampleWorkspace={isSampleWorkspace}
          dirCache={dirCache}
          expandedDirs={expandedDirs}
          activeFilePath={activeFilePath}
          dirtyPaths={dirtyPaths}
          onOpenFolder={onOpenFolder}
          onNewProject={onNewProject}
          onRefresh={onRefreshExplorer}
          onToggleDir={onToggleDir}
          onSelectFile={onSelectFile}
          onCreateFile={onCreateFile}
          onCreateDir={onCreateDir}
          onRenameEntry={onRenameEntry}
          onDeleteEntry={onDeleteEntry}
        />
      )}

      {activeView === 'search' && (
        <SearchView
          hasWorkspace={!isSampleWorkspace}
          searchResult={searchResult}
          isSearching={isSearching}
          onSearch={onSearchWorkspace}
          onOpenLocation={onOpenLocation}
        />
      )}

      {activeView === 'git' && (
        <GitView
          hasWorkspace={!isSampleWorkspace}
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

      {activeView === 'debug' && (
        <DebugSidebarView
          hasWorkspace={!isSampleWorkspace}
          isRunning={isRunning}
          onRunAction={onRunAction}
          onOpenDebugConsole={onOpenDebugConsole}
        />
      )}

      {activeView === 'extensions' && <ExtensionsView />}

      {activeView === 'settings' && (
        <SettingsSidebarView
          themeMode={themeMode}
          zoomPercent={zoomPercent}
          compilerBackend={compilerBackend}
          lspStatus={lspStatus}
          onThemeChange={onThemeChange}
          onThemeCycle={onThemeCycle}
          onZoomOut={onZoomOut}
          onZoomReset={onZoomReset}
          onZoomIn={onZoomIn}
          onOpenInspector={onOpenInspector}
        />
      )}

      {activeView === 'about' && <AboutSidebarView />}

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
          className="flex-1 bg-black/50"
        />
      </div>
    );
  }

  return panelBody;
}
