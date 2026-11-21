import {
  Cpu,
  FileCode2,
  FolderOpen,
  Hammer,
  Play,
  Plus,
  Search,
  Sparkles,
  SunMoon,
  Terminal,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { SAMPLE_FILES } from './sampleWorkspace';
import { findWorkspaceFiles } from '../services/searchClient';

export interface PaletteAction {
  id: string;
  label: string;
  shortcut?: string;
  onTrigger: () => void;
}

interface CommandPaletteModalProps {
  open: boolean;
  hasWorkspace: boolean;
  onClose: () => void;
  onSelectFile: (relativePath: string) => void;
  onOpenFolder: () => void;
  onNewProject: () => void;
  onRun: () => void;
  onBuild: () => void;
  onToggleTerminal: () => void;
  onToggleAssistant: () => void;
  onToggleInspector: () => void;
  onToggleTheme: () => void;
}

export function CommandPaletteModal({
  open,
  hasWorkspace,
  onClose,
  onSelectFile,
  onOpenFolder,
  onNewProject,
  onRun,
  onBuild,
  onToggleTerminal,
  onToggleAssistant,
  onToggleInspector,
  onToggleTheme,
}: CommandPaletteModalProps) {
  const [query, setQuery] = useState('');
  const [matchedFiles, setMatchedFiles] = useState<string[]>([]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setMatchedFiles([]);
      return;
    }
    if (!hasWorkspace) {
      const q = query.trim().toLowerCase();
      const samplePaths = Object.keys(SAMPLE_FILES);
      setMatchedFiles(
        q ? samplePaths.filter((p) => p.toLowerCase().includes(q)) : samplePaths.slice(0, 8),
      );
      return;
    }
    let cancelled = false;
    void findWorkspaceFiles(query)
      .then((files) => {
        if (!cancelled) {
          setMatchedFiles(files.slice(0, 8));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMatchedFiles([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [hasWorkspace, open, query]);

  const actions = useMemo(() => {
    const items: {
      id: string;
      label: string;
      shortcut?: string;
      Icon: typeof Play;
      run: () => void;
    }[] = [
      {
        id: 'open-folder',
        label: 'Open Folder…',
        shortcut: 'Ctrl+O',
        Icon: FolderOpen,
        run: onOpenFolder,
      },
      { id: 'new-project', label: 'New Rust Project…', Icon: Plus, run: onNewProject },
      { id: 'run', label: 'Cargo / Rusturbo: Run', shortcut: 'F5', Icon: Play, run: onRun },
      {
        id: 'build',
        label: 'Cargo / Rusturbo: Build',
        shortcut: 'Ctrl+Shift+B',
        Icon: Hammer,
        run: onBuild,
      },
      {
        id: 'terminal',
        label: 'Toggle Bottom Terminal',
        shortcut: 'Ctrl+J',
        Icon: Terminal,
        run: onToggleTerminal,
      },
      { id: 'assistant', label: 'Toggle Arena Assistant', Icon: Sparkles, run: onToggleAssistant },
      {
        id: 'inspector',
        label: 'Toggle Toolchain Inspector',
        shortcut: 'Ctrl+Shift+I',
        Icon: Cpu,
        run: onToggleInspector,
      },
      { id: 'theme', label: 'Switch Dark / Light Theme', Icon: SunMoon, run: onToggleTheme },
    ];
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.label.toLowerCase().includes(q));
  }, [
    onBuild,
    onNewProject,
    onOpenFolder,
    onRun,
    onToggleAssistant,
    onToggleInspector,
    onToggleTerminal,
    onToggleTheme,
    query,
  ]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          data-testid="command-palette"
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 pt-16 backdrop-blur-[2px]"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--bg-panel)] shadow-2xl"
          >
            <div className="flex h-11 items-center gap-2.5 border-b border-[var(--border-subtle)] px-3.5">
              <Search className="h-4 w-4 shrink-0 text-[var(--accent)]" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    onClose();
                  } else if (e.key === 'Enter') {
                    if (matchedFiles.length > 0) {
                      onSelectFile(matchedFiles[0]);
                      onClose();
                    } else if (actions.length > 0) {
                      actions[0].run();
                      onClose();
                    }
                  }
                }}
                placeholder="Search files or run a command..."
                aria-label="Search files or commands"
                className="min-w-0 flex-1 bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
              />
              <button
                type="button"
                aria-label="Close search palette"
                onClick={onClose}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="anar-scroll max-h-80 overflow-y-auto p-2 text-xs">
              {matchedFiles.length > 0 && (
                <div className="mb-2">
                  <p className="px-2 py-1 text-[10px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
                    Workspace Files
                  </p>
                  {matchedFiles.map((filePath) => (
                    <button
                      key={filePath}
                      type="button"
                      onClick={() => {
                        onSelectFile(filePath);
                        onClose();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[var(--text-primary)] transition-colors hover:bg-[var(--accent-muted)]"
                    >
                      <FileCode2 className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                      <span className="truncate font-[family-name:var(--font-mono)] text-[11px]">
                        {filePath}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div>
                <p className="px-2 py-1 text-[10px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
                  Commands
                </p>
                {actions.map(({ id, label, shortcut, Icon, run }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      run();
                      onClose();
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-[var(--accent)]" />
                      <span>{label}</span>
                    </span>
                    {shortcut && (
                      <kbd className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[10px] text-[var(--text-muted)]">
                        {shortcut}
                      </kbd>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
