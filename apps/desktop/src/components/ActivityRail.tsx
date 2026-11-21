import { Files, GitBranch, Search } from 'lucide-react';
import type { SidebarTab } from '../types/preferences';

interface ActivityRailProps {
  activeTab: SidebarTab;
  sidebarOpen: boolean;
  onSelectTab: (tab: SidebarTab) => void;
}

const RAIL_ITEMS: { id: SidebarTab; label: string; Icon: typeof Files }[] = [
  { id: 'explorer', label: 'Explorer', Icon: Files },
  { id: 'search', label: 'Search', Icon: Search },
  { id: 'git', label: 'Source Control', Icon: GitBranch },
];

export function ActivityRail({ activeTab, sidebarOpen, onSelectTab }: ActivityRailProps) {
  return (
    <nav
      aria-label="Workspace views"
      className="flex w-[var(--rail-width)] shrink-0 flex-col items-center gap-1 border-r border-[var(--border-subtle)] bg-[var(--bg-rail)] py-2"
    >
      {RAIL_ITEMS.map(({ id, label, Icon }) => {
        const active = sidebarOpen && activeTab === id;
        return (
          <button
            key={id}
            type="button"
            aria-label={label}
            aria-pressed={active}
            title={label}
            onClick={() => onSelectTab(id)}
            className={`relative flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] transition-colors ${
              active
                ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            {active && (
              <span
                className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-r bg-[var(--accent)]"
                aria-hidden="true"
              />
            )}
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </nav>
  );
}
