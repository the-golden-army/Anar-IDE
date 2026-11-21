import {
  ChevronDown,
  ChevronRight,
  File,
  FileCode,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import type { FileEntry, WorkspaceInfo } from '../types/workspace';

interface ExplorerViewProps {
  workspace: WorkspaceInfo | null;
  dirCache: Record<string, FileEntry[]>;
  expandedDirs: Set<string>;
  activeFilePath: string | null;
  dirtyPaths: Set<string>;
  onOpenFolder: () => void;
  onRefresh: () => void;
  onToggleDir: (relativePath: string) => void;
  onSelectFile: (relativePath: string) => void;
  onCreateFile: (relativePath: string) => Promise<void>;
  onCreateDir: (relativePath: string) => Promise<void>;
  onRenameEntry: (from: string, to: string) => Promise<void>;
  onDeleteEntry: (relativePath: string) => Promise<void>;
}

type PendingCreate = { kind: 'file' | 'dir'; parentDir: string } | null;

export function ExplorerView({
  workspace,
  dirCache,
  expandedDirs,
  activeFilePath,
  dirtyPaths,
  onOpenFolder,
  onRefresh,
  onToggleDir,
  onSelectFile,
  onCreateFile,
  onCreateDir,
  onRenameEntry,
  onDeleteEntry,
}: ExplorerViewProps) {
  const [pendingCreate, setPendingCreate] = useState<PendingCreate>(null);
  const [createValue, setCreateValue] = useState('');
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  if (!workspace) {
    return (
      <div className="anar-scroll flex flex-1 flex-col items-center justify-center overflow-y-auto p-5 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--accent)]">
          <FolderOpen className="h-5 w-5" />
        </div>
        <p className="mt-3 text-xs font-medium text-[var(--text-primary)]">No folder opened</p>
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
          Open a Cargo workspace or Rust project directory to browse and edit files.
        </p>
        <button
          type="button"
          onClick={onOpenFolder}
          className="mt-4 inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--text-on-accent)] transition-colors hover:bg-[var(--accent-hover)]"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          <span>Open Folder</span>
        </button>
      </div>
    );
  }

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
      const isRust = !entry.isDir && entry.name.endsWith('.rs');
      const children = entry.isDir ? (dirCache[entry.relativePath] ?? []) : [];

      if (renamingPath === entry.relativePath) {
        return (
          <form
            key={entry.relativePath}
            onSubmit={(e) => void submitRename(e, entry.relativePath)}
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
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
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
            className={`group flex h-7 items-center justify-between pr-1.5 text-xs transition-colors ${
              isSelected
                ? 'bg-[var(--bg-active)] font-medium text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
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
                  <Folder className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                </>
              ) : (
                <>
                  <span className="w-3.5 shrink-0" />
                  {isRust ? (
                    <FileCode className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                  ) : (
                    <File className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                  )}
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
                  <FilePlus className="h-3 w-3" />
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
          </div>

          {expanded && (
            <div>
              {pendingCreate && pendingCreate.parentDir === entry.relativePath && (
                <form
                  onSubmit={(e) => void submitCreate(e)}
                  style={{ paddingLeft: `${(depth + 1) * 14 + 26}px` }}
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
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-xs font-semibold text-[var(--text-primary)]">
            {workspace.name}
          </span>
          {workspace.isCargoProject && (
            <span className="shrink-0 rounded bg-[var(--accent-muted)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)]">
              Cargo
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            title="New File"
            aria-label="New file"
            onClick={() => {
              setPendingCreate({ kind: 'file', parentDir: '' });
              setCreateValue('');
            }}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <FilePlus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="New Folder"
            aria-label="New folder"
            onClick={() => {
              setPendingCreate({ kind: 'dir', parentDir: '' });
              setCreateValue('');
            }}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Refresh Explorer"
            aria-label="Refresh explorer"
            onClick={onRefresh}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="anar-scroll flex-1 overflow-y-auto py-1">
        {pendingCreate && pendingCreate.parentDir === '' && (
          <form onSubmit={(e) => void submitCreate(e)} className="px-3 py-1">
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
          <p className="px-3 py-4 text-xs text-[var(--text-muted)]">Workspace is empty.</p>
        ) : (
          renderEntries(rootEntries, 0, new Set())
        )}
      </div>
    </div>
  );
}
