import type { ResolvedTheme, ThemeMode } from '../types/preferences';

interface StatusBarProps {
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  isNarrow: boolean;
  onCycleTheme: () => void;
}

export function StatusBar({ themeMode, resolvedTheme, isNarrow, onCycleTheme }: StatusBarProps) {
  const themeLabel =
    themeMode === 'system' ? `System (${resolvedTheme})` : themeMode === 'dark' ? 'Dark' : 'Light';

  return (
    <footer
      data-testid="statusbar"
      className="flex h-[var(--statusbar-height)] shrink-0 items-center justify-between gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-rail)] px-3 text-[11px] text-[var(--text-secondary)] select-none"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="inline-flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-ok)]" aria-hidden="true" />
          <span>Cargo</span>
        </span>
        {!isNarrow && (
          <span className="truncate text-[var(--text-muted)]">rust-analyzer: idle</span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={onCycleTheme}
          title="Click to cycle theme (Dark / Light / System)"
          className="rounded px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          Theme: {themeLabel}
        </button>
        {!isNarrow && (
          <span className="font-[family-name:var(--font-mono)] text-[10px] text-[var(--text-muted)]">
            v0.1.0-alpha.1
          </span>
        )}
      </div>
    </footer>
  );
}
