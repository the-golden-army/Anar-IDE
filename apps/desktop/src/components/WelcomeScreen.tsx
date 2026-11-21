import { FolderOpen, Keyboard, Plus, Sparkles } from 'lucide-react';
import type { RecentWorkspace } from '../types/preferences';

const ECOSYSTEM_TARGETS = [
  'axum',
  'actix-web',
  'rocket',
  'dioxus',
  'leptos',
  'yew',
  'tauri',
  'bevy',
  'clap',
  'Rusturbo',
];

const SHORTCUTS = [
  { keys: 'Ctrl / Cmd + O', action: 'Open workspace folder' },
  { keys: 'Ctrl / Cmd + S', action: 'Save active file' },
  { keys: 'Ctrl / Cmd + W', action: 'Close active tab' },
  { keys: 'Ctrl / Cmd + B', action: 'Toggle left sidebar' },
  { keys: 'Ctrl / Cmd + J', action: 'Toggle bottom panel' },
];

interface WelcomeScreenProps {
  recentWorkspaces: RecentWorkspace[];
  onOpenFolder: () => void;
  onNewProject: () => void;
  onOpenRecent: (path: string) => void;
}

export function WelcomeScreen({
  recentWorkspaces,
  onOpenFolder,
  onNewProject,
  onOpenRecent,
}: WelcomeScreenProps) {
  return (
    <div
      className="anar-scroll flex h-full w-full flex-1 flex-col items-center overflow-y-auto px-4 py-8 sm:px-8 sm:py-12"
      data-testid="welcome-screen"
    >
      <div className="w-full max-w-2xl space-y-6">
        <header className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--accent)] text-lg font-bold text-[var(--text-on-accent)] shadow-sm"
              aria-hidden="true"
            >
              A
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)] sm:text-2xl">
                  Anar
                </h1>
                <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)]">
                  v0.1.0
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] sm:text-sm">
                Focused desktop editor for Rust, frameworks, and Rusturbo acceleration.
              </p>
            </div>
          </div>
        </header>

        <section aria-label="Start actions" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onOpenFolder}
            className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 text-left transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg-hover)]"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-muted)] text-[var(--accent)]">
              <FolderOpen className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Open Folder</p>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                Open a Cargo crate or workspace directory.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={onNewProject}
            className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 text-left transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg-hover)]"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-muted)] text-[var(--accent)]">
              <Plus className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--text-primary)]">New Rust Project</p>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                Scaffold a binary, library, or Rust framework template.
              </p>
            </div>
          </button>
        </section>

        <section
          aria-label="Recent workspaces"
          className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4"
        >
          <h2 className="text-xs font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
            Recent Workspaces
          </h2>
          {recentWorkspaces.length === 0 ? (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              No recent projects yet. Open a Cargo workspace to pin it here.
            </p>
          ) : (
            <ul className="mt-2.5 space-y-1.5">
              {recentWorkspaces.map((item) => (
                <li key={item.path}>
                  <button
                    type="button"
                    onClick={() => onOpenRecent(item.path)}
                    className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-md)] border border-transparent px-2.5 py-1.5 text-left transition-colors hover:border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]"
                  >
                    <span className="truncate text-xs font-medium text-[var(--text-primary)]">
                      {item.name}
                    </span>
                    <span className="truncate font-[family-name:var(--font-mono)] text-[11px] text-[var(--text-muted)]">
                      {item.path}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <section
            aria-label="Keyboard shortcuts"
            className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4"
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
              <Keyboard className="h-3.5 w-3.5 text-[var(--accent)]" />
              <h2>Shortcuts</h2>
            </div>
            <ul className="mt-3 space-y-2">
              {SHORTCUTS.map((item) => (
                <li key={item.keys} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-[var(--text-secondary)]">{item.action}</span>
                  <kbd className="shrink-0 rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[10px] text-[var(--text-primary)]">
                    {item.keys}
                  </kbd>
                </li>
              ))}
            </ul>
          </section>

          <section
            aria-label="Target ecosystem"
            className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4"
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
              <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
              <h2>Roadmap Targets</h2>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {ECOSYSTEM_TARGETS.map((name) => (
                <span
                  key={name}
                  className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-0.5 font-[family-name:var(--font-mono)] text-[11px] text-[var(--text-secondary)]"
                >
                  {name}
                </span>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
