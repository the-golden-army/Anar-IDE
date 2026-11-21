import { invoke } from '@tauri-apps/api/core';
import {
  DEFAULT_PREFERENCES,
  sanitizeLayout,
  type AppPreferences,
  type LayoutState,
  type ThemeMode,
} from '../types/preferences';

export const THEME_STORAGE_KEY = 'anar.theme';
export const PREFS_STORAGE_KEY = 'anar.preferences';

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function readLocalPreferences(): AppPreferences {
  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) {
      const themeRaw = window.localStorage.getItem(THEME_STORAGE_KEY);
      const theme: ThemeMode =
        themeRaw === 'dark' || themeRaw === 'light' || themeRaw === 'system' ? themeRaw : 'system';
      return { ...DEFAULT_PREFERENCES, theme };
    }
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    const theme: ThemeMode =
      parsed.theme === 'dark' || parsed.theme === 'light' || parsed.theme === 'system'
        ? parsed.theme
        : 'system';
    return {
      version: 1,
      theme,
      layout: sanitizeLayout(parsed.layout),
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function writeLocalPreferences(prefs: AppPreferences): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, prefs.theme);
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota or private-mode errors gracefully.
  }
}

export async function fetchPreferences(): Promise<AppPreferences> {
  if (!isTauriRuntime()) {
    return readLocalPreferences();
  }
  try {
    const prefs = await invoke<AppPreferences>('get_preferences');
    const normalized: AppPreferences = {
      version: 1,
      theme: prefs.theme,
      layout: sanitizeLayout(prefs.layout),
    };
    writeLocalPreferences(normalized);
    return normalized;
  } catch {
    return readLocalPreferences();
  }
}

export async function persistThemeMode(mode: ThemeMode): Promise<AppPreferences> {
  const local = readLocalPreferences();
  const optimistic: AppPreferences = { ...local, theme: mode };
  writeLocalPreferences(optimistic);

  if (!isTauriRuntime()) {
    return optimistic;
  }
  try {
    const saved = await invoke<AppPreferences>('set_theme_mode', { mode });
    writeLocalPreferences(saved);
    return saved;
  } catch {
    return optimistic;
  }
}

export async function persistLayoutState(layout: LayoutState): Promise<AppPreferences> {
  const local = readLocalPreferences();
  const cleanLayout = sanitizeLayout(layout);
  const optimistic: AppPreferences = { ...local, layout: cleanLayout };
  writeLocalPreferences(optimistic);

  if (!isTauriRuntime()) {
    return optimistic;
  }
  try {
    const saved = await invoke<AppPreferences>('update_layout_state', { layout: cleanLayout });
    writeLocalPreferences(saved);
    return saved;
  } catch {
    return optimistic;
  }
}
