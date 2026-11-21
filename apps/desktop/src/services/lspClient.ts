import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { isTauriRuntime } from './preferencesClient';
import type {
  LspCompletionItem,
  LspDiagnosticsEvent,
  LspHoverInfo,
  LspLocation,
  LspStatusEvent,
  LspTextEdit,
} from '../types/lsp';

export async function getLspStatus(): Promise<LspStatusEvent> {
  if (!isTauriRuntime()) {
    return { status: 'stopped', detail: null };
  }
  return invoke<LspStatusEvent>('lsp_get_status');
}

export async function restartLsp(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('lsp_restart');
}

export async function lspDidOpen(
  relPath: string,
  languageId: string,
  content: string,
): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('lsp_did_open', { relPath, languageId, content });
}

export async function lspDidChange(relPath: string, content: string): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('lsp_did_change', { relPath, content });
}

export async function lspDidSave(relPath: string): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('lsp_did_save', { relPath });
}

export async function lspDidClose(relPath: string): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('lsp_did_close', { relPath });
}

export async function lspCompletion(
  relPath: string,
  line: number,
  col: number,
): Promise<LspCompletionItem[]> {
  if (!isTauriRuntime()) {
    return [];
  }
  return invoke<LspCompletionItem[]>('lsp_completion', { relPath, line, col });
}

export async function lspHover(
  relPath: string,
  line: number,
  col: number,
): Promise<LspHoverInfo | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  return invoke<LspHoverInfo | null>('lsp_hover', { relPath, line, col });
}

export async function lspGotoDefinition(
  relPath: string,
  line: number,
  col: number,
): Promise<LspLocation[]> {
  if (!isTauriRuntime()) {
    return [];
  }
  return invoke<LspLocation[]>('lsp_goto_definition', { relPath, line, col });
}

export async function lspFormatDocument(relPath: string): Promise<LspTextEdit[]> {
  if (!isTauriRuntime()) {
    return [];
  }
  return invoke<LspTextEdit[]>('lsp_format_document', { relPath });
}

export async function onLspStatus(handler: (event: LspStatusEvent) => void): Promise<UnlistenFn> {
  if (!isTauriRuntime()) {
    return () => {};
  }
  return listen<LspStatusEvent>('lsp://status', (event) => {
    handler(event.payload);
  });
}

export async function onLspDiagnostics(
  handler: (event: LspDiagnosticsEvent) => void,
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) {
    return () => {};
  }
  return listen<LspDiagnosticsEvent>('lsp://diagnostics', (event) => {
    handler(event.payload);
  });
}
