import { Monitor, Moon, Sun } from 'lucide-react';
import type { ThemeMode } from '../types/preferences';

interface ThemeSwitcherProps {
  mode: ThemeMode;
  compact?: boolean;
  onChange: (mode: ThemeMode) => void;
  onCycle: () => void;
}

const OPTIONS: { id: ThemeMode; label: string; Icon: typeof Moon }[] = [
  { id: 'dark', label: 'Dark', Icon: Moon },
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'system', label: 'System', Icon: Monitor },
];

export function ThemeSwitcher({ mode, compact = false, onChange, onCycle }: ThemeSwitcherProps) {
  if (compact) {
    const active = OPTIONS.find((opt) => opt.id === mode) ?? OPTIONS[2];
    const ActiveIcon = active.Icon;
    return (
      <button
        type="button"
        onClick={onCycle}
        aria-label={`Theme: ${active.label}. Click to switch theme`}
        title={`Theme: ${active.label} (click to cycle)`}
        className="inline-flex h-7 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
      >
        <ActiveIcon className="h-3.5 w-3.5 text-[var(--accent)]" />
        <span>{active.label}</span>
      </button>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme mode"
      className="inline-flex items-center rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-input)] p-0.5"
    >
      {OPTIONS.map(({ id, label, Icon }) => {
        const selected = mode === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${label} theme`}
            onClick={() => onChange(id)}
            className={`inline-flex h-6 items-center gap-1 rounded-[var(--radius-sm)] px-2 text-xs font-medium transition-colors ${
              selected
                ? 'bg-[var(--accent-muted)] text-[var(--text-primary)] ring-1 ring-[var(--accent-ring)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Icon
              className={`h-3.5 w-3.5 ${selected ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}
            />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
