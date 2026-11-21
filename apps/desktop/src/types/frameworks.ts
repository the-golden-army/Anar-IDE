export type FrameworkKind =
  'axum' | 'actix-web' | 'rocket' | 'dioxus' | 'leptos' | 'yew' | 'tauri' | 'bevy' | 'clap';

export type FrameworkCategory =
  'web-api' | 'web-frontend' | 'desktop' | 'game-engine' | 'cli' | 'standard';

export type ProjectTemplateId =
  | 'binary'
  | 'library'
  | 'axum'
  | 'actix-web'
  | 'rocket'
  | 'dioxus'
  | 'leptos'
  | 'yew'
  | 'tauri'
  | 'bevy'
  | 'clap';

export interface DetectedFramework {
  kind: FrameworkKind;
  displayName: string;
  crateName: string;
  category: FrameworkCategory;
  versionSpec: string | null;
  resolvedVersion: string | null;
  sourceManifest: string;
  direct: boolean;
}

export interface RunProfile {
  id: string;
  label: string;
  description: string;
  framework: FrameworkKind | null;
  program: string;
  args: string[];
  workingSubdir: string | null;
  defaultPort: number | null;
  readinessHints: string[];
  requiredTool: string | null;
  toolAvailable: boolean;
  parseCargoJson: boolean;
}

export interface WorkspaceFrameworkReport {
  packageName: string | null;
  workspaceMembers: string[];
  detected: DetectedFramework[];
  profiles: RunProfile[];
  defaultProfileId: string | null;
}

export interface ProjectTemplateSummary {
  id: ProjectTemplateId;
  name: string;
  description: string;
  category: string;
  framework: FrameworkKind | null;
}
