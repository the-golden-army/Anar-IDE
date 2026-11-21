import { Channel, invoke } from '@tauri-apps/api/core';
import { isTauriRuntime } from './preferencesClient';
import type { PtyEvent } from '../types/pty';

export async function spawnPty(
  cols: number,
  rows: number,
  onEvent: (event: PtyEvent) => void,
): Promise<number> {
  if (!isTauriRuntime()) {
    throw new Error('Integrated PTY terminal requires the Tauri desktop runtime.');
  }
  const channel = new Channel<PtyEvent>();
  channel.onmessage = onEvent;
  return invoke<number>('pty_spawn', { cols, rows, onEvent: channel });
}

export async function writePty(sessionId: number, data: string): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('pty_write', { sessionId, data });
}

export async function resizePty(sessionId: number, cols: number, rows: number): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('pty_resize', { sessionId, cols, rows });
}

export async function killPty(sessionId: number): Promise<boolean> {
  if (!isTauriRuntime()) {
    return false;
  }
  return invoke<boolean>('pty_kill', { sessionId });
}
