export type RunnerAction = 'build' | 'run' | 'check' | 'test';

export type OutputStream = 'stdout' | 'stderr';

export type DiagnosticSeverity = 'error' | 'warning' | 'note' | 'help';

export interface DiagnosticSpan {
  fileName: string;
  lineStart: number;
  lineEnd: number;
  columnStart: number;
  columnEnd: number;
  isPrimary: boolean;
  label: string | null;
}

export interface DiagnosticItem {
  severity: DiagnosticSeverity;
  code: string | null;
  message: string;
  rendered: string | null;
  primarySpan: DiagnosticSpan | null;
  spans: DiagnosticSpan[];
}

export type RunnerEvent =
  | {
      type: 'started';
      runId: number;
      action: RunnerAction;
      command: string;
    }
  | {
      type: 'output';
      runId: number;
      stream: OutputStream;
      line: string;
    }
  | {
      type: 'diagnostic';
      runId: number;
      diagnostic: DiagnosticItem;
    }
  | {
      type: 'finished';
      runId: number;
      action: RunnerAction;
      exitCode: number | null;
      cancelled: boolean;
      durationMs: number;
    };

export interface OutputLine {
  id: number;
  stream: OutputStream | 'system';
  text: string;
}
