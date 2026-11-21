import { Cpu, Layers, RotateCw, Sparkles, Zap, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { LspStatusEvent } from '../types/lsp';
import { LAYOUT_LIMITS } from '../types/preferences';

interface InspectorPanelProps {
  open: boolean;
  width: number;
  isCompact: boolean;
  lspStatus: LspStatusEvent;
  hasWorkspace: boolean;
  canFormat: boolean;
  onRestartLsp: () => void;
  onFormatDocument: () => void;
  onClose: () => void;
  onResize: (width: number) => void;
}

export function InspectorPanel({
  open,
  width,
  isCompact,
  lspStatus,
  hasWorkspace,
  canFormat,
  onRestartLsp,
  onFormatDocument,
  onClose,
  onResize,
}: InspectorPanelProps) {
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);
  const [isResizing, setIsResizing] = useState(false);

  if (!open) {
    return null;
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    startXRef.current = event.clientX;
    startWidthRef.current = width;
    setIsResizing(true);
    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (moveEvent: PointerEvent) => {
      const delta = startXRef.current - moveEvent.clientX;
      const next = Math.min(
        LAYOUT_LIMITS.maxInspectorWidth,
        Math.max(LAYOUT_LIMITS.minInspectorWidth, startWidthRef.current + delta),
      );
      onResize(next);
    };

    const onUp = () => {
      setIsResizing(false);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
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
          className="group absolute top-0 bottom-0 -left-1 z-10 flex w-2 cursor-col-resize touch-none justify-center"
        >
          <span
            className={`h-full w-0.5 transition-colors duration-150 ${
              isResizing ? 'bg-[var(--accent)]' : 'bg-transparent group-hover:bg-[var(--accent)]'
            }`}
          />
        </div>
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
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-medium text-[var(--text-primary)]">
              <Cpu className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span>Language Server</span>
            </div>
            {hasWorkspace && (
              <button
                type="button"
                onClick={onRestartLsp}
                title="Restart rust-analyzer"
                className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <RotateCw className="h-3 w-3" />
                <span>Restart</span>
              </button>
            )}
          </div>
          <p className="mt-1 text-[var(--text-secondary)]">
            rust-analyzer:{' '}
            <span className="font-medium text-[var(--text-primary)]">{lspStatus.status}</span>
          </p>
          {lspStatus.detail && (
            <p
              className="mt-1 truncate text-[11px] text-[var(--text-muted)]"
              title={lspStatus.detail}
            >
              {lspStatus.detail}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!canFormat}
              onClick={onFormatDocument}
              title="Format Rust file (Shift+Alt+F)"
              className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] px-2 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Sparkles className="h-3 w-3 text-[var(--accent)]" />
              <span>Format Rust File</span>
            </button>
          </div>
          <p className="mt-2 text-[10px] text-[var(--text-muted)]">
            F12 / Ctrl+Click: Go to Definition · Shift+Alt+F: Format
          </p>
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
