import { invoke } from '@tauri-apps/api/core';
import { isTauriRuntime } from './preferencesClient';
import type { WorkspaceSearchResult } from '../types/search';

export async function searchWorkspace(
  query: string,
  caseSensitive: boolean,
): Promise<WorkspaceSearchResult> {
  if (!isTauriRuntime()) {
    return { query, files: [], totalMatches: 0, truncated: false };
  }
  return invoke<WorkspaceSearchResult>('search_workspace', { query, caseSensitive });
}

export async function findWorkspaceFiles(query: string): Promise<string[]> {
  if (!isTauriRuntime()) {
    return [];
  }
  return invoke<string[]>('find_workspace_files', { query });
}
