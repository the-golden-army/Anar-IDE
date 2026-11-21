import { Minus, Moon, Search, Settings, Square, Sun, X } from 'lucide-react';
import { AnarLogo } from './AnarLogo';
import { ANAR_VERSION_LABEL } from './sampleWorkspace';
import type { ResolvedTheme } from '../types/preferences';

interface TitleBarProps {
  resolvedTheme: ResolvedTheme;
  isNarrow: boolean;
  onOpenCommandPalette: () => void;
  onToggleLightDark: () => void;
  onOpenSettings: () => void;
  onMinimizeWindow: () => void;
  onToggleMaximizeWindow: () => void;
  onCloseWindow: () => void;
}

export function TitleBar({
  resolvedTheme,
  isNarrow,
  onOpenCommandPalette,
  onToggleLightDark,
  onOpenSettings,
  onMinimizeWindow,
  onToggleMaximizeWindow,
  onCloseWindow,
}: TitleBarProps) {
  const isDark = resolvedTheme === 'dark';

  return (
    <header
      className="grid h-[var(--titlebar-height)] shrink-0 grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-rail)] px-3 select-none"
      data-testid="titlebar"
    >
      <div className="flex min-w-0 items-center gap-2">
        <AnarLogo className="h-5 w-5 shrink-0" />
        <span className="text-[13px] font-semibold tracking-tight text-[var(--text-primary)]">
          Anar
        </span>
        <span className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[10px] font-medium text-[var(--text-secondary)]">
          {ANAR_VERSION_LABEL}
        </span>
      </div>

      <div className="flex justify-center px-2">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          aria-label="Search anything"
          data-testid="global-search-trigger"
          className="flex h-7 w-full max-w-[440px] items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 text-xs text-[var(--text-muted)] transition-colors duration-150 hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)]"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
            <span className="truncate">Search anything...</span>
          </span>
          {!isNarrow && (
            <kbd className="shrink-0 font-[family-name:var(--font-sans)] text-[11px] font-medium text-[var(--text-muted)]">
              Ctrl + K
            </kbd>
          )}
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onToggleLightDark}
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          title={isDark ? 'Switch to Light theme' : 'Switch to Dark theme'}
          data-testid="titlebar-theme-toggle"
          className="inline-flex h-7 items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-input)] p-0.5 transition-colors duration-150 hover:border-[var(--border-strong)]"
        >
          <span
            className={`inline-flex h-5 w-5 items-center justify-center rounded-full transition-colors duration-150 ${
              !isDark ? 'bg-[var(--accent-strong)] text-white' : 'text-[var(--text-muted)]'
            }`}
          >
            <Sun className="h-3 w-3" />
          </span>
          <span
            className={`inline-flex h-5 w-5 items-center justify-center rounded-full transition-colors duration-150 ${
              isDark ? 'bg-[var(--accent-strong)] text-white' : 'text-[var(--text-muted)]'
            }`}
          >
            <Moon className="h-3 w-3" />
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Open settings"
          title="Settings"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>

        <div className="ml-1 flex items-center gap-0.5">
          <button
            type="button"
            onClick={onMinimizeWindow}
            aria-label="Minimize window"
            title="Minimize"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onToggleMaximizeWindow}
            aria-label="Maximize window"
            title="Maximize / Restore"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <Square className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onCloseWindow}
            aria-label="Close window"
            title="Close"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--status-err)]/20 hover:text-[var(--status-err)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
