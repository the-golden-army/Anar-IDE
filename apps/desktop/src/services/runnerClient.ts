import { Channel, invoke } from '@tauri-apps/api/core';
import { isTauriRuntime } from './preferencesClient';
import type { RunnerAction, RunnerEvent } from '../types/runner';

export async function startCargoRun(
  action: RunnerAction,
  onEvent: (event: RunnerEvent) => void,
): Promise<number> {
  if (!isTauriRuntime()) {
    throw new Error('Cargo build/run requires the Tauri desktop runtime (`npm run tauri dev`).');
  }
  const channel = new Channel<RunnerEvent>();
  channel.onmessage = onEvent;
  return invoke<number>('start_cargo_run', { action, onEvent: channel });
}

export async function stopCargoRun(): Promise<boolean> {
  if (!isTauriRuntime()) {
    return false;
  }
  return invoke<boolean>('stop_cargo_run');
}

export async function sendRunStdin(input: string): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('send_run_stdin', { input });
}
