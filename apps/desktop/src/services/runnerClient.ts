import { Channel, invoke } from '@tauri-apps/api/core';
import { isTauriRuntime } from './preferencesClient';
import type { CompilerBackend } from '../types/preferences';
import type { RunnerAction, RunnerEvent, RusturboAnalysis, RusturboStatus } from '../types/runner';

export async function startCargoRun(
  action: RunnerAction,
  onEvent: (event: RunnerEvent) => void,
  backend?: CompilerBackend,
  activeFile?: string,
): Promise<number> {
  if (!isTauriRuntime()) {
    throw new Error('Cargo build/run requires the Tauri desktop runtime (`npm run tauri dev`).');
  }
  const channel = new Channel<RunnerEvent>();
  channel.onmessage = onEvent;
  return invoke<number>('start_cargo_run', {
    action,
    backend: backend ?? null,
    activeFile: activeFile ?? null,
    onEvent: channel,
  });
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

const FALLBACK_RUSTURBO_STATUS: RusturboStatus = {
  available: false,
  binaryPath: null,
  version: null,
  configExists: false,
  configuredPreset: null,
  sharedTargets: null,
  linkerMode: null,
  supportsCheck: false,
  supportsTest: false,
  supportsJsonDiagnostics: false,
};

export async function getRusturboStatus(): Promise<RusturboStatus> {
  if (!isTauriRuntime()) {
    return FALLBACK_RUSTURBO_STATUS;
  }
  return invoke<RusturboStatus>('get_rusturbo_status');
}

export async function analyzeRusturbo(): Promise<RusturboAnalysis> {
  if (!isTauriRuntime()) {
    throw new Error('Rusturbo analysis requires the Tauri desktop runtime.');
  }
  return invoke<RusturboAnalysis>('analyze_rusturbo');
}

export async function initRusturboConfig(
  preset?: 'auto' | 'actix',
  profile?: 'balanced' | 'fastest' | 'safe',
): Promise<RusturboStatus> {
  if (!isTauriRuntime()) {
    throw new Error('Rusturbo initialization requires the Tauri desktop runtime.');
  }
  return invoke<RusturboStatus>('init_rusturbo_config', {
    preset: preset ?? null,
    profile: profile ?? null,
  });
}
