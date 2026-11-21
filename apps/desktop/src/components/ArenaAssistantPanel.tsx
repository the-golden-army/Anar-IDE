import { Info, Send, Sparkles, Wand2, Wrench, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { ArenaSparkleMark } from './AnarLogo';
import { LAYOUT_LIMITS } from '../types/preferences';

interface ArenaAssistantPanelProps {
  open: boolean;
  width: number;
  isCompact: boolean;
  onClose: () => void;
  onResize: (width: number) => void;
}

const PROMPT_ITEMS = [
  { id: 'explain', label: 'Explain this code', Icon: Info },
  { id: 'fix', label: 'Fix errors', Icon: Wrench },
  { id: 'generate', label: 'Generate code', Icon: Wand2 },
  { id: 'improve', label: 'Improve this code', Icon: Sparkles },
] as const;

export function ArenaAssistantPanel({
  open,
  width,
  isCompact,
  onClose,
  onResize,
}: ArenaAssistantPanelProps) {
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);
  const [isResizing, setIsResizing] = useState(false);
  const [draft, setDraft] = useState('');

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
      aria-label="Arena Assistant"
      data-testid="arena-assistant-panel"
      style={isCompact ? { width: 'min(300px, calc(100vw - 16px))' } : { width: `${width}px` }}
      className={`relative flex h-full shrink-0 flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-panel)] ${
        isCompact ? 'shadow-2xl' : ''
      }`}
    >
      {!isCompact && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize Arena Assistant panel"
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

      <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-3 select-none">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
          <span className="text-xs font-semibold text-[var(--text-primary)]">Arena Assistant</span>
          <span className="rounded-md border border-[var(--accent-ring)] bg-[var(--accent-muted)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)]">
            Beta
          </span>
        </div>

        <button
          type="button"
          aria-label="Close Arena Assistant"
          onClick={onClose}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="anar-scroll flex flex-1 flex-col gap-3 overflow-y-auto p-3">
        <div
          className="relative overflow-hidden rounded-xl border border-[var(--border-subtle)] p-4"
          style={{
            background:
              'linear-gradient(135deg, rgba(124, 58, 237, 0.16) 0%, rgba(15, 14, 23, 0.92) 70%)',
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-base font-semibold tracking-tight text-[var(--text-primary)]">
                Hello, Nour 👋
              </p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">How can I help you today?</p>
            </div>
            <ArenaSparkleMark className="h-12 w-12 shrink-0" />
          </div>
        </div>

        <div className="space-y-2">
          {PROMPT_ITEMS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setDraft(label)}
              className="flex w-full items-center gap-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2.5 text-left text-xs font-medium text-[var(--text-primary)] transition-colors duration-150 hover:border-[var(--accent-ring)] hover:bg-[var(--bg-hover)]"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="shrink-0 p-3 pt-1">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setDraft('');
          }}
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] p-2 transition-colors focus-within:border-[var(--accent-ring)]"
        >
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask anything about your code..."
              aria-label="Ask anything about your code"
              className="min-w-0 flex-1 bg-transparent px-1.5 py-1 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
            />
            <button
              type="submit"
              aria-label="Send message"
              title="UI Preview only"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-strong)] text-white transition-colors duration-150 hover:bg-[var(--accent)]"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>
        <p className="mt-1.5 text-right text-[10px] text-[var(--text-muted)]">
          Ctrl + Enter to send
        </p>
      </div>
    </aside>
  );

  if (isCompact) {
    return (
      <div className="fixed inset-y-[var(--titlebar-height)] right-0 bottom-[var(--statusbar-height)] left-0 z-30 flex justify-end">
        <button
          type="button"
          aria-label="Dismiss Arena Assistant overlay"
          onClick={onClose}
          className="flex-1 bg-black/50"
        />
        {panel}
      </div>
    );
  }

  return panel;
}
