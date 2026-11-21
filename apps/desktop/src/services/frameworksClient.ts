import { Channel, invoke } from '@tauri-apps/api/core';
import { isTauriRuntime } from './preferencesClient';
import type {
  ProjectTemplateId,
  ProjectTemplateSummary,
  WorkspaceFrameworkReport,
} from '../types/frameworks';
import type { RunnerEvent } from '../types/runner';
import type { WorkspaceInfo } from '../types/workspace';

const FALLBACK_TEMPLATES: ProjectTemplateSummary[] = [
  {
    id: 'binary',
    name: 'Rust Binary (bin)',
    description: 'Minimal executable crate with `src/main.rs`.',
    category: 'Standard',
    framework: null,
  },
  {
    id: 'library',
    name: 'Rust Library (lib)',
    description: 'Library crate with unit tests in `src/lib.rs`.',
    category: 'Standard',
    framework: null,
  },
  {
    id: 'axum',
    name: 'Axum Web API',
    description: 'Async HTTP API with Axum + Tokio listening on port 3000.',
    category: 'Web API',
    framework: 'axum',
  },
  {
    id: 'actix-web',
    name: 'Actix Web API',
    description: 'HTTP service using Actix Web on port 8080.',
    category: 'Web API',
    framework: 'actix-web',
  },
  {
    id: 'rocket',
    name: 'Rocket Web App',
    description: 'Rocket 0.5 HTTP server with `#[get]` routes.',
    category: 'Web API',
    framework: 'rocket',
  },
  {
    id: 'dioxus',
    name: 'Dioxus App',
    description: 'Reactive Dioxus UI starter ready for `dx serve`.',
    category: 'Web / UI',
    framework: 'dioxus',
  },
  {
    id: 'leptos',
    name: 'Leptos Web App',
    description: 'Fine-grained reactive Leptos CSR starter.',
    category: 'Web / UI',
    framework: 'leptos',
  },
  {
    id: 'yew',
    name: 'Yew WASM App',
    description: 'Yew component app with `index.html` for Trunk.',
    category: 'Web / UI',
    framework: 'yew',
  },
  {
    id: 'tauri',
    name: 'Tauri Desktop App',
    description: 'Tauri v2 desktop app (`src-tauri` + static `src/`).',
    category: 'Desktop',
    framework: 'tauri',
  },
  {
    id: 'bevy',
    name: 'Bevy Game App',
    description: 'ECS starter app using Bevy `DefaultPlugins`.',
    category: 'Game',
    framework: 'bevy',
  },
  {
    id: 'clap',
    name: 'Clap CLI Tool',
    description: 'Command-line parser with `clap` derive macros.',
    category: 'CLI',
    framework: 'clap',
  },
];

export async function detectWorkspaceFrameworks(): Promise<WorkspaceFrameworkReport | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  return invoke<WorkspaceFrameworkReport>('detect_workspace_frameworks');
}

export async function listProjectTemplates(): Promise<ProjectTemplateSummary[]> {
  if (!isTauriRuntime()) {
    return FALLBACK_TEMPLATES;
  }
  return invoke<ProjectTemplateSummary[]>('list_project_templates');
}

export async function pickParentFolder(): Promise<string | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  return invoke<string | null>('pick_parent_folder');
}

export async function createProjectFromTemplate(
  parentDir: string,
  projectName: string,
  template: ProjectTemplateId,
): Promise<WorkspaceInfo> {
  if (!isTauriRuntime()) {
    throw new Error(
      'Project scaffolding requires the Tauri desktop runtime (`npm run tauri dev`).',
    );
  }
  return invoke<WorkspaceInfo>('create_project_from_template', {
    parentDir,
    projectName,
    template,
  });
}

export async function startProfileRun(
  profileId: string,
  onEvent: (event: RunnerEvent) => void,
): Promise<number> {
  if (!isTauriRuntime()) {
    throw new Error(
      'Framework run profiles require the Tauri desktop runtime (`npm run tauri dev`).',
    );
  }
  const channel = new Channel<RunnerEvent>();
  channel.onmessage = onEvent;
  return invoke<number>('start_profile_run', { profileId, onEvent: channel });
}
