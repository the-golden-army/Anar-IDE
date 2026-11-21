import { invoke } from '@tauri-apps/api/core';
import { isTauriRuntime } from './preferencesClient';
import type { GitDiffResult, GitStatusReport } from '../types/git';

const EMPTY_STATUS: GitStatusReport = {
  gitAvailable: false,
  isGitRepo: false,
  branch: null,
  ahead: 0,
  behind: 0,
  entries: [],
  error: null,
};

export async function fetchGitStatus(): Promise<GitStatusReport> {
  if (!isTauriRuntime()) {
    return EMPTY_STATUS;
  }
  return invoke<GitStatusReport>('git_status');
}

export async function fetchGitDiff(relPath: string, staged: boolean): Promise<GitDiffResult> {
  if (!isTauriRuntime()) {
    return { relativePath: relPath, staged, diff: '' };
  }
  return invoke<GitDiffResult>('git_diff', { relPath, staged });
}

export async function stageGitFile(relPath: string): Promise<GitStatusReport> {
  if (!isTauriRuntime()) {
    return EMPTY_STATUS;
  }
  return invoke<GitStatusReport>('git_stage_file', { relPath });
}

export async function unstageGitFile(relPath: string): Promise<GitStatusReport> {
  if (!isTauriRuntime()) {
    return EMPTY_STATUS;
  }
  return invoke<GitStatusReport>('git_unstage_file', { relPath });
}
