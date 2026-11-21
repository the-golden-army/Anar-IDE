import { Cpu, Layers, Zap, X } from 'lucide-react';
import { useRef } from 'react';
import { LAYOUT_LIMITS } from '../types/preferences';

interface InspectorPanelProps {
  open: boolean;
  width: number;
  isCompact: boolean;
  onClose: () => void;
  onResize: (width: number) => void;
}

export function InspectorPanel({ open, width, isCompact, onClose, onResize }: InspectorPanelProps) {
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);

  if (!open) {
    return null;
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    startXRef.current = event.clientX;
    startWidthRef.current = width;

    const onMove = (moveEvent: PointerEvent) => {
      const delta = startXRef.current - moveEvent.clientX;
      const next = Math.min(
        LAYOUT_LIMITS.maxInspectorWidth,
        Math.max(LAYOUT_LIMITS.minInspectorWidth, startWidthRef.current + delta),
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

  const panel = (
    <aside
      aria-label="Workspace inspector"
      data-testid="inspector-panel"
      style={isCompact ? { width: 'min(280px, calc(100vw - 16px))' } : { width: `${width}px` }}
      className={`relative flex h-full shrink-0 flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-panel)] ${
        isCompact ? 'shadow-xl' : ''
      }`}
    >
      {!isCompact && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize inspector panel"
          onPointerDown={handlePointerDown}
          className="absolute top-0 bottom-0 left-0 w-1 cursor-col-resize transition-colors hover:bg-[var(--accent)]"
        />
      )}

      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-3">
        <span className="text-xs font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
          Inspector
        </span>
        <button
          type="button"
          aria-label="Close inspector panel"
          onClick={onClose}
          className="inline-flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="anar-scroll flex-1 space-y-3 overflow-y-auto p-3 text-xs">
        <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
          <div className="flex items-center gap-2 font-medium text-[var(--text-primary)]">
            <Cpu className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span>Language Server</span>
          </div>
          <p className="mt-1 text-[var(--text-secondary)]">rust-analyzer: idle (Phase 5)</p>
        </div>

        <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
          <div className="flex items-center gap-2 font-medium text-[var(--text-primary)]">
            <Zap className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span>Compiler Backend</span>
          </div>
          <p className="mt-1 text-[var(--text-secondary)]">Cargo default · Rusturbo (Phase 7)</p>
        </div>

        <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
          <div className="flex items-center gap-2 font-medium text-[var(--text-primary)]">
            <Layers className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span>Framework Profile</span>
          </div>
          <p className="mt-1 text-[var(--text-secondary)]">Auto-detection arrives in Phase 6.</p>
        </div>
      </div>
    </aside>
  );

  if (isCompact) {
    return (
      <div className="fixed inset-y-[var(--titlebar-height)] right-0 bottom-[var(--statusbar-height)] left-0 z-30 flex justify-end">
        <button
          type="button"
          aria-label="Dismiss inspector overlay"
          onClick={onClose}
          className="flex-1 bg-black/40"
        />
        {panel}
      </div>
    );
  }

  return panel;
}
