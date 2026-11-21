import { useEffect } from 'react';
import { ActivityRail } from './components/ActivityRail';
import { BottomPanel } from './components/BottomPanel';
import { InspectorPanel } from './components/InspectorPanel';
import { SidebarPanel } from './components/SidebarPanel';
import { StatusBar } from './components/StatusBar';
import { TitleBar } from './components/TitleBar';
import { WelcomeScreen } from './components/WelcomeScreen';
import { useCompactViewport } from './hooks/useCompactViewport';
import { usePreferences } from './hooks/usePreferences';
import type { BottomTab, SidebarTab } from './types/preferences';

export function App() {
  const { preferences, resolvedTheme, setThemeMode, cycleThemeMode, updateLayout } =
    usePreferences();
  const { isCompact, isNarrow } = useCompactViewport();
  const { layout } = preferences;

  const toggleSidebar = () => {
    updateLayout((prev) => ({ ...prev, sidebarOpen: !prev.sidebarOpen }));
  };

  const toggleBottomPanel = () => {
    updateLayout((prev) => ({ ...prev, bottomPanelOpen: !prev.bottomPanelOpen }));
  };

  const toggleInspector = () => {
    updateLayout((prev) => ({ ...prev, inspectorOpen: !prev.inspectorOpen }));
  };

  const handleRailSelect = (tab: SidebarTab) => {
    updateLayout((prev) => {
      if (prev.sidebarOpen && prev.activeSidebarTab === tab) {
        return { ...prev, sidebarOpen: false };
      }
      return { ...prev, sidebarOpen: true, activeSidebarTab: tab };
    });
  };

  const handleBottomTabSelect = (tab: BottomTab) => {
    updateLayout((prev) => ({ ...prev, bottomPanelOpen: true, activeBottomTab: tab }));
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'b' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        updateLayout((prev) => ({ ...prev, sidebarOpen: !prev.sidebarOpen }));
      } else if (key === 'j' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        updateLayout((prev) => ({ ...prev, bottomPanelOpen: !prev.bottomPanelOpen }));
      } else if (key === 'i' && event.shiftKey && !event.altKey) {
        event.preventDefault();
        updateLayout((prev) => ({ ...prev, inspectorOpen: !prev.inspectorOpen }));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [updateLayout]);

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--bg-app)] text-[var(--text-primary)]"
      data-testid="app-shell"
    >
      <TitleBar
        themeMode={preferences.theme}
        sidebarOpen={layout.sidebarOpen}
        bottomPanelOpen={layout.bottomPanelOpen}
        inspectorOpen={layout.inspectorOpen}
        isNarrow={isNarrow}
        onThemeChange={setThemeMode}
        onThemeCycle={cycleThemeMode}
        onToggleSidebar={toggleSidebar}
        onToggleBottomPanel={toggleBottomPanel}
        onToggleInspector={toggleInspector}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ActivityRail
          activeTab={layout.activeSidebarTab}
          sidebarOpen={layout.sidebarOpen}
          onSelectTab={handleRailSelect}
        />

        <SidebarPanel
          open={layout.sidebarOpen}
          width={layout.sidebarWidth}
          activeTab={layout.activeSidebarTab}
          isCompact={isCompact}
          onClose={() => updateLayout((prev) => ({ ...prev, sidebarOpen: false }))}
          onResize={(sidebarWidth) => updateLayout((prev) => ({ ...prev, sidebarWidth }))}
          onSelectTab={(activeSidebarTab) =>
            updateLayout((prev) => ({ ...prev, activeSidebarTab }))
          }
        />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--bg-app)]">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <WelcomeScreen />
          </div>

          <BottomPanel
            open={layout.bottomPanelOpen}
            height={layout.bottomPanelHeight}
            activeTab={layout.activeBottomTab}
            onClose={() => updateLayout((prev) => ({ ...prev, bottomPanelOpen: false }))}
            onResize={(bottomPanelHeight) =>
              updateLayout((prev) => ({ ...prev, bottomPanelHeight }))
            }
            onSelectTab={handleBottomTabSelect}
          />
        </main>

        <InspectorPanel
          open={layout.inspectorOpen}
          width={layout.inspectorWidth}
          isCompact={isCompact}
          onClose={() => updateLayout((prev) => ({ ...prev, inspectorOpen: false }))}
          onResize={(inspectorWidth) => updateLayout((prev) => ({ ...prev, inspectorWidth }))}
        />
      </div>

      <StatusBar
        themeMode={preferences.theme}
        resolvedTheme={resolvedTheme}
        isNarrow={isNarrow}
        onCycleTheme={cycleThemeMode}
      />
    </div>
  );
}

export default App;
