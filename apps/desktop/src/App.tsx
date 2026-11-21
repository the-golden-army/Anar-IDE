import { AlertTriangle, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityRail } from './components/ActivityRail';
import { BottomPanel } from './components/BottomPanel';
import {
  CodeMirrorEditor,
  type CodeMirrorEditorHandle,
} from './components/editor/CodeMirrorEditor';
import { InspectorPanel } from './components/InspectorPanel';
import { NewProjectModal } from './components/NewProjectModal';
import { SidebarPanel } from './components/SidebarPanel';
import { StatusBar } from './components/StatusBar';
import { TabBar } from './components/TabBar';
import { TitleBar } from './components/TitleBar';
import { WelcomeScreen } from './components/WelcomeScreen';
import { useCompactViewport } from './hooks/useCompactViewport';
import { usePreferences } from './hooks/usePreferences';
import { detectWorkspaceFrameworks, startProfileRun } from './services/frameworksClient';
import { fetchGitDiff, fetchGitStatus, stageGitFile, unstageGitFile } from './services/gitClient';
import {
  getLspStatus,
  lspDidChange,
  lspDidClose,
  lspDidOpen,
  lspDidSave,
  onLspDiagnostics,
  onLspStatus,
  restartLsp,
} from './services/lspClient';
import { fetchPreferences, isTauriRuntime } from './services/preferencesClient';
import { searchWorkspace } from './services/searchClient';
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
import {
  analyzeRusturbo,
  getRusturboStatus,
  initRusturboConfig,
  sendRunStdin,
  startCargoRun,
  stopCargoRun,
} from './services/runnerClient';
import { getFullscreenState, toggleFullscreen } from './services/windowClient';
import type { WorkspaceFrameworkReport } from './types/frameworks';
import type { GitChangedFile, GitDiffResult, GitStatusReport } from './types/git';
import type { LspLocation, LspStatusEvent } from './types/lsp';
import { LAYOUT_LIMITS, type BottomTab, type SidebarTab } from './types/preferences';
import type {
  DiagnosticItem,
  OutputLine,
  RunnerAction,
  RunnerEvent,
  RusturboAnalysis,
  RusturboStatus,
} from './types/runner';
import type { WorkspaceSearchResult } from './types/search';
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
  const {
    preferences,
    resolvedTheme,
    setThemeMode,
    cycleThemeMode,
    setCompilerBackend,
    updateLayout,
  } = usePreferences();
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [outputLines, setOutputLines] = useState<OutputLine[]>([]);
  const [cargoDiagnostics, setCargoDiagnostics] = useState<DiagnosticItem[]>([]);
  const [lspDiagnosticsByFile, setLspDiagnosticsByFile] = useState<
    Record<string, DiagnosticItem[]>
  >({});
  const [lspStatus, setLspStatus] = useState<LspStatusEvent>({
    status: 'stopped',
    detail: null,
  });
  const [isRunning, setIsRunning] = useState(false);
  const [activeRunAction, setActiveRunAction] = useState<RunnerAction | null>(null);
  const [lastExitSummary, setLastExitSummary] = useState<string | null>(null);
  const [frameworkReport, setFrameworkReport] = useState<WorkspaceFrameworkReport | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [newProjectModalOpen, setNewProjectModalOpen] = useState(false);
  const [rusturboStatus, setRusturboStatus] = useState<RusturboStatus | null>(null);
  const [rusturboAnalysis, setRusturboAnalysis] = useState<RusturboAnalysis | null>(null);
  const [rusturboBusy, setRusturboBusy] = useState(false);
  const [searchResult, setSearchResult] = useState<WorkspaceSearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [gitStatus, setGitStatus] = useState<GitStatusReport | null>(null);
  const [selectedGitDiff, setSelectedGitDiff] = useState<GitDiffResult | null>(null);
  const [gitLoading, setGitLoading] = useState(false);

  const editorRef = useRef<CodeMirrorEditorHandle | null>(null);
  const initialContentsRef = useRef<Map<string, string>>(new Map());
  const tabsRef = useRef<EditorTab[]>(tabs);
  const expandedDirsRef = useRef<Set<string>>(expandedDirs);
  const workspaceRef = useRef<WorkspaceInfo | null>(workspace);
  const outputIdRef = useRef(0);
  const activeRunIdRef = useRef<number | null>(null);
  const pendingRevealRef = useRef<{ path: string; line: number; col: number } | null>(null);
  const lspChangeTimersRef = useRef<Map<string, number>>(new Map());

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

  const refreshFrameworks = useCallback(async () => {
    try {
      const report = await detectWorkspaceFrameworks();
      setFrameworkReport(report);
      setSelectedProfileId((prev) => {
        if (prev && report?.profiles.some((p) => p.id === prev)) {
          return prev;
        }
        return report?.defaultProfileId ?? report?.profiles[0]?.id ?? null;
      });
    } catch {
      setFrameworkReport(null);
      setSelectedProfileId(null);
    }
  }, []);

  const refreshRusturboStatus = useCallback(async () => {
    try {
      const status = await getRusturboStatus();
      setRusturboStatus(status);
    } catch {
      setRusturboStatus(null);
    }
  }, []);

  const refreshGitStatus = useCallback(async () => {
    if (!workspaceRef.current) {
      setGitStatus(null);
      return;
    }
    setGitLoading(true);
    try {
      const report = await fetchGitStatus();
      setGitStatus(report);
    } catch {
      setGitStatus(null);
    } finally {
      setGitLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isTauriRuntime()) {
      void refreshRusturboStatus();
    }
  }, [refreshRusturboStatus]);

  const hydrateWorkspace = useCallback(
    async (info: WorkspaceInfo) => {
      void stopCargoRun().catch(() => {});
      for (const timer of lspChangeTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      lspChangeTimersRef.current.clear();
      setWorkspace(info);
      setErrorBanner(null);
      setTabs([]);
      setActiveTabPath(null);
      setOutputLines([]);
      setCargoDiagnostics([]);
      setLspDiagnosticsByFile({});
      setIsRunning(false);
      setActiveRunAction(null);
      setLastExitSummary(null);
      setFrameworkReport(null);
      setSelectedProfileId(null);
      setRusturboAnalysis(null);
      setSearchResult(null);
      setGitStatus(null);
      setSelectedGitDiff(null);
      activeRunIdRef.current = null;
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

      void refreshFrameworks();
      void refreshRusturboStatus();
      workspaceRef.current = info;
      void refreshGitStatus();

      const updatedPrefs = await fetchPreferences();
      setRecentWorkspaces(updatedPrefs.recentWorkspaces);
    },
    [refreshFrameworks, refreshGitStatus, refreshRusturboStatus],
  );

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
      if (!doc.isLargeFile && doc.relativePath.toLowerCase().endsWith('.rs')) {
        void lspDidOpen(doc.relativePath, 'rust', doc.content).catch(() => {});
      }
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
        if (targetPath.toLowerCase().endsWith('.rs')) {
          void lspDidSave(targetPath).catch(() => {});
        }
        if (targetPath.endsWith('Cargo.toml') || targetPath.endsWith('Cargo.lock')) {
          void refreshFrameworks();
        }
        if (targetPath.endsWith('rusturbo.toml')) {
          void refreshRusturboStatus();
        }
        void refreshGitStatus();
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
    [refreshFrameworks, refreshGitStatus, refreshRusturboStatus, showTransientStatus],
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
      const pendingTimer = lspChangeTimersRef.current.get(relPath);
      if (pendingTimer !== undefined) {
        window.clearTimeout(pendingTimer);
        lspChangeTimersRef.current.delete(relPath);
      }
      if (relPath.toLowerCase().endsWith('.rs')) {
        void lspDidClose(relPath).catch(() => {});
      }
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

      if (
        events.some(
          (evt) =>
            evt.relativePath.endsWith('Cargo.toml') || evt.relativePath.endsWith('Cargo.lock'),
        )
      ) {
        void refreshFrameworks();
      }
      if (events.some((evt) => evt.relativePath.endsWith('rusturbo.toml'))) {
        void refreshRusturboStatus();
      }
      void refreshGitStatus();

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
  }, [
    handleReloadFromDisk,
    refreshDirectory,
    refreshFrameworks,
    refreshGitStatus,
    refreshRusturboStatus,
  ]);

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

  const adjustZoom = useCallback(
    (delta: number) => {
      updateLayout((prev) => {
        const nextZoom = Math.min(
          LAYOUT_LIMITS.maxZoomPercent,
          Math.max(LAYOUT_LIMITS.minZoomPercent, prev.zoomPercent + delta),
        );
        showTransientStatus(`Zoom ${nextZoom}%`);
        return { ...prev, zoomPercent: nextZoom };
      });
    },
    [showTransientStatus, updateLayout],
  );

  const resetZoom = useCallback(() => {
    updateLayout((prev) => ({ ...prev, zoomPercent: LAYOUT_LIMITS.defaultZoomPercent }));
    showTransientStatus(`Zoom ${LAYOUT_LIMITS.defaultZoomPercent}%`);
  }, [showTransientStatus, updateLayout]);

  const appendOutput = useCallback((stream: OutputLine['stream'], text: string) => {
    outputIdRef.current += 1;
    const id = outputIdRef.current;
    setOutputLines((prev) => {
      const next = [...prev, { id, stream, text }];
      return next.length > 2000 ? next.slice(next.length - 2000) : next;
    });
  }, []);

  const handleRunAction = useCallback(
    async (action: RunnerAction) => {
      if (!workspaceRef.current) {
        setErrorBanner('Open a Cargo workspace before running.');
        return;
      }

      // Save all dirty tabs before invoking Cargo so edits are included immediately.
      const dirtyTabs = tabsRef.current.filter((t) => t.dirty);
      for (const dirtyTab of dirtyTabs) {
        await handleSaveTab(dirtyTab.relativePath);
      }

      setErrorBanner(null);
      setOutputLines([]);
      setCargoDiagnostics([]);
      setLastExitSummary(null);
      setIsRunning(true);
      setActiveRunAction(action);
      updateLayout((prev) => ({
        ...prev,
        bottomPanelOpen: true,
        activeBottomTab: 'output',
      }));

      try {
        const backend = preferences.compilerBackend;
        const runId = await startCargoRun(
          action,
          (event: RunnerEvent) => {
            if (activeRunIdRef.current !== null && event.runId !== activeRunIdRef.current) {
              return;
            }
            if (event.type === 'started') {
              activeRunIdRef.current = event.runId;
              appendOutput('system', `$ ${event.command}`);
            } else if (event.type === 'output') {
              appendOutput(event.stream, event.line);
            } else if (event.type === 'diagnostic') {
              setCargoDiagnostics((prev) => [...prev, event.diagnostic]);
              const rendered = event.diagnostic.rendered?.trimEnd();
              if (rendered) {
                appendOutput('stderr', rendered);
              }
            } else if (event.type === 'finished') {
              setIsRunning(false);
              const seconds = (event.durationMs / 1000).toFixed(2);
              const summary = event.cancelled
                ? `Cancelled after ${seconds}s`
                : `Exited (${event.exitCode ?? '?'}) in ${seconds}s`;
              setLastExitSummary(summary);
              appendOutput('system', summary);
              showTransientStatus(`${backend} ${event.action}: ${summary}`);
            }
          },
          backend,
        );
        activeRunIdRef.current = runId;
      } catch (err) {
        setIsRunning(false);
        setActiveRunAction(null);
        setErrorBanner(formatError(err));
      }
    },
    [appendOutput, handleSaveTab, preferences.compilerBackend, showTransientStatus, updateLayout],
  );

  const handleRunProfile = useCallback(
    async (profileId: string) => {
      if (!workspaceRef.current) {
        setErrorBanner('Open a Cargo workspace before running.');
        return;
      }

      const dirtyTabs = tabsRef.current.filter((t) => t.dirty);
      for (const dirtyTab of dirtyTabs) {
        await handleSaveTab(dirtyTab.relativePath);
      }

      setErrorBanner(null);
      setOutputLines([]);
      setCargoDiagnostics([]);
      setLastExitSummary(null);
      setIsRunning(true);
      setActiveRunAction('run');
      setSelectedProfileId(profileId);
      updateLayout((prev) => ({
        ...prev,
        bottomPanelOpen: true,
        activeBottomTab: 'output',
      }));

      try {
        const runId = await startProfileRun(profileId, (event: RunnerEvent) => {
          if (activeRunIdRef.current !== null && event.runId !== activeRunIdRef.current) {
            return;
          }
          if (event.type === 'started') {
            activeRunIdRef.current = event.runId;
            appendOutput('system', `$ ${event.command}`);
          } else if (event.type === 'output') {
            appendOutput(event.stream, event.line);
          } else if (event.type === 'diagnostic') {
            setCargoDiagnostics((prev) => [...prev, event.diagnostic]);
            const rendered = event.diagnostic.rendered?.trimEnd();
            if (rendered) {
              appendOutput('stderr', rendered);
            }
          } else if (event.type === 'finished') {
            setIsRunning(false);
            const seconds = (event.durationMs / 1000).toFixed(2);
            const summary = event.cancelled
              ? `Cancelled after ${seconds}s`
              : `Exited (${event.exitCode ?? '?'}) in ${seconds}s`;
            setLastExitSummary(summary);
            appendOutput('system', summary);
            showTransientStatus(`${profileId}: ${summary}`);
          }
        });
        activeRunIdRef.current = runId;
      } catch (err) {
        setIsRunning(false);
        setActiveRunAction(null);
        setErrorBanner(formatError(err));
      }
    },
    [appendOutput, handleSaveTab, showTransientStatus, updateLayout],
  );

  const handleStopRun = useCallback(async () => {
    try {
      await stopCargoRun();
    } catch (err) {
      setErrorBanner(formatError(err));
    }
  }, []);

  const handleSendStdin = useCallback(
    async (input: string) => {
      try {
        await sendRunStdin(input);
        appendOutput('system', `> ${input}`);
      } catch (err) {
        setErrorBanner(formatError(err));
      }
    },
    [appendOutput],
  );

  const handleNavigateLocation = useCallback(
    async (loc: LspLocation) => {
      pendingRevealRef.current = {
        path: loc.relativePath,
        line: loc.line,
        col: loc.col,
      };
      if (activeTabPath === loc.relativePath) {
        editorRef.current?.revealLocation(loc.line, loc.col);
        pendingRevealRef.current = null;
        return;
      }
      await handleOpenFile(loc.relativePath);
    },
    [activeTabPath, handleOpenFile],
  );

  const handleSelectDiagnostic = useCallback(
    async (diag: DiagnosticItem) => {
      const span = diag.primarySpan;
      if (!span) {
        return;
      }
      await handleNavigateLocation({
        relativePath: span.fileName,
        line: span.lineStart,
        col: span.columnStart,
      });
    },
    [handleNavigateLocation],
  );

  const handleDocumentChange = useCallback((relPath: string, content: string) => {
    if (!relPath.toLowerCase().endsWith('.rs')) {
      return;
    }
    const prevTimer = lspChangeTimersRef.current.get(relPath);
    if (prevTimer !== undefined) {
      window.clearTimeout(prevTimer);
    }
    const timer = window.setTimeout(() => {
      lspChangeTimersRef.current.delete(relPath);
      void lspDidChange(relPath, content).catch(() => {});
    }, 200);
    lspChangeTimersRef.current.set(relPath, timer);
  }, []);

  const handleRestartLsp = useCallback(async () => {
    try {
      await restartLsp();
      showTransientStatus('Restarting rust-analyzer...');
    } catch (err) {
      setErrorBanner(formatError(err));
    }
  }, [showTransientStatus]);

  const handleFormatDocument = useCallback(async () => {
    const formatted = await editorRef.current?.formatActiveDocument();
    if (formatted) {
      showTransientStatus('Formatted Rust document');
    }
  }, [showTransientStatus]);

  const handleAnalyzeRusturbo = useCallback(async () => {
    if (!workspaceRef.current) return;
    setRusturboBusy(true);
    setErrorBanner(null);
    try {
      const report = await analyzeRusturbo();
      setRusturboAnalysis(report);
      showTransientStatus('Rusturbo analysis complete');
    } catch (err) {
      setErrorBanner(formatError(err));
    } finally {
      setRusturboBusy(false);
    }
  }, [showTransientStatus]);

  const handleInitRusturboConfig = useCallback(async () => {
    if (!workspaceRef.current) return;
    setRusturboBusy(true);
    setErrorBanner(null);
    try {
      const updated = await initRusturboConfig('auto', 'balanced');
      setRusturboStatus(updated);
      await handleRefreshExplorer();
      showTransientStatus('Initialized rusturbo.toml');
    } catch (err) {
      setErrorBanner(formatError(err));
    } finally {
      setRusturboBusy(false);
    }
  }, [handleRefreshExplorer, showTransientStatus]);

  const handleSearchWorkspace = useCallback(async (query: string, caseSensitive: boolean) => {
    if (!workspaceRef.current) return;
    setIsSearching(true);
    setErrorBanner(null);
    try {
      const result = await searchWorkspace(query, caseSensitive);
      setSearchResult(result);
    } catch (err) {
      setErrorBanner(formatError(err));
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSelectGitDiff = useCallback(async (entry: GitChangedFile) => {
    setErrorBanner(null);
    try {
      const diff = await fetchGitDiff(entry.relativePath, entry.staged);
      setSelectedGitDiff(diff);
    } catch (err) {
      setErrorBanner(formatError(err));
    }
  }, []);

  const handleStageGitFile = useCallback(async (relPath: string) => {
    setErrorBanner(null);
    try {
      const updated = await stageGitFile(relPath);
      setGitStatus(updated);
    } catch (err) {
      setErrorBanner(formatError(err));
    }
  }, []);

  const handleUnstageGitFile = useCallback(async (relPath: string) => {
    setErrorBanner(null);
    try {
      const updated = await unstageGitFile(relPath);
      setGitStatus(updated);
    } catch (err) {
      setErrorBanner(formatError(err));
    }
  }, []);

  useEffect(() => {
    const timers = lspChangeTimersRef.current;
    return () => {
      for (const timer of timers.values()) {
        window.clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlistenStatus: (() => void) | null = null;
    let unlistenDiags: (() => void) | null = null;

    if (isTauriRuntime()) {
      void getLspStatus()
        .then((status) => {
          if (!disposed) {
            setLspStatus(status);
          }
        })
        .catch(() => {});
    }

    onLspStatus((event) => {
      if (!disposed) {
        setLspStatus(event);
      }
    }).then((fn) => {
      if (disposed) fn();
      else unlistenStatus = fn;
    });

    onLspDiagnostics((event) => {
      if (!disposed) {
        setLspDiagnosticsByFile((prev) => ({
          ...prev,
          [event.relativePath]: event.diagnostics,
        }));
      }
    }).then((fn) => {
      if (disposed) fn();
      else unlistenDiags = fn;
    });

    return () => {
      disposed = true;
      if (unlistenStatus) unlistenStatus();
      if (unlistenDiags) unlistenDiags();
    };
  }, []);

  useEffect(() => {
    const pending = pendingRevealRef.current;
    if (pending && activeTabPath === pending.path) {
      pendingRevealRef.current = null;
      window.requestAnimationFrame(() => {
        editorRef.current?.revealLocation(pending.line, pending.col);
      });
    }
  }, [activeTabPath]);

  const handleToggleFullscreen = useCallback(async () => {
    try {
      const next = await toggleFullscreen();
      setIsFullscreen(next);
    } catch (err) {
      setErrorBanner(formatError(err));
    }
  }, []);

  useEffect(() => {
    let active = true;
    const syncFullscreen = () => {
      void getFullscreenState().then((value) => {
        if (active) {
          setIsFullscreen((prev) => (prev === value ? prev : value));
        }
      });
    };
    syncFullscreen();
    document.addEventListener('fullscreenchange', syncFullscreen);
    window.addEventListener('resize', syncFullscreen);
    return () => {
      active = false;
      document.removeEventListener('fullscreenchange', syncFullscreen);
      window.removeEventListener('resize', syncFullscreen);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F11' && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        void handleToggleFullscreen();
        return;
      }
      if (event.key === 'F5' && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        if (event.shiftKey) {
          void handleStopRun();
        } else {
          void handleRunAction('run');
        }
        return;
      }

      const mod = event.ctrlKey || event.metaKey;
      if (!mod) {
        return;
      }
      const key = event.key.toLowerCase();
      if (
        (event.key === '+' ||
          event.key === '=' ||
          event.code === 'Equal' ||
          event.code === 'NumpadAdd') &&
        !event.altKey
      ) {
        event.preventDefault();
        adjustZoom(LAYOUT_LIMITS.zoomStep);
      } else if (
        (event.key === '-' ||
          event.key === '_' ||
          event.code === 'Minus' ||
          event.code === 'NumpadSubtract') &&
        !event.altKey
      ) {
        event.preventDefault();
        adjustZoom(-LAYOUT_LIMITS.zoomStep);
      } else if (
        (event.key === '0' || event.code === 'Digit0' || event.code === 'Numpad0') &&
        !event.shiftKey &&
        !event.altKey
      ) {
        event.preventDefault();
        resetZoom();
      } else if (
        key === 'f' &&
        event.metaKey &&
        event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey
      ) {
        event.preventDefault();
        void handleToggleFullscreen();
      } else if (key === 'o' && !event.shiftKey && !event.altKey) {
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
      } else if (key === 'b' && event.shiftKey && !event.altKey) {
        event.preventDefault();
        void handleRunAction('build');
      } else if (key === 'b' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        updateLayout((prev) => ({ ...prev, sidebarOpen: !prev.sidebarOpen }));
      } else if (key === 'j' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        updateLayout((prev) => ({ ...prev, bottomPanelOpen: !prev.bottomPanelOpen }));
      } else if (key === 'f' && event.shiftKey && !event.altKey) {
        event.preventDefault();
        updateLayout((prev) => ({
          ...prev,
          sidebarOpen: true,
          activeSidebarTab: 'search',
        }));
      } else if (key === 'i' && event.shiftKey && !event.altKey) {
        event.preventDefault();
        updateLayout((prev) => ({ ...prev, inspectorOpen: !prev.inspectorOpen }));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeTabPath,
    adjustZoom,
    handleCloseTab,
    handleOpenFolder,
    handleRunAction,
    handleSaveTab,
    handleStopRun,
    handleToggleFullscreen,
    resetZoom,
    updateLayout,
  ]);

  const activeTab = useMemo(
    () => tabs.find((t) => t.relativePath === activeTabPath) ?? null,
    [activeTabPath, tabs],
  );

  const lspReady = lspStatus.status === 'ready' || lspStatus.status === 'indexing';

  const diagnostics = useMemo(() => {
    const merged: DiagnosticItem[] = [];
    const seen = new Set<string>();
    const pushUnique = (item: DiagnosticItem) => {
      const span = item.primarySpan;
      const key = span
        ? `${span.fileName}:${span.lineStart}:${span.columnStart}:${item.message}`
        : `msg:${item.message}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(item);
      }
    };
    for (const item of Object.values(lspDiagnosticsByFile).flat()) {
      pushUnique(item);
    }
    for (const item of cargoDiagnostics) {
      pushUnique(item);
    }
    return merged;
  }, [cargoDiagnostics, lspDiagnosticsByFile]);

  const activeFileDiagnostics = useMemo(() => {
    if (!activeTabPath) {
      return [];
    }
    return diagnostics.filter((d) => d.primarySpan?.fileName === activeTabPath);
  }, [activeTabPath, diagnostics]);

  const errorCount = useMemo(
    () => diagnostics.filter((d) => d.severity === 'error').length,
    [diagnostics],
  );

  const warningCount = useMemo(
    () => diagnostics.filter((d) => d.severity === 'warning').length,
    [diagnostics],
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
        isRunning={isRunning}
        activeRunAction={activeRunAction}
        compilerBackend={preferences.compilerBackend}
        themeMode={preferences.theme}
        sidebarOpen={layout.sidebarOpen}
        bottomPanelOpen={layout.bottomPanelOpen}
        inspectorOpen={layout.inspectorOpen}
        isFullscreen={isFullscreen}
        isNarrow={isNarrow}
        onOpenFolder={() => void handleOpenFolder()}
        onSaveActive={() => void handleSaveTab(activeTabPath)}
        onRunAction={(action) => void handleRunAction(action)}
        onStopRun={() => void handleStopRun()}
        onThemeChange={setThemeMode}
        onThemeCycle={cycleThemeMode}
        onToggleSidebar={toggleSidebar}
        onToggleBottomPanel={toggleBottomPanel}
        onToggleInspector={toggleInspector}
        onToggleFullscreen={() => void handleToggleFullscreen()}
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
          searchResult={searchResult}
          isSearching={isSearching}
          gitStatus={gitStatus}
          selectedGitDiff={selectedGitDiff}
          gitLoading={gitLoading}
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
          onSearchWorkspace={(query, caseSensitive) =>
            void handleSearchWorkspace(query, caseSensitive)
          }
          onOpenLocation={(loc) => void handleNavigateLocation(loc)}
          onRefreshGit={() => void refreshGitStatus()}
          onSelectGitDiff={(entry) => void handleSelectGitDiff(entry)}
          onStageGitFile={(relPath) => void handleStageGitFile(relPath)}
          onUnstageGitFile={(relPath) => void handleUnstageGitFile(relPath)}
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
                lspReady={lspReady}
                activeDiagnostics={activeFileDiagnostics}
                onDirtyChange={handleDirtyChange}
                onCursorChange={handleCursorChange}
                onDocumentChange={handleDocumentChange}
                onSaveRequested={() => void handleSaveTab(activeTab.relativePath)}
                onNavigateLocation={(loc) => void handleNavigateLocation(loc)}
              />
            ) : (
              <WelcomeScreen
                recentWorkspaces={recentWorkspaces}
                onOpenFolder={() => void handleOpenFolder()}
                onNewProject={() => setNewProjectModalOpen(true)}
                onOpenRecent={(path) => void handleOpenRecent(path)}
              />
            )}
          </div>

          <BottomPanel
            open={layout.bottomPanelOpen}
            height={layout.bottomPanelHeight}
            activeTab={layout.activeBottomTab}
            workspaceKey={workspace?.rootPath ?? null}
            resolvedTheme={resolvedTheme}
            outputLines={outputLines}
            diagnostics={diagnostics}
            isRunning={isRunning}
            activeRunAction={activeRunAction}
            lastExitSummary={lastExitSummary}
            onClose={() => updateLayout((prev) => ({ ...prev, bottomPanelOpen: false }))}
            onResize={(bottomPanelHeight) =>
              updateLayout((prev) => ({ ...prev, bottomPanelHeight }))
            }
            onSelectTab={handleBottomTabSelect}
            onClearOutput={() => {
              setOutputLines([]);
              setLastExitSummary(null);
            }}
            onStopRun={() => void handleStopRun()}
            onSendStdin={(input) => void handleSendStdin(input)}
            onSelectDiagnostic={(diag) => void handleSelectDiagnostic(diag)}
          />
        </main>

        <InspectorPanel
          open={layout.inspectorOpen}
          width={layout.inspectorWidth}
          isCompact={isCompact}
          lspStatus={lspStatus}
          compilerBackend={preferences.compilerBackend}
          rusturboStatus={rusturboStatus}
          rusturboAnalysis={rusturboAnalysis}
          rusturboBusy={rusturboBusy}
          frameworkReport={frameworkReport}
          selectedProfileId={selectedProfileId}
          isRunning={isRunning}
          hasWorkspace={workspace !== null}
          canFormat={
            lspReady &&
            Boolean(activeTab) &&
            !activeTab?.isLargeFile &&
            Boolean(activeTab?.relativePath.toLowerCase().endsWith('.rs'))
          }
          onRestartLsp={() => void handleRestartLsp()}
          onFormatDocument={() => void handleFormatDocument()}
          onSelectCompilerBackend={setCompilerBackend}
          onAnalyzeRusturbo={() => void handleAnalyzeRusturbo()}
          onInitRusturboConfig={() => void handleInitRusturboConfig()}
          onSelectProfile={(profileId) => setSelectedProfileId(profileId)}
          onRunProfile={(profileId) => void handleRunProfile(profileId)}
          onClose={() => updateLayout((prev) => ({ ...prev, inspectorOpen: false }))}
          onResize={(inspectorWidth) => updateLayout((prev) => ({ ...prev, inspectorWidth }))}
        />
      </div>

      <StatusBar
        activeTab={activeTab}
        statusMessage={statusMessage}
        isRunning={isRunning}
        compilerBackend={preferences.compilerBackend}
        lspStatus={lspStatus}
        detectedFrameworks={frameworkReport?.detected ?? []}
        errorCount={errorCount}
        warningCount={warningCount}
        themeMode={preferences.theme}
        resolvedTheme={resolvedTheme}
        zoomPercent={layout.zoomPercent}
        isNarrow={isNarrow}
        onOpenProblems={() =>
          updateLayout((prev) => ({ ...prev, bottomPanelOpen: true, activeBottomTab: 'problems' }))
        }
        onCycleTheme={cycleThemeMode}
        onZoomOut={() => adjustZoom(-LAYOUT_LIMITS.zoomStep)}
        onZoomReset={resetZoom}
        onZoomIn={() => adjustZoom(LAYOUT_LIMITS.zoomStep)}
      />

      <NewProjectModal
        open={newProjectModalOpen}
        onClose={() => setNewProjectModalOpen(false)}
        onCreated={hydrateWorkspace}
      />
    </div>
  );
}

export default App;
