import { FolderOpen, GitBranch, Search, X } from 'lucide-react';
import { useRef } from 'react';
import { LAYOUT_LIMITS, type SidebarTab } from '../types/preferences';

interface SidebarPanelProps {
  open: boolean;
  width: number;
  activeTab: SidebarTab;
  isCompact: boolean;
  onClose: () => void;
  onResize: (width: number) => void;
  onSelectTab: (tab: SidebarTab) => void;
}

const TAB_DETAILS: Record<
  SidebarTab,
  { title: string; badge: string; body: string; Icon: typeof FolderOpen }
> = {
  explorer: {
    title: 'Explorer',
    badge: 'Phase 3',
    body: 'Open a Cargo workspace folder to browse crates, modules, and Rust source files.',
    Icon: FolderOpen,
  },
  search: {
    title: 'Search',
    badge: 'Phase 8',
    body: 'Project-wide ripgrep search and fuzzy symbol navigation will live here.',
    Icon: Search,
  },
  git: {
    title: 'Source Control',
    badge: 'Phase 8',
    body: 'Git branch status, changed files, and inline diffs will appear here.',
    Icon: GitBranch,
  },
};

export function SidebarPanel({
  open,
  width,
  activeTab,
  isCompact,
  onClose,
  onResize,
  onSelectTab,
}: SidebarPanelProps) {
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);

  if (!open) {
    return null;
  }

  const info = TAB_DETAILS[activeTab];
  const TabIcon = info.Icon;

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    startXRef.current = event.clientX;
    startWidthRef.current = width;

    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startXRef.current;
      const next = Math.min(
        LAYOUT_LIMITS.maxSidebarWidth,
        Math.max(LAYOUT_LIMITS.minSidebarWidth, startWidthRef.current + delta),
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

  const panelBody = (
    <aside
      aria-label="Sidebar panel"
      data-testid="sidebar-panel"
      style={isCompact ? { width: 'min(280px, calc(100vw - 44px))' } : { width: `${width}px` }}
      className={`relative flex h-full shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-panel)] ${
        isCompact ? 'shadow-xl' : ''
      }`}
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
            {info.title}
          </span>
          <span className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
            {info.badge}
          </span>
        </div>
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={onClose}
          className="inline-flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex gap-1 border-b border-[var(--border-subtle)] px-2 py-1.5">
        {(['explorer', 'search', 'git'] as SidebarTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onSelectTab(tab)}
            className={`rounded-[var(--radius-sm)] px-2 py-0.5 text-xs capitalize transition-colors ${
              activeTab === tab
                ? 'bg-[var(--bg-active)] font-medium text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="anar-scroll flex flex-1 flex-col items-center justify-center overflow-y-auto p-5 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--accent)]">
          <TabIcon className="h-5 w-5" />
        </div>
        <p className="mt-3 text-xs font-medium text-[var(--text-primary)]">No folder opened</p>
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">{info.body}</p>
      </div>

      {!isCompact && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          onPointerDown={handlePointerDown}
          className="absolute top-0 right-0 bottom-0 w-1 cursor-col-resize transition-colors hover:bg-[var(--accent)]"
        />
      )}
    </aside>
  );

  if (isCompact) {
    return (
      <div className="fixed inset-y-[var(--titlebar-height)] right-0 bottom-[var(--statusbar-height)] left-[var(--rail-width)] z-30 flex">
        {panelBody}
        <button
          type="button"
          aria-label="Dismiss sidebar overlay"
          onClick={onClose}
          className="flex-1 bg-black/40"
        />
      </div>
    );
  }

  return panelBody;
}
