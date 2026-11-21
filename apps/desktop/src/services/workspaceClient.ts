import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { isTauriRuntime } from './preferencesClient';
import type {
  DocumentContent,
  FileEntry,
  SaveResult,
  WorkspaceFsEvent,
  WorkspaceInfo,
} from '../types/workspace';

export const WORKSPACE_FS_EVENT = 'workspace://fs-changed';

function requireDesktopRuntime(): void {
  if (!isTauriRuntime()) {
    throw new Error('Filesystem access requires running Anar as a Tauri desktop app.');
  }
}

export async function pickWorkspaceFolder(): Promise<WorkspaceInfo | null> {
  requireDesktopRuntime();
  return invoke<WorkspaceInfo | null>('pick_workspace_folder');
}

export async function openWorkspaceFolder(path: string): Promise<WorkspaceInfo> {
  requireDesktopRuntime();
  return invoke<WorkspaceInfo>('open_workspace_folder', { path });
}

export async function listWorkspaceDir(relPath: string): Promise<FileEntry[]> {
  requireDesktopRuntime();
  return invoke<FileEntry[]>('list_workspace_dir', { relPath });
}

export async function readWorkspaceFile(relPath: string): Promise<DocumentContent> {
  requireDesktopRuntime();
  return invoke<DocumentContent>('read_workspace_file', { relPath });
}

export async function saveWorkspaceFile(relPath: string, content: string): Promise<SaveResult> {
  requireDesktopRuntime();
  return invoke<SaveResult>('save_workspace_file', { relPath, content });
}

export async function createWorkspaceFile(relPath: string): Promise<string> {
  requireDesktopRuntime();
  return invoke<string>('create_workspace_file', { relPath });
}

export async function createWorkspaceDir(relPath: string): Promise<string> {
  requireDesktopRuntime();
  return invoke<string>('create_workspace_dir', { relPath });
}

export async function renameWorkspaceEntry(from: string, to: string): Promise<string> {
  requireDesktopRuntime();
  return invoke<string>('rename_workspace_entry', { from, to });
}

export async function deleteWorkspaceEntry(relPath: string): Promise<void> {
  requireDesktopRuntime();
  return invoke<void>('delete_workspace_entry', { relPath });
}

export async function listenWorkspaceFsEvents(
  handler: (events: WorkspaceFsEvent[]) => void,
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) {
    return () => {};
  }
  return listen<WorkspaceFsEvent[]>(WORKSPACE_FS_EVENT, (event) => {
    if (Array.isArray(event.payload) && event.payload.length > 0) {
      handler(event.payload);
    }
  });
}
