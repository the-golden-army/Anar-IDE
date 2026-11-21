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

export interface RusturboStatus {
  available: boolean;
  binaryPath: string | null;
  version: string | null;
  configExists: boolean;
  configuredPreset: string | null;
  sharedTargets: boolean | null;
  linkerMode: string | null;
  supportsCheck: boolean;
  supportsTest: boolean;
  supportsJsonDiagnostics: boolean;
}

export interface RusturboAnalysis {
  rusturboVersion: string | null;
  configFound: boolean;
  linkerSelected: string | null;
  sccacheActive: boolean | null;
  sccachePath: string | null;
  packageCount: number | null;
  edgeCount: number | null;
  duplicateCount: number | null;
  cacheDecision: string | null;
  cacheReuse: string | null;
  cacheKey: string | null;
  advice: string[];
}
