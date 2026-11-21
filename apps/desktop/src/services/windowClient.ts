import { invoke } from '@tauri-apps/api/core';
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
