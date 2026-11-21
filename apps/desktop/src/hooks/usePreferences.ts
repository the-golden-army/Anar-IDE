import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchPreferences,
  isTauriRuntime,
  persistLayoutState,
  persistThemeMode,
  readLocalPreferences,
} from '../services/preferencesClient';
import {
  sanitizeLayout,
  type AppPreferences,
  type LayoutState,
  type ResolvedTheme,
  type ThemeMode,
} from '../types/preferences';

export function getSystemPrefersLight(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches;
}

export function resolveTheme(mode: ThemeMode, systemPrefersLight: boolean): ResolvedTheme {
  if (mode === 'system') {
    return systemPrefersLight ? 'light' : 'dark';
  }
  return mode;
}

export function applyThemeToDom(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') {
    return;
  }
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

export interface UsePreferencesResult {
  preferences: AppPreferences;
  resolvedTheme: ResolvedTheme;
  loaded: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  cycleThemeMode: () => void;
  updateLayout: (updater: (prev: LayoutState) => LayoutState) => void;
}

export function usePreferences(): UsePreferencesResult {
  const [preferences, setPreferences] = useState<AppPreferences>(() => readLocalPreferences());
  const [systemPrefersLight, setSystemPrefersLight] = useState<boolean>(() =>
    getSystemPrefersLight(),
  );
  const [loaded, setLoaded] = useState(() => !isTauriRuntime());
  const userMutatedRef = useRef(false);
  const layoutPersistTimerRef = useRef<number | null>(null);

  const resolvedTheme = resolveTheme(preferences.theme, systemPrefersLight);

  useEffect(() => {
    applyThemeToDom(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemPrefersLight(event.matches);
    };
    setSystemPrefersLight(media.matches);
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleChange);
      return () => media.removeEventListener('change', handleChange);
    }
    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }
    let active = true;
    fetchPreferences().then((remote) => {
      if (!active) {
        return;
      }
      if (!userMutatedRef.current) {
        setPreferences(remote);
        applyThemeToDom(resolveTheme(remote.theme, getSystemPrefersLight()));
      }
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (layoutPersistTimerRef.current !== null) {
        window.clearTimeout(layoutPersistTimerRef.current);
      }
    };
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    userMutatedRef.current = true;
    applyThemeToDom(resolveTheme(mode, getSystemPrefersLight()));
    setPreferences((prev) => ({ ...prev, theme: mode }));
    void persistThemeMode(mode);
  }, []);

  const cycleThemeMode = useCallback(() => {
    const order: ThemeMode[] = ['dark', 'light', 'system'];
    const idx = order.indexOf(preferences.theme);
    const next = order[(idx + 1) % order.length];
    setThemeMode(next);
  }, [preferences.theme, setThemeMode]);

  const updateLayout = useCallback((updater: (prev: LayoutState) => LayoutState) => {
    userMutatedRef.current = true;
    setPreferences((prev) => {
      const nextLayout = sanitizeLayout(updater(prev.layout));
      if (layoutPersistTimerRef.current !== null) {
        window.clearTimeout(layoutPersistTimerRef.current);
      }
      layoutPersistTimerRef.current = window.setTimeout(() => {
        void persistLayoutState(nextLayout);
      }, 80);
      return { ...prev, layout: nextLayout };
    });
  }, []);

  return {
    preferences,
    resolvedTheme,
    loaded,
    setThemeMode,
    cycleThemeMode,
    updateLayout,
  };
}
