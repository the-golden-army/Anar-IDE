import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauriRuntime } from './preferencesClient';

export async function getFullscreenState(): Promise<boolean> {
  if (isTauriRuntime()) {
    try {
      return await invoke<boolean>('is_window_fullscreen');
    } catch {
      return false;
    }
  }
  if (typeof document !== 'undefined') {
    return Boolean(document.fullscreenElement);
  }
  return false;
}

export async function toggleFullscreen(): Promise<boolean> {
  if (isTauriRuntime()) {
    return invoke<boolean>('toggle_window_fullscreen');
  }
  if (typeof document === 'undefined') {
    return false;
  }
  if (document.fullscreenElement) {
    if (typeof document.exitFullscreen === 'function') {
      await document.exitFullscreen();
    }
    return false;
  }
  if (typeof document.documentElement.requestFullscreen === 'function') {
    await document.documentElement.requestFullscreen();
    return true;
  }
  return false;
}

export async function minimizeWindow(): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await getCurrentWindow().minimize();
  } catch {
    // Ignore when window API is unavailable in headless environments.
  }
}

export async function toggleMaximizeWindow(): Promise<void> {
  if (!isTauriRuntime()) {
    await toggleFullscreen();
    return;
  }
  try {
    await getCurrentWindow().toggleMaximize();
  } catch {
    await toggleFullscreen().catch(() => {});
  }
}

export async function closeWindow(): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await getCurrentWindow().close();
  } catch {
    // Ignore when window API is unavailable.
  }
}
