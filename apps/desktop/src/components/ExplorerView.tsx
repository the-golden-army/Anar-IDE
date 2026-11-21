import {
  ChevronDown,
  ChevronRight,
  File,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import type { FileEntry, WorkspaceInfo } from '../types/workspace';

interface ExplorerViewProps {
  workspace: WorkspaceInfo;
  isSampleWorkspace: boolean;
  dirCache: Record<string, FileEntry[]>;
  expandedDirs: Set<string>;
  activeFilePath: string | null;
  dirtyPaths: Set<string>;
  onOpenFolder: () => void;
  onNewProject: () => void;
  onRefresh: () => void;
  onToggleDir: (relativePath: string) => void;
  onSelectFile: (relativePath: string) => void;
  onCreateFile: (relativePath: string) => Promise<void>;
  onCreateDir: (relativePath: string) => Promise<void>;
  onRenameEntry: (from: string, to: string) => Promise<void>;
  onDeleteEntry: (relativePath: string) => Promise<void>;
}

type PendingCreate = { kind: 'file' | 'dir'; parentDir: string } | null;

function renderFileIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.rs')) {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
        <FileCode2 className="h-3 w-3" />
      </span>
    );
  }
  if (lower === 'cargo.toml' || lower.endsWith('.toml')) {
    return <Settings2 className="h-3.5 w-3.5 shrink-0 text-orange-400" />;
  }
  if (lower === 'cargo.lock' || lower.endsWith('.lock')) {
    return <Lock className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />;
  }
  if (lower.endsWith('.md')) {
    return <FileText className="h-3.5 w-3.5 shrink-0 text-sky-400" />;
  }
  return <File className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />;
}

function renderFolderIcon(name: string, expanded: boolean) {
  const color =
    name === 'src'
      ? 'text-emerald-400'
      : name === 'target'
        ? 'text-amber-400/80'
        : 'text-amber-400';
  return expanded ? (
    <FolderOpen className={`h-3.5 w-3.5 shrink-0 ${color}`} />
  ) : (
    <Folder className={`h-3.5 w-3.5 shrink-0 ${color}`} />
  );
}

