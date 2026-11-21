import { AlertTriangle, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityRail } from './components/ActivityRail';
import { BottomPanel } from './components/BottomPanel';
import {
  CodeMirrorEditor,
  type CodeMirrorEditorHandle,
} from './components/editor/CodeMirrorEditor';
import { InspectorPanel } from './components/InspectorPanel';
import { SidebarPanel } from './components/SidebarPanel';
import { StatusBar } from './components/StatusBar';
import { TabBar } from './components/TabBar';
import { TitleBar } from './components/TitleBar';
import { WelcomeScreen } from './components/WelcomeScreen';
import { useCompactViewport } from './hooks/useCompactViewport';
import { usePreferences } from './hooks/usePreferences';
import { fetchPreferences } from './services/preferencesClient';
import {
  createWorkspaceDir,
  createWorkspaceFile,
  deleteWorkspaceEntry,
  listenWorkspaceFsEvents,
  listWorkspaceDir,
  openWorkspaceFolder,
  pickWorkspaceFolder,
  readWorkspaceFile,
  renameWorkspaceEntry,
  saveWorkspaceFile,
} from './services/workspaceClient';
import type { BottomTab, SidebarTab } from './types/preferences';
import type { EditorTab, FileEntry, WorkspaceFsEvent, WorkspaceInfo } from './types/workspace';

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'An unexpected error occurred.';
}

function parentDirOf(relPath: string): string {
  const slash = relPath.lastIndexOf('/');
  return slash >= 0 ? relPath.slice(0, slash) : '';
}

