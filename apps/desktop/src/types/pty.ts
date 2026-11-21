export type PtyEvent =
  | {
      type: 'data';
      sessionId: number;
      data: number[];
    }
  | {
      type: 'exited';
      sessionId: number;
      exitCode: number | null;
    };
