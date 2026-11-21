import type { DiagnosticItem } from './runner';

export type LspStatus = 'stopped' | 'starting' | 'indexing' | 'ready' | 'unavailable' | 'crashed';

export interface LspStatusEvent {
  status: LspStatus;
  detail: string | null;
}

export interface LspDiagnosticsEvent {
  relativePath: string;
  diagnostics: DiagnosticItem[];
}

export interface LspPosition {
  line: number;
  character: number;
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export interface LspCompletionItem {
  label: string;
  detail: string | null;
  documentation: string | null;
  kind: number | null;
  insertText: string | null;
  sortText: string | null;
}

export interface LspHoverInfo {
  contents: string;
  range: LspRange | null;
}

export interface LspLocation {
  relativePath: string;
  line: number;
  col: number;
}

export interface LspTextEdit {
  range: LspRange;
  newText: string;
}
