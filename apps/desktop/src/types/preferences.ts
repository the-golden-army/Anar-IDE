export type ThemeMode = 'dark' | 'light' | 'system';

export type ResolvedTheme = 'dark' | 'light';

export type CompilerBackend = 'cargo' | 'rusturbo';

export type SidebarTab = 'explorer' | 'search' | 'git';

export type ActivityView = SidebarTab | 'debug' | 'extensions' | 'settings' | 'about';

export type BottomTab = 'output' | 'problems' | 'terminal';

export type BottomPanelView = BottomTab | 'debug-console';

export interface RecentWorkspace {
  name: string;
  path: string;
}

export interface LayoutState {
  sidebarOpen: boolean;
  sidebarWidth: number;
  activeSidebarTab: SidebarTab;
  bottomPanelOpen: boolean;
  bottomPanelHeight: number;
  activeBottomTab: BottomTab;
  inspectorOpen: boolean;
  inspectorWidth: number;
  zoomPercent: number;
}

export interface AppPreferences {
  version: number;
  theme: ThemeMode;
  compilerBackend: CompilerBackend;
  layout: LayoutState;
  recentWorkspaces: RecentWorkspace[];
}

export const LAYOUT_LIMITS = {
  minSidebarWidth: 180,
  maxSidebarWidth: 480,
  minBottomHeight: 120,
  maxBottomHeight: 480,
  minInspectorWidth: 220,
  maxInspectorWidth: 480,
  minZoomPercent: 70,
  maxZoomPercent: 160,
  defaultZoomPercent: 100,
  zoomStep: 10,
} as const;

export const DEFAULT_LAYOUT: LayoutState = {
  sidebarOpen: true,
  sidebarWidth: 235,
  activeSidebarTab: 'explorer',
  bottomPanelOpen: true,
  bottomPanelHeight: 224,
  activeBottomTab: 'terminal',
  inspectorOpen: false,
  inspectorWidth: 295,
  zoomPercent: LAYOUT_LIMITS.defaultZoomPercent,
};

export const DEFAULT_PREFERENCES: AppPreferences = {
  version: 1,
  theme: 'dark',
  compilerBackend: 'cargo',
  layout: DEFAULT_LAYOUT,
  recentWorkspaces: [],
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function sanitizeLayout(layout: Partial<LayoutState> | undefined): LayoutState {
  return {
    sidebarOpen: layout?.sidebarOpen ?? DEFAULT_LAYOUT.sidebarOpen,
    sidebarWidth: clamp(
      layout?.sidebarWidth ?? DEFAULT_LAYOUT.sidebarWidth,
      LAYOUT_LIMITS.minSidebarWidth,
      LAYOUT_LIMITS.maxSidebarWidth,
    ),
    activeSidebarTab:
      layout?.activeSidebarTab === 'search' || layout?.activeSidebarTab === 'git'
        ? layout.activeSidebarTab
        : 'explorer',
    bottomPanelOpen: layout?.bottomPanelOpen ?? DEFAULT_LAYOUT.bottomPanelOpen,
    bottomPanelHeight: clamp(
      layout?.bottomPanelHeight ?? DEFAULT_LAYOUT.bottomPanelHeight,
      LAYOUT_LIMITS.minBottomHeight,
      LAYOUT_LIMITS.maxBottomHeight,
    ),
    activeBottomTab:
      layout?.activeBottomTab === 'problems' ||
      layout?.activeBottomTab === 'terminal' ||
      layout?.activeBottomTab === 'output'
        ? layout.activeBottomTab
        : DEFAULT_LAYOUT.activeBottomTab,
    inspectorOpen: layout?.inspectorOpen ?? DEFAULT_LAYOUT.inspectorOpen,
    inspectorWidth: clamp(
      layout?.inspectorWidth ?? DEFAULT_LAYOUT.inspectorWidth,
      LAYOUT_LIMITS.minInspectorWidth,
      LAYOUT_LIMITS.maxInspectorWidth,
    ),
    zoomPercent: clamp(
      layout?.zoomPercent ?? DEFAULT_LAYOUT.zoomPercent,
      LAYOUT_LIMITS.minZoomPercent,
      LAYOUT_LIMITS.maxZoomPercent,
    ),
  };
}
