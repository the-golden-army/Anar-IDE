export interface GitChangedFile {
  relativePath: string;
  indexStatus: string;
  worktreeStatus: string;
  staged: boolean;
  untracked: boolean;
}

export interface GitStatusReport {
  gitAvailable: boolean;
  isGitRepo: boolean;
  branch: string | null;
  ahead: number;
  behind: number;
  entries: GitChangedFile[];
  error: string | null;
}

export interface GitDiffResult {
  relativePath: string;
  staged: boolean;
  diff: string;
}