export function App() {
  const { preferences, resolvedTheme, setThemeMode, cycleThemeMode, updateLayout } =
    usePreferences();
  const { isCompact, isNarrow } = useCompactViewport();
  const { layout } = preferences;

  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [recentWorkspaces, setRecentWorkspaces] = useState(preferences.recentWorkspaces);
  const [dirCache, setDirCache] = useState<Record<string, FileEntry[]>>({});
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set());
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const editorRef = useRef<CodeMirrorEditorHandle | null>(null);
  const initialContentsRef = useRef<Map<string, string>>(new Map());
  const tabsRef = useRef<EditorTab[]>(tabs);
  const expandedDirsRef = useRef<Set<string>>(expandedDirs);
  const workspaceRef = useRef<WorkspaceInfo | null>(workspace);

  tabsRef.current = tabs;
  expandedDirsRef.current = expandedDirs;
  workspaceRef.current = workspace;

  useEffect(() => {
    setRecentWorkspaces(preferences.recentWorkspaces);
  }, [preferences.recentWorkspaces]);

  const showTransientStatus = useCallback((msg: string) => {
    setStatusMessage(msg);
  }, []);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(null), 3500);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  const refreshDirectory = useCallback(async (relDir: string) => {
    const entries = await listWorkspaceDir(relDir);
    setDirCache((prev) => ({ ...prev, [relDir]: entries }));
  }, []);

  const hydrateWorkspace = useCallback(async (info: WorkspaceInfo) => {
    setWorkspace(info);
    setErrorBanner(null);
    setTabs([]);
    setActiveTabPath(null);
    initialContentsRef.current.clear();

    const nextCache: Record<string, FileEntry[]> = { '': info.entries };
    const nextExpanded = new Set<string>();

    // Auto-expand `src/` if present so Rust projects open directly to `src/main.rs` / `lib.rs`.
    const srcDir = info.entries.find((e) => e.isDir && e.name === 'src');
    if (srcDir) {
      try {
        nextCache[srcDir.relativePath] = await listWorkspaceDir(srcDir.relativePath);
        nextExpanded.add(srcDir.relativePath);
      } catch {
        // Ignore if unreadable.
      }
    }

    setDirCache(nextCache);
    setExpandedDirs(nextExpanded);

    const updatedPrefs = await fetchPreferences();
    setRecentWorkspaces(updatedPrefs.recentWorkspaces);
  }, []);

  const handleOpenFolder = useCallback(async () => {
    try {
      const picked = await pickWorkspaceFolder();
      if (picked) {
        await hydrateWorkspace(picked);
      }
    } catch (err) {
      setErrorBanner(formatError(err));
    }
  }, [hydrateWorkspace]);

  const handleOpenRecent = useCallback(
    async (path: string) => {
      try {
        const info = await openWorkspaceFolder(path);
        await hydrateWorkspace(info);
      } catch (err) {
        setErrorBanner(formatError(err));
      }
    },
    [hydrateWorkspace],
  );

  const handleRefreshExplorer = useCallback(async () => {
    if (!workspaceRef.current) return;
    try {
      const dirsToRefresh = ['', ...Array.from(expandedDirsRef.current)];
      const results = await Promise.all(
        dirsToRefresh.map(async (dir) => [dir, await listWorkspaceDir(dir)] as const),
      );
      setDirCache(Object.fromEntries(results));
    } catch (err) {
      setErrorBanner(formatError(err));
    }
  }, []);

  const handleToggleDir = useCallback(async (relPath: string) => {
    const currentlyExpanded = expandedDirsRef.current.has(relPath);
    if (currentlyExpanded) {
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        next.delete(relPath);
        return next;
      });
      return;
    }

    try {
      const entries = await listWorkspaceDir(relPath);
      setDirCache((prev) => ({ ...prev, [relPath]: entries }));
      setExpandedDirs((prev) => new Set(prev).add(relPath));
    } catch (err) {
      setErrorBanner(formatError(err));
    }
  }, []);

  const handleOpenFile = useCallback(async (relPath: string) => {
    setErrorBanner(null);
    const existing = tabsRef.current.find((t) => t.relativePath === relPath);
    if (existing) {
      setActiveTabPath(relPath);
      return;
    }

    try {
      const doc = await readWorkspaceFile(relPath);
      initialContentsRef.current.set(doc.relativePath, doc.content);
      const newTab: EditorTab = {
        relativePath: doc.relativePath,
        name: doc.name,
        dirty: false,
        isLargeFile: doc.isLargeFile,
        lineEnding: doc.lineEnding,
        sizeBytes: doc.sizeBytes,
        modifiedMs: doc.modifiedMs,
        externallyModified: false,
        deletedOnDisk: false,
        cursor: { line: 1, col: 1 },
      };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabPath(doc.relativePath);
    } catch (err) {
      setErrorBanner(formatError(err));
    }
  }, []);

  const handleSaveTab = useCallback(
    async (targetPath: string | null) => {
      if (!targetPath) return;
      const content = editorRef.current?.getDocumentText(targetPath);
      if (content === null || content === undefined) return;

      try {
        const result = await saveWorkspaceFile(targetPath, content);
        editorRef.current?.markSaved(targetPath);
        setTabs((prev) =>
          prev.map((t) =>
            t.relativePath === targetPath
              ? {
                  ...t,
                  dirty: false,
                  sizeBytes: result.sizeBytes,
                  modifiedMs: result.modifiedMs,
                  externallyModified: false,
                  deletedOnDisk: false,
                }
              : t,
          ),
        );
        showTransientStatus(`Saved ${targetPath}`);
      } catch (err) {
        setErrorBanner(formatError(err));
      }
    },
    [showTransientStatus],
  );

  const handleReloadFromDisk = useCallback(
    async (relPath: string) => {
      try {
        const doc = await readWorkspaceFile(relPath);
        initialContentsRef.current.set(doc.relativePath, doc.content);
        editorRef.current?.replaceDocumentText(doc.relativePath, doc.content, doc.isLargeFile);
        setTabs((prev) =>
          prev.map((t) =>
            t.relativePath === relPath
              ? {
                  ...t,
                  dirty: false,
                  isLargeFile: doc.isLargeFile,
                  lineEnding: doc.lineEnding,
                  sizeBytes: doc.sizeBytes,
                  modifiedMs: doc.modifiedMs,
                  externallyModified: false,
                  deletedOnDisk: false,
                }
              : t,
          ),
        );
        showTransientStatus(`Reloaded ${doc.name} from disk`);
      } catch (err) {
        setErrorBanner(formatError(err));
      }
    },
    [showTransientStatus],
  );

  const handleCloseTab = useCallback(
    (relPath: string) => {
      editorRef.current?.dropTabBuffer(relPath);
      initialContentsRef.current.delete(relPath);
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.relativePath === relPath);
        const next = prev.filter((t) => t.relativePath !== relPath);
        if (activeTabPath === relPath) {
          const fallback = next[idx] ?? next[idx - 1] ?? null;
          setActiveTabPath(fallback ? fallback.relativePath : null);
        }
        return next;
      });
    },
    [activeTabPath],
  );

  const handleCreateFile = useCallback(
    async (relPath: string) => {
      try {
        const created = await createWorkspaceFile(relPath);
        await refreshDirectory(parentDirOf(created));
        await handleOpenFile(created);
      } catch (err) {
        setErrorBanner(formatError(err));
      }
    },
    [handleOpenFile, refreshDirectory],
  );

  const handleCreateDir = useCallback(
    async (relPath: string) => {
      try {
        const created = await createWorkspaceDir(relPath);
        await refreshDirectory(parentDirOf(created));
      } catch (err) {
        setErrorBanner(formatError(err));
      }
    },
    [refreshDirectory],
  );

  const handleRenameEntry = useCallback(
    async (from: string, to: string) => {
      try {
        const renamed = await renameWorkspaceEntry(from, to);
        await handleRefreshExplorer();
        setTabs((prev) =>
          prev.map((t) =>
            t.relativePath === from
              ? {
                  ...t,
                  relativePath: renamed,
                  name: renamed.split('/').pop() ?? renamed,
                }
              : t,
          ),
        );
        if (activeTabPath === from) {
          setActiveTabPath(renamed);
        }
      } catch (err) {
        setErrorBanner(formatError(err));
      }
    },
    [activeTabPath, handleRefreshExplorer],
  );

  const handleDeleteEntry = useCallback(
    async (relPath: string) => {
      try {
        await deleteWorkspaceEntry(relPath);
        await refreshDirectory(parentDirOf(relPath));
        if (tabsRef.current.some((t) => t.relativePath === relPath)) {
          handleCloseTab(relPath);
        }
      } catch (err) {
        setErrorBanner(formatError(err));
      }
    },
    [handleCloseTab, refreshDirectory],
  );

  // Listen to external filesystem notifications from `anar-workspace` watcher.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let disposed = false;

    listenWorkspaceFsEvents((events: WorkspaceFsEvent[]) => {
      if (!workspaceRef.current) return;

      const dirsToRefresh = new Set<string>();
      for (const evt of events) {
        const parent = parentDirOf(evt.relativePath);
        if (parent === '' || expandedDirsRef.current.has(parent)) {
          dirsToRefresh.add(parent);
        }
      }
      for (const dir of dirsToRefresh) {
        void refreshDirectory(dir).catch(() => {});
      }

      for (const evt of events) {
        const openTab = tabsRef.current.find((t) => t.relativePath === evt.relativePath);
        if (!openTab) continue;

        if (evt.kind === 'removed') {
          setTabs((prev) =>
            prev.map((t) =>
              t.relativePath === evt.relativePath ? { ...t, deletedOnDisk: true } : t,
            ),
          );
          continue;
        }

        if (evt.kind === 'modified' || evt.kind === 'created') {
          if (openTab.dirty) {
            setTabs((prev) =>
              prev.map((t) =>
                t.relativePath === evt.relativePath ? { ...t, externallyModified: true } : t,
              ),
            );
          } else {
            void handleReloadFromDisk(evt.relativePath);
          }
        }
      }
    }).then((fn) => {
      if (disposed) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, [handleReloadFromDisk, refreshDirectory]);

  const handleDirtyChange = useCallback((relPath: string, dirty: boolean) => {
    setTabs((prev) =>
      prev.map((t) => (t.relativePath === relPath && t.dirty !== dirty ? { ...t, dirty } : t)),
    );
  }, []);

  const handleCursorChange = useCallback((relPath: string, line: number, col: number) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.relativePath === relPath && (t.cursor.line !== line || t.cursor.col !== col)
          ? { ...t, cursor: { line, col } }
          : t,
      ),
    );
  }, []);

  const toggleSidebar = () => {
    updateLayout((prev) => ({ ...prev, sidebarOpen: !prev.sidebarOpen }));
  };

  const toggleBottomPanel = () => {
    updateLayout((prev) => ({ ...prev, bottomPanelOpen: !prev.bottomPanelOpen }));
  };

  const toggleInspector = () => {
    updateLayout((prev) => ({ ...prev, inspectorOpen: !prev.inspectorOpen }));
  };

  const handleRailSelect = (tab: SidebarTab) => {
    updateLayout((prev) => {
      if (prev.sidebarOpen && prev.activeSidebarTab === tab) {
        return { ...prev, sidebarOpen: false };
      }
      return { ...prev, sidebarOpen: true, activeSidebarTab: tab };
    });
  };

  const handleBottomTabSelect = (tab: BottomTab) => {
    updateLayout((prev) => ({ ...prev, bottomPanelOpen: true, activeBottomTab: tab }));
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'o' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        void handleOpenFolder();
      } else if (key === 's' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        void handleSaveTab(activeTabPath);
      } else if (key === 'w' && !event.shiftKey && !event.altKey) {
        if (activeTabPath) {
          event.preventDefault();
          handleCloseTab(activeTabPath);
        }
      } else if (key === 'b' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        updateLayout((prev) => ({ ...prev, sidebarOpen: !prev.sidebarOpen }));
      } else if (key === 'j' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        updateLayout((prev) => ({ ...prev, bottomPanelOpen: !prev.bottomPanelOpen }));
      } else if (key === 'i' && event.shiftKey && !event.altKey) {
        event.preventDefault();
        updateLayout((prev) => ({ ...prev, inspectorOpen: !prev.inspectorOpen }));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTabPath, handleCloseTab, handleOpenFolder, handleSaveTab, updateLayout]);

  const activeTab = useMemo(
    () => tabs.find((t) => t.relativePath === activeTabPath) ?? null,
    [activeTabPath, tabs],
  );

  const dirtyPaths = useMemo(
    () => new Set(tabs.filter((t) => t.dirty).map((t) => t.relativePath)),
    [tabs],
  );

  const activeInitialContent = activeTab
    ? (initialContentsRef.current.get(activeTab.relativePath) ?? '')
    : '';

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--bg-app)] text-[var(--text-primary)]"
      data-testid="app-shell"
    >
      <TitleBar
        workspaceName={workspace?.name ?? null}
        hasUnsavedActiveTab={Boolean(activeTab?.dirty)}
        themeMode={preferences.theme}
        sidebarOpen={layout.sidebarOpen}
        bottomPanelOpen={layout.bottomPanelOpen}
        inspectorOpen={layout.inspectorOpen}
        isNarrow={isNarrow}
        onOpenFolder={() => void handleOpenFolder()}
        onSaveActive={() => void handleSaveTab(activeTabPath)}
        onThemeChange={setThemeMode}
        onThemeCycle={cycleThemeMode}
        onToggleSidebar={toggleSidebar}
        onToggleBottomPanel={toggleBottomPanel}
        onToggleInspector={toggleInspector}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ActivityRail
          activeTab={layout.activeSidebarTab}
          sidebarOpen={layout.sidebarOpen}
          onSelectTab={handleRailSelect}
        />

        <SidebarPanel
          open={layout.sidebarOpen}
          width={layout.sidebarWidth}
          activeTab={layout.activeSidebarTab}
          isCompact={isCompact}
          workspace={workspace}
          dirCache={dirCache}
          expandedDirs={expandedDirs}
          activeFilePath={activeTabPath}
          dirtyPaths={dirtyPaths}
          onClose={() => updateLayout((prev) => ({ ...prev, sidebarOpen: false }))}
          onResize={(sidebarWidth) => updateLayout((prev) => ({ ...prev, sidebarWidth }))}
          onSelectTab={(activeSidebarTab) =>
            updateLayout((prev) => ({ ...prev, activeSidebarTab }))
          }
          onOpenFolder={() => void handleOpenFolder()}
          onRefreshExplorer={() => void handleRefreshExplorer()}
          onToggleDir={(relPath) => void handleToggleDir(relPath)}
          onSelectFile={(relPath) => void handleOpenFile(relPath)}
          onCreateFile={handleCreateFile}
          onCreateDir={handleCreateDir}
          onRenameEntry={handleRenameEntry}
          onDeleteEntry={handleDeleteEntry}
        />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--bg-app)]">
          <TabBar
            tabs={tabs}
            activeTabPath={activeTabPath}
            onSelectTab={(relPath) => setActiveTabPath(relPath)}
            onCloseTab={handleCloseTab}
            onShowWelcome={() => setActiveTabPath(null)}
          />

          {errorBanner && (
            <div
              role="alert"
              className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--status-err)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs text-[var(--status-err)]"
            >
              <span className="truncate">{errorBanner}</span>
              <button
                type="button"
                aria-label="Dismiss error"
                onClick={() => setErrorBanner(null)}
                className="rounded p-0.5 hover:bg-[var(--bg-hover)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {activeTab && (activeTab.externallyModified || activeTab.deletedOnDisk) && (
            <div
              role="status"
              data-testid="external-change-banner"
              className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--status-warn)] bg-[var(--accent-muted)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[var(--status-warn)]" />
                <span>
                  {activeTab.deletedOnDisk
                    ? `${activeTab.name} was deleted on disk.`
                    : `${activeTab.name} changed on disk while you have unsaved edits.`}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {!activeTab.deletedOnDisk && (
                  <button
                    type="button"
                    onClick={() => void handleReloadFromDisk(activeTab.relativePath)}
                    className="rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2 py-0.5 text-xs font-medium hover:bg-[var(--bg-hover)]"
                  >
                    Reload from disk
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setTabs((prev) =>
                      prev.map((t) =>
                        t.relativePath === activeTab.relativePath
                          ? { ...t, externallyModified: false, deletedOnDisk: false }
                          : t,
                      ),
                    )
                  }
                  className="rounded-[var(--radius-sm)] px-2 py-0.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                >
                  Keep my edits
                </button>
              </div>
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {activeTab ? (
              <CodeMirrorEditor
                ref={editorRef}
                relativePath={activeTab.relativePath}
                initialContent={activeInitialContent}
                isLargeFile={activeTab.isLargeFile}
                resolvedTheme={resolvedTheme}
                onDirtyChange={handleDirtyChange}
                onCursorChange={handleCursorChange}
                onSaveRequested={() => void handleSaveTab(activeTab.relativePath)}
              />
            ) : (
              <WelcomeScreen
                recentWorkspaces={recentWorkspaces}
                onOpenFolder={() => void handleOpenFolder()}
                onOpenRecent={(path) => void handleOpenRecent(path)}
              />
            )}
          </div>

          <BottomPanel
            open={layout.bottomPanelOpen}
            height={layout.bottomPanelHeight}
            activeTab={layout.activeBottomTab}
            onClose={() => updateLayout((prev) => ({ ...prev, bottomPanelOpen: false }))}
            onResize={(bottomPanelHeight) =>
              updateLayout((prev) => ({ ...prev, bottomPanelHeight }))
            }
            onSelectTab={handleBottomTabSelect}
          />
        </main>

        <InspectorPanel
          open={layout.inspectorOpen}
          width={layout.inspectorWidth}
          isCompact={isCompact}
          onClose={() => updateLayout((prev) => ({ ...prev, inspectorOpen: false }))}
          onResize={(inspectorWidth) => updateLayout((prev) => ({ ...prev, inspectorWidth }))}
        />
      </div>

      <StatusBar
        activeTab={activeTab}
        statusMessage={statusMessage}
        themeMode={preferences.theme}
        resolvedTheme={resolvedTheme}
        isNarrow={isNarrow}
        onCycleTheme={cycleThemeMode}
      />
    </div>
  );
}

export default App;
