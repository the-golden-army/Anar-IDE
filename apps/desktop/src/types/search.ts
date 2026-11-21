export interface SearchMatch {
  line: number;
  col: number;
  lineText: string;
  matchStart: number;
  matchEnd: number;
}

export interface SearchFileMatches {
  relativePath: string;
  matches: SearchMatch[];
}

export interface WorkspaceSearchResult {
  query: string;
  files: SearchFileMatches[];
  totalMatches: number;
  truncated: boolean;
}
