import { AlertTriangle, Terminal, TerminalSquare, X } from 'lucide-react';
import { useRef } from 'react';
import { LAYOUT_LIMITS, type BottomTab } from '../types/preferences';

interface BottomPanelProps {
  open: boolean;
  height: number;
  activeTab: BottomTab;
  onClose: () => void;
  onResize: (height: number) => void;
  onSelectTab: (tab: BottomTab) => void;
}

const TABS: { id: BottomTab; label: string; Icon: typeof Terminal; emptyMessage: string }[] = [
  {
    id: 'output',
    label: 'Output',
    Icon: TerminalSquare,
    emptyMessage:
      'Build, Run, Check, and Test output from Cargo & Rusturbo will stream here (Phase 4 & 7).',
  },
  {
    id: 'problems',
    label: 'Problems',
    Icon: AlertTriangle,
    emptyMessage:
      'Clickable compiler diagnostics and rust-analyzer warnings will appear here (Phase 4 & 5).',
  },
  {
    id: 'terminal',
    label: 'Terminal',
    Icon: Terminal,
    emptyMessage:
      'Integrated cross-platform PTY terminal powered by portable-pty and xterm.js (Phase 8).',
  },
];

export function BottomPanel({
  open,
  height,
  activeTab,
  onClose,
  onResize,
  onSelectTab,
}: BottomPanelProps) {
  const startYRef = useRef(0);
  const startHeightRef = useRef(height);

  if (!open) {
    return null;
  }

  const current = TABS.find((t) => t.id === activeTab) ?? TABS[0];

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    startYRef.current = event.clientY;
    startHeightRef.current = height;

    const onMove = (moveEvent: PointerEvent) => {
      const delta = startYRef.current - moveEvent.clientY;
      const next = Math.min(
        LAYOUT_LIMITS.maxBottomHeight,
        Math.max(LAYOUT_LIMITS.minBottomHeight, startHeightRef.current + delta),
      );
      onResize(next);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <section
      aria-label="Bottom panel"
      data-testid="bottom-panel"
      style={{ height: `${height}px` }}
      className="relative flex max-h-[45%] min-h-[120px] shrink-0 flex-col border-t border-[var(--border-subtle)] bg-[var(--bg-panel)]"
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize bottom panel"
        onPointerDown={handlePointerDown}
        className="absolute top-0 right-0 left-0 h-1 cursor-row-resize transition-colors hover:bg-[var(--accent)]"
      />

      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-3">
        <div role="tablist" aria-label="Bottom panel views" className="flex items-center gap-1">
          {TABS.map(({ id, label, Icon }) => {
            const selected = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onSelectTab(id)}
                className={`inline-flex h-6 items-center gap-1.5 rounded-[var(--radius-sm)] px-2 text-xs font-medium transition-colors ${
                  selected
                    ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          aria-label="Close bottom panel"
          onClick={onClose}
          className="inline-flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="anar-scroll flex-1 overflow-auto p-3 font-[family-name:var(--font-mono)] text-xs text-[var(--text-secondary)]">
        <p className="leading-relaxed">{current.emptyMessage}</p>
      </div>
    </section>
  );
}