export function ExplorerView({
  workspace,
  isSampleWorkspace,
  dirCache,
  expandedDirs,
  activeFilePath,
  dirtyPaths,
  onOpenFolder,
  onNewProject,
  onRefresh,
  onToggleDir,
  onSelectFile,
  onCreateFile,
  onCreateDir,
  onRenameEntry,
  onDeleteEntry,
}: ExplorerViewProps) {
  const [rootExpanded, setRootExpanded] = useState(true);
  const [pendingCreate, setPendingCreate] = useState<PendingCreate>(null);
  const [createValue, setCreateValue] = useState('');
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const rootEntries = dirCache[''] ?? workspace.entries;

  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pendingCreate) return;
    const trimmed = createValue.trim().replace(/^\/+/, '');
    if (!trimmed) {
      setPendingCreate(null);
      return;
    }
    const target = pendingCreate.parentDir ? `${pendingCreate.parentDir}/${trimmed}` : trimmed;
    setPendingCreate(null);
    setCreateValue('');
    if (pendingCreate.kind === 'file') {
      await onCreateFile(target);
    } else {
      await onCreateDir(target);
    }
  };

  const submitRename = async (event: React.FormEvent, originalPath: string) => {
    event.preventDefault();
    const trimmed = renameValue.trim();
    setRenamingPath(null);
    if (!trimmed) return;
    const slash = originalPath.lastIndexOf('/');
    const nextPath = slash >= 0 ? `${originalPath.slice(0, slash + 1)}${trimmed}` : trimmed;
    if (nextPath !== originalPath) {
      await onRenameEntry(originalPath, nextPath);
    }
  };

  const renderEntries = (entries: FileEntry[], depth: number, visited: Set<string>) => {
    return entries.map((entry) => {
      if (visited.has(entry.relativePath)) {
        return null;
      }
      const expanded = entry.isDir && expandedDirs.has(entry.relativePath);
      const isSelected = !entry.isDir && entry.relativePath === activeFilePath;
      const isDirty = !entry.isDir && dirtyPaths.has(entry.relativePath);
      const children = entry.isDir ? (dirCache[entry.relativePath] ?? []) : [];

      if (renamingPath === entry.relativePath) {
        return (
          <form
            key={entry.relativePath}
            onSubmit={(e) => void submitRename(e, entry.relativePath)}
            style={{ paddingLeft: `${depth * 14 + 22}px` }}
            className="flex items-center py-0.5 pr-2"
          >
            <input
              type="text"
              autoFocus
              aria-label={`Rename ${entry.name}`}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => setRenamingPath(null)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setRenamingPath(null);
              }}
              className="w-full rounded-[var(--radius-sm)] border border-[var(--border-focus)] bg-[var(--bg-input)] px-1.5 py-0.5 text-xs text-[var(--text-primary)] outline-none"
            />
          </form>
        );
      }

      return (
        <div key={entry.relativePath}>
          <div
            style={{ paddingLeft: `${depth * 14 + 22}px` }}
            className={`group mx-1.5 flex h-7 items-center justify-between rounded-md pr-1.5 text-xs transition-colors duration-150 ${
              isSelected
                ? 'border border-[var(--accent-ring)] bg-[var(--accent-muted)] font-medium text-[var(--text-primary)]'
                : 'border border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                if (entry.isDir) {
                  onToggleDir(entry.relativePath);
                } else {
                  onSelectFile(entry.relativePath);
                }
              }}
              className="flex h-full min-w-0 flex-1 items-center gap-1.5 text-left"
            >
              {entry.isDir ? (
                <>
                  {expanded ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                  )}
                  {renderFolderIcon(entry.name, expanded)}
                </>
              ) : (
                <>
                  <span className="w-3 shrink-0" />
                  {renderFileIcon(entry.name)}
                </>
              )}
              <span className="truncate">{entry.name}</span>
              {isDirty && (
                <span
                  aria-label="Modified"
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]"
                />
              )}
            </button>

            {!isSampleWorkspace && (
              <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                {entry.isDir && (
                  <button
                    type="button"
                    title={`New file in ${entry.name}`}
                    aria-label={`New file in ${entry.name}`}
                    onClick={() => {
                      setPendingCreate({ kind: 'file', parentDir: entry.relativePath });
                      setCreateValue('');
                    }}
                    className="rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)]"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                )}
                <button
                  type="button"
                  title={`Rename ${entry.name}`}
                  aria-label={`Rename ${entry.name}`}
                  onClick={() => {
                    setRenamingPath(entry.relativePath);
                    setRenameValue(entry.name);
                  }}
                  className="rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)]"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  title={`Delete ${entry.name}`}
                  aria-label={`Delete ${entry.name}`}
                  onClick={() => void onDeleteEntry(entry.relativePath)}
                  className="rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--bg-active)] hover:text-[var(--status-err)]"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>

          {expanded && (
            <div>
              {pendingCreate && pendingCreate.parentDir === entry.relativePath && (
                <form
                  onSubmit={(e) => void submitCreate(e)}
                  style={{ paddingLeft: `${(depth + 1) * 14 + 34}px` }}
                  className="py-0.5 pr-2"
                >
                  <input
                    type="text"
                    autoFocus
                    placeholder={pendingCreate.kind === 'file' ? 'filename.rs' : 'folder-name'}
                    value={createValue}
                    onChange={(e) => setCreateValue(e.target.value)}
                    onBlur={() => setPendingCreate(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setPendingCreate(null);
                    }}
                    className="w-full rounded-[var(--radius-sm)] border border-[var(--border-focus)] bg-[var(--bg-input)] px-1.5 py-0.5 text-xs text-[var(--text-primary)] outline-none"
                  />
                </form>
              )}
              {renderEntries(children, depth + 1, new Set(visited).add(entry.relativePath))}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="file-tree">
      <div className="flex h-10 shrink-0 items-center justify-between px-3">
        <span className="text-xs font-semibold text-[var(--text-primary)]">Explorer</span>
        <div className="flex items-center gap-1">
          {!isSampleWorkspace && (
            <>
              <button
                type="button"
                title="New File"
                aria-label="New file"
                onClick={() => {
                  setPendingCreate({ kind: 'file', parentDir: '' });
                  setCreateValue('');
                }}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border-subtle)] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <Plus className="h-3 w-3" />
              </button>
              <button
                type="button"
                title="New Folder"
                aria-label="New folder"
                onClick={() => {
                  setPendingCreate({ kind: 'dir', parentDir: '' });
                  setCreateValue('');
                }}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border-subtle)] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <FolderPlus className="h-3 w-3" />
              </button>
            </>
          )}
          <button
            type="button"
            title="Open Folder"
            aria-label="Open folder"
            onClick={onOpenFolder}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border-subtle)] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <FolderOpen className="h-3 w-3" />
          </button>
          <button
            type="button"
            title="Refresh Explorer"
            aria-label="Refresh explorer"
            onClick={onRefresh}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border-subtle)] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="anar-scroll flex-1 overflow-y-auto py-0.5">
        <button
          type="button"
          onClick={() => setRootExpanded((prev) => !prev)}
          className="mx-1.5 flex h-7 w-[calc(100%-0.75rem)] items-center gap-1.5 rounded-md px-2 text-left text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
        >
          {rootExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          )}
          <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400" />
          <span className="truncate">{workspace.name}</span>
        </button>

        {rootExpanded && (
          <div>
            {pendingCreate && pendingCreate.parentDir === '' && (
              <form onSubmit={(e) => void submitCreate(e)} className="px-4 py-1">
                <input
                  type="text"
                  autoFocus
                  aria-label={pendingCreate.kind === 'file' ? 'New file name' : 'New folder name'}
                  placeholder={pendingCreate.kind === 'file' ? 'src/example.rs' : 'new-folder'}
                  value={createValue}
                  onChange={(e) => setCreateValue(e.target.value)}
                  onBlur={() => setPendingCreate(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setPendingCreate(null);
                  }}
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--border-focus)] bg-[var(--bg-input)] px-1.5 py-0.5 text-xs text-[var(--text-primary)] outline-none"
                />
              </form>
            )}

            {rootEntries.length === 0 ? (
              <p className="px-6 py-3 text-xs text-[var(--text-muted)]">Workspace is empty.</p>
            ) : (
              renderEntries(rootEntries, 0, new Set())
            )}
          </div>
        )}
      </div>

      {isSampleWorkspace && (
        <div className="border-t border-[var(--border-subtle)] p-2.5">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={onOpenFolder}
              className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent-ring)] hover:bg-[var(--bg-hover)]"
            >
              <FolderOpen className="h-3 w-3 text-[var(--accent)]" />
              <span>Open</span>
            </button>
            <button
              type="button"
              onClick={onNewProject}
              className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-[var(--accent-ring)] bg-[var(--accent-muted)] px-2 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--accent-strong)] hover:text-white"
            >
              <Plus className="h-3 w-3" />
              <span>New Rust Project</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
