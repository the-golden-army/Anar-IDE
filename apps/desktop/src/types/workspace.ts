export interface FileEntry {
  name: string;
  relativePath: string;
  isDir: boolean;
  sizeBytes: number;
}

export interface WorkspaceInfo {
  name: string;
  rootPath: string;
  isCargoProject: boolean;
  entries: FileEntry[];
}

export type LineEnding = 'lf' | 'crlf';

export interface DocumentContent {
  relativePath: string;
  name: string;
  content: string;
  sizeBytes: number;
  modifiedMs: number | null;
  lineEnding: LineEnding;
  isLargeFile: boolean;
}

export interface SaveResult {
  relativePath: string;
  sizeBytes: number;
  modifiedMs: number | null;
}

export type WorkspaceFsEventKind = 'created' | 'modified' | 'removed';

export interface WorkspaceFsEvent {
  relativePath: string;
  kind: WorkspaceFsEventKind;
}

export interface EditorTab {
  relativePath: string;
  name: string;
  dirty: boolean;
  isLargeFile: boolean;
  lineEnding: LineEnding;
  sizeBytes: number;
  modifiedMs: number | null;
  externallyModified: boolean;
  deletedOnDisk: boolean;
  cursor: {
    line: number;
    col: number;
  };
}
