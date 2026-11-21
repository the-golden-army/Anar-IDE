import { Blocks, Bug, Folder, GitBranch, Info, Search, Settings } from 'lucide-react';
import type { ActivityView } from '../types/preferences';

interface ActivityRailProps {
  activeView: ActivityView;
  sidebarOpen: boolean;
  gitChangeCount: number;
  onSelectView: (view: ActivityView) => void;
}

const TOP_ITEMS: { id: ActivityView; label: string; Icon: typeof Folder }[] = [
  { id: 'explorer', label: 'Explorer', Icon: Folder },
  { id: 'search', label: 'Search', Icon: Search },
  { id: 'git', label: 'Git', Icon: GitBranch },
  { id: 'debug', label: 'Debug', Icon: Bug },
  { id: 'extensions', label: 'Extensions', Icon: Blocks },
  { id: 'settings', label: 'Settings', Icon: Settings },
];

export function ActivityRail({
  activeView,
  sidebarOpen,
  gitChangeCount,
  onSelectView,
}: ActivityRailProps) {
  const renderItem = ({
    id,
    label,
    Icon,
  }: {
    id: ActivityView;
    label: string;
    Icon: typeof Folder;
  }) => {
    const active = sidebarOpen && activeView === id;
    const showGitBadge = id === 'git' && gitChangeCount > 0;
    return (
      <button
        key={id}
        type="button"
        aria-label={label === 'Git' ? 'Source Control' : label}
        aria-pressed={active}
        title={label}
        onClick={() => onSelectView(id)}
        className={`relative flex w-[3.75rem] flex-col items-center justify-center gap-1 rounded-xl border py-2 text-[0.6875rem] font-medium transition-all duration-150 ${
          active
            ? 'border-[var(--accent-ring)] bg-[var(--accent-muted)] text-[var(--text-primary)] shadow-[0_0_16px_rgba(124,58,237,0.16)]'
            : 'border-transparent text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
        }`}
      >
        <Icon className={`h-[1.125rem] w-[1.125rem] ${active ? 'text-[var(--accent)]' : ''}`} />
        <span className="leading-none">{label}</span>
        {showGitBadge && (
          <span
            data-testid="git-rail-badge"
            className="absolute top-1 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent-strong)] px-1 text-[0.625rem] font-semibold text-white"
          >
            {gitChangeCount}
          </span>
        )}
      </button>
    );
  };

  return (
    <nav
      aria-label="Workspace views"
      data-testid="activity-rail"
      className="flex w-[var(--rail-width)] shrink-0 flex-col items-center border-r border-[var(--border-subtle)] bg-[var(--bg-rail)] px-1.5 py-2.5 select-none"
    >
      <div className="flex flex-col items-center gap-1.5">{TOP_ITEMS.map(renderItem)}</div>

      <div className="mt-auto flex flex-col items-center pt-2">
        {renderItem({ id: 'about', label: 'About', Icon: Info })}
      </div>
    </nav>
  );
}
