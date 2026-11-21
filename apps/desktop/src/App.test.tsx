import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { PREFS_STORAGE_KEY, THEME_STORAGE_KEY } from './services/preferencesClient';
import type { LspDiagnosticsEvent, LspStatusEvent } from './types/lsp';
import { DEFAULT_PREFERENCES } from './types/preferences';
import type { RunnerAction, RunnerEvent } from './types/runner';
import type { WorkspaceFsEvent } from './types/workspace';

const invokeMock = vi.fn();
const fsListeners = new Set<(event: { payload: WorkspaceFsEvent[] }) => void>();
const lspStatusListeners = new Set<(event: { payload: LspStatusEvent }) => void>();
const lspDiagnosticsListeners = new Set<(event: { payload: LspDiagnosticsEvent }) => void>();

vi.mock('@tauri-apps/api/core', () => {
  class MockChannel<T = unknown> {
    onmessage: ((msg: T) => void) | null = null;
    constructor(onmessage?: (msg: T) => void) {
      this.onmessage = onmessage ?? null;
    }
  }
  return {
    invoke: (...args: unknown[]) => invokeMock(...args),
    Channel: MockChannel,
  };
});

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (eventName: string, handler: (event: { payload: unknown }) => void) => {
    if (eventName === 'workspace://fs-changed') {
      const typed = handler as (event: { payload: WorkspaceFsEvent[] }) => void;
      fsListeners.add(typed);
      return () => {
        fsListeners.delete(typed);
      };
    }
    if (eventName === 'lsp://status') {
      const typed = handler as (event: { payload: LspStatusEvent }) => void;
      lspStatusListeners.add(typed);
      return () => {
        lspStatusListeners.delete(typed);
      };
    }
    if (eventName === 'lsp://diagnostics') {
      const typed = handler as (event: { payload: LspDiagnosticsEvent }) => void;
      lspDiagnosticsListeners.add(typed);
      return () => {
        lspDiagnosticsListeners.delete(typed);
      };
    }
    return () => {};
  }),
}));

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
  fireEvent(window, new Event('resize'));
}

function mockMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      get matches() {
        return matches;
      },
      media: query,
      onchange: null,
      addEventListener: (_event: string, cb: (event: MediaQueryListEvent) => void) => {
        listeners.add(cb);
      },
      removeEventListener: (_event: string, cb: (event: MediaQueryListEvent) => void) => {
        listeners.delete(cb);
      },
      addListener: (cb: (event: MediaQueryListEvent) => void) => {
        listeners.add(cb);
      },
      removeListener: (cb: (event: MediaQueryListEvent) => void) => {
        listeners.delete(cb);
      },
      dispatchEvent: () => true,
    }),
  });

  return {
    trigger(nextMatches: boolean) {
      matches = nextMatches;
      for (const cb of listeners) {
        cb({ matches: nextMatches } as MediaQueryListEvent);
      }
    },
  };
}

function setupMockRustWorkspace(options?: { largeFileBytes?: number }) {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};

  const largeContent = options?.largeFileBytes
    ? `${'fn generated_item() -> usize { 42 }\n'.repeat(Math.ceil(options.largeFileBytes / 35))}`.slice(
        0,
        options.largeFileBytes,
      )
    : null;

  const files: Record<string, string> = {
    'Cargo.toml': '[package]\nname = "demo"\nversion = "0.1.0"\n',
    'src/main.rs': 'fn main() {\n    println!("hello anar");\n}\n',
    'src/lib.rs': 'pub fn greet() {}\n',
  };
  if (largeContent !== null) {
    files['src/huge.rs'] = largeContent;
  }

  let prefs = { ...DEFAULT_PREFERENCES };
  let fullscreen = false;
  let activeChannel: { onmessage: ((msg: RunnerEvent) => void) | null } | null = null;
  const stdinInputs: string[] = [];
  const lspOpenedPaths: string[] = [];

  const listDir = (relDir: string) => {
    if (relDir === '') {
      return [
        { name: 'src', relativePath: 'src', isDir: true, sizeBytes: 0 },
        {
          name: 'Cargo.toml',
          relativePath: 'Cargo.toml',
          isDir: false,
          sizeBytes: files['Cargo.toml'].length,
        },
      ];
    }
    if (relDir === 'src') {
      return Object.keys(files)
        .filter((k) => k.startsWith('src/'))
        .sort()
        .map((k) => ({
          name: k.slice(4),
          relativePath: k,
          isDir: false,
          sizeBytes: files[k].length,
        }));
    }
    return [];
  };

  invokeMock.mockImplementation(async (cmd: string, payload?: Record<string, unknown>) => {
    switch (cmd) {
      case 'get_preferences':
        return prefs;
      case 'set_theme_mode':
        prefs = { ...prefs, theme: (payload?.mode as typeof prefs.theme) ?? prefs.theme };
        return prefs;
      case 'update_layout_preferences':
        return prefs;
      case 'pick_workspace_folder':
      case 'open_workspace_folder': {
        prefs = {
          ...prefs,
          recentWorkspaces: [{ name: 'demo', path: '/tmp/demo' }],
        };
        return {
          rootPath: '/tmp/demo',
          name: 'demo',
          isCargoProject: true,
          entries: listDir(''),
        };
      }
      case 'list_workspace_dir':
        return listDir((payload?.relPath as string) ?? '');
      case 'read_workspace_file': {
        const relPath = payload?.relPath as string;
        const content = files[relPath];
        if (content === undefined) {
          throw new Error(`Missing file: ${relPath}`);
        }
        return {
          relativePath: relPath,
          name: relPath.split('/').pop() ?? relPath,
          content,
          sizeBytes: content.length,
          isLargeFile: content.length >= 1024 * 1024,
          lineEnding: 'lf',
          modifiedMs: 1000,
        };
      }
      case 'save_workspace_file': {
        const relPath = payload?.relPath as string;
        const content = payload?.content as string;
        files[relPath] = content;
        return {
          relativePath: relPath,
          sizeBytes: content.length,
          modifiedMs: 2000,
        };
      }
      case 'create_workspace_file': {
        const relPath = payload?.relPath as string;
        files[relPath] = '';
        return relPath;
      }
      case 'create_workspace_dir':
        return (payload?.relPath as string) ?? '';
      case 'rename_workspace_entry': {
        const from = payload?.from as string;
        const to = payload?.to as string;
        files[to] = files[from] ?? '';
        delete files[from];
        return to;
      }
      case 'delete_workspace_entry': {
        const relPath = payload?.relPath as string;
        delete files[relPath];
        return null;
      }
      case 'is_window_fullscreen':
        return fullscreen;
      case 'toggle_window_fullscreen':
        fullscreen = !fullscreen;
        return fullscreen;
      case 'start_cargo_run': {
        const action = payload?.action as RunnerAction;
        activeChannel = payload?.onEvent as { onmessage: ((msg: RunnerEvent) => void) | null };
        queueMicrotask(() => {
          activeChannel?.onmessage?.({
            type: 'started',
            runId: 1,
            action,
            command: `cargo ${action} --message-format=json`,
          });
          activeChannel?.onmessage?.({
            type: 'output',
            runId: 1,
            stream: 'stdout',
            line: 'give me a value',
          });
        });
        return 1;
      }
      case 'send_run_stdin': {
        const input = (payload?.input as string) ?? '';
        stdinInputs.push(input);
        queueMicrotask(() => {
          activeChannel?.onmessage?.({
            type: 'output',
            runId: 1,
            stream: 'stdout',
            line: `this is the value ${input}`,
          });
          activeChannel?.onmessage?.({
            type: 'finished',
            runId: 1,
            action: 'run',
            exitCode: 0,
            cancelled: false,
            durationMs: 120,
          });
        });
        return null;
      }
      case 'stop_cargo_run':
        activeChannel?.onmessage?.({
          type: 'finished',
          runId: 1,
          action: 'run',
          exitCode: null,
          cancelled: true,
          durationMs: 50,
        });
        return true;
      case 'lsp_get_status':
        return { status: 'ready', detail: null };
      case 'lsp_restart':
        for (const cb of lspStatusListeners) {
          cb({ payload: { status: 'ready', detail: null } });
        }
        return null;
      case 'lsp_did_open':
        lspOpenedPaths.push((payload?.relPath as string) ?? '');
        return null;
      case 'lsp_did_change':
      case 'lsp_did_save':
      case 'lsp_did_close':
        return null;
      case 'lsp_completion':
        return [
          {
            label: 'println!',
            detail: 'macro_rules! println',
            documentation: null,
            kind: 15,
            insertText: null,
            sortText: null,
          },
        ];
      case 'lsp_hover':
        return { contents: 'fn main()', range: null };
      case 'lsp_goto_definition':
        return [{ relativePath: 'src/lib.rs', line: 1, col: 8 }];
      case 'lsp_format_document':
        return [
          {
            range: {
              start: { line: 0, character: 0 },
              end: { line: 3, character: 0 },
            },
            newText: 'fn main() {\n    println!("formatted anar");\n}\n',
          },
        ];
      case 'detect_workspace_frameworks':
        return {
          packageName: 'demo',
          workspaceMembers: [],
          detected: [
            {
              kind: 'axum',
              displayName: 'Axum',
              crateName: 'axum',
              category: 'web-api',
              versionSpec: '0.7',
              resolvedVersion: '0.7.9',
              sourceManifest: 'Cargo.toml',
              direct: true,
            },
          ],
          profiles: [
            {
              id: 'axum-serve',
              label: 'Axum Server (Dev)',
              description: 'Runs the Axum HTTP server in debug mode.',
              framework: 'axum',
              program: 'cargo',
              args: ['run', '--message-format=json'],
              workingSubdir: null,
              defaultPort: 3000,
              readinessHints: ['listening on'],
              requiredTool: 'cargo',
              toolAvailable: true,
              parseCargoJson: true,
            },
          ],
          defaultProfileId: 'axum-serve',
        };
      case 'list_project_templates':
        return [
          {
            id: 'binary',
            name: 'Rust Binary (bin)',
            description: 'Minimal executable crate with `src/main.rs`.',
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
        ];
      case 'pick_parent_folder':
        return '/tmp/projects';
      case 'create_project_from_template': {
        const name = (payload?.projectName as string) || 'new-app';
        const parentDir = (payload?.parentDir as string) || '/tmp/projects';
        return {
          rootPath: `${parentDir}/${name}`,
          name,
          isCargoProject: true,
          entries: listDir(''),
        };
      }
      case 'start_profile_run': {
        const profileId = (payload?.profileId as string) || 'axum-serve';
        activeChannel = payload?.onEvent as { onmessage: ((msg: RunnerEvent) => void) | null };
        queueMicrotask(() => {
          activeChannel?.onmessage?.({
            type: 'started',
            runId: 2,
            action: 'run',
            command: `cargo run --message-format=json (${profileId})`,
          });
          activeChannel?.onmessage?.({
            type: 'output',
            runId: 2,
            stream: 'stdout',
            line: 'listening on http://127.0.0.1:3000',
          });
          activeChannel?.onmessage?.({
            type: 'finished',
            runId: 2,
            action: 'run',
            exitCode: 0,
            cancelled: false,
            durationMs: 90,
          });
        });
        return 2;
      }
      default:
        return prefs;
    }
  });

  return {
    files,
    stdinInputs,
    lspOpenedPaths,
    emitRunnerEvent: (event: RunnerEvent) => activeChannel?.onmessage?.(event),
    emitLspStatus: (event: LspStatusEvent) => {
      for (const cb of lspStatusListeners) {
        cb({ payload: event });
      }
    },
    emitLspDiagnostics: (event: LspDiagnosticsEvent) => {
      for (const cb of lspDiagnosticsListeners) {
        cb({ payload: event });
      }
    },
  };
}

describe('Anar App Shell, Themes & Phase 3 Editor', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    document.documentElement.style.colorScheme = '';
    document.documentElement.style.fontSize = '';
    document.documentElement.style.removeProperty('--editor-font-size');
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    invokeMock.mockReset();
    fsListeners.clear();
    lspStatusListeners.clear();
    lspDiagnosticsListeners.clear();
    setViewportWidth(1280);
    mockMatchMedia(false);
  });

  it('renders titlebar, sidebar, welcome screen, bottom panel, and statusbar', () => {
    render(<App />);
    expect(screen.getByTestId('titlebar')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-panel')).toBeInTheDocument();
    expect(screen.getByTestId('welcome-screen')).toBeInTheDocument();
    expect(screen.getByTestId('bottom-panel')).toBeInTheDocument();
    expect(screen.getByTestId('statusbar')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Anar' })).toBeInTheDocument();
  });

  it('switches themes instantaneously and persists the selection', () => {
    render(<App />);

    const lightRadio = screen.getByRole('radio', { name: 'Light theme' });
    fireEvent.click(lightRadio);

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(lightRadio).toHaveAttribute('aria-checked', 'true');

    const darkRadio = screen.getByRole('radio', { name: 'Dark theme' });
    fireEvent.click(darkRadio);

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('tracks OS color-scheme changes when theme is set to system', () => {
    const media = mockMatchMedia(false);
    render(<App />);

    expect(document.documentElement.dataset.theme).toBe('dark');

    act(() => {
      media.trigger(true);
    });
    expect(document.documentElement.dataset.theme).toBe('light');

    act(() => {
      media.trigger(false);
    });
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('restores persisted theme across reloads', () => {
    window.localStorage.setItem(
      PREFS_STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_PREFERENCES, theme: 'light' }),
    );

    render(<App />);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.getByRole('radio', { name: 'Light theme' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('toggles panels via toolbar buttons and keyboard shortcuts', () => {
    render(<App />);

    expect(screen.getByTestId('sidebar-panel')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    expect(screen.queryByTestId('sidebar-panel')).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    expect(screen.getByTestId('sidebar-panel')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'j', ctrlKey: true });
    expect(screen.queryByTestId('bottom-panel')).not.toBeInTheDocument();

    expect(screen.queryByTestId('inspector-panel')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle right inspector panel' }));
    expect(screen.getByTestId('inspector-panel')).toBeInTheDocument();
  });

  it('switches sidebar and bottom panel tabs', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('tab', { name: 'Problems' }));
    expect(screen.getByText(/No compiler errors or warnings/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Source Control' }));
    expect(screen.getByText(/Git branch status/i)).toBeInTheDocument();
  });

  it('adapts controls cleanly for narrow window sizes', () => {
    setViewportWidth(460);
    render(<App />);

    expect(
      screen.getByRole('button', { name: /Theme: System\. Click to switch theme/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('welcome-screen')).toBeInTheDocument();
  });

  it('loads and persists preferences through Tauri IPC when available', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    invokeMock.mockImplementation(async (cmd: string, payload?: { mode?: string }) => {
      if (cmd === 'get_preferences') {
        return { ...DEFAULT_PREFERENCES, theme: 'light' };
      }
      if (cmd === 'set_theme_mode') {
        return { ...DEFAULT_PREFERENCES, theme: payload?.mode ?? 'dark' };
      }
      return DEFAULT_PREFERENCES;
    });

    render(<App />);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('get_preferences');
      expect(document.documentElement.dataset.theme).toBe('light');
    });

    fireEvent.click(screen.getByRole('radio', { name: 'Dark theme' }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('set_theme_mode', { mode: 'dark' });
    });
  });

  it('opens a Cargo workspace, opens multiple tabs, edits in CodeMirror, and saves via Ctrl+S', async () => {
    const { files } = setupMockRustWorkspace();
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }));

    await waitFor(() => {
      expect(screen.getByTestId('file-tree')).toBeInTheDocument();
      expect(screen.getByText('main.rs')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'main.rs' }));
    await waitFor(() => {
      expect(screen.getByTestId('codemirror-editor')).toHaveAttribute(
        'data-active-path',
        'src/main.rs',
      );
      expect(screen.getByText('Rust')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cargo.toml' }));
    await waitFor(() => {
      expect(screen.getByTestId('codemirror-editor')).toHaveAttribute(
        'data-active-path',
        'Cargo.toml',
      );
      expect(screen.getByText('TOML')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'main.rs' }));
    await waitFor(() => {
      expect(screen.getByTestId('codemirror-editor')).toHaveAttribute(
        'data-active-path',
        'src/main.rs',
      );
    });

    const cmContent = screen.getByTestId('codemirror-editor').querySelector('.cm-content');
    expect(cmContent).not.toBeNull();
    // Simulate typing into CodeMirror via its contentEditable DOM or Save shortcut after edit.
    const cmEditable = cmContent as HTMLElement;
    cmEditable.textContent = 'fn main() { println!("edited"); }';
    fireEvent.input(cmEditable);

    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('save_workspace_file', {
        relPath: 'src/main.rs',
        content: expect.any(String),
      });
    });
    expect(files['src/main.rs']).toBeDefined();
  });

  it('creates, renames, and deletes workspace entries from the explorer', async () => {
    setupMockRustWorkspace();
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }));
    await waitFor(() => {
      expect(screen.getByText('main.rs')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'New file' }));
    const input = screen.getByLabelText('New file name');
    fireEvent.change(input, { target: { value: 'src/helper.rs' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('create_workspace_file', {
        relPath: 'src/helper.rs',
      });
      expect(screen.getByRole('tab', { name: 'helper.rs' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'helper.rs' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Rename helper.rs' }));
    const renameInput = screen.getByLabelText('Rename helper.rs');
    fireEvent.change(renameInput, { target: { value: 'utils.rs' } });
    fireEvent.submit(renameInput.closest('form')!);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('rename_workspace_entry', {
        from: 'src/helper.rs',
        to: 'src/utils.rs',
      });
      expect(screen.getByRole('button', { name: 'utils.rs' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Delete utils.rs' }));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('delete_workspace_entry', {
        relPath: 'src/utils.rs',
      });
    });
  });

  it('opens a 5 MB Rust file in large-file mode without freezing and switches tabs cleanly', async () => {
    setupMockRustWorkspace({ largeFileBytes: 5 * 1024 * 1024 });
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }));
    await waitFor(() => {
      expect(screen.getByText('huge.rs')).toBeInTheDocument();
    });

    const t0 = performance.now();
    fireEvent.click(screen.getByRole('button', { name: 'huge.rs' }));

    await waitFor(() => {
      expect(screen.getByTestId('codemirror-editor')).toHaveAttribute(
        'data-active-path',
        'src/huge.rs',
      );
      expect(screen.getByTestId('codemirror-editor')).toHaveAttribute('data-large-file', 'true');
      expect(screen.getByText('Large file mode')).toBeInTheDocument();
    });
    const elapsedMs = performance.now() - t0;
    expect(elapsedMs).toBeLessThan(5000);

    fireEvent.click(screen.getByRole('button', { name: 'Cargo.toml' }));
    await waitFor(() => {
      expect(screen.getByTestId('codemirror-editor')).toHaveAttribute('data-large-file', 'false');
    });
  });

  it('auto-reloads clean tabs on external change and warns before overwriting dirty tabs', async () => {
    const { files } = setupMockRustWorkspace();
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }));
    await waitFor(() => {
      expect(screen.getByText('main.rs')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'main.rs' }));
    await waitFor(() => {
      expect(screen.getByTestId('codemirror-editor')).toHaveAttribute(
        'data-active-path',
        'src/main.rs',
      );
    });

    // Clean tab: external modification auto-reloads.
    files['src/main.rs'] = 'fn main() {\n    println!("reloaded");\n}\n';
    act(() => {
      for (const listener of fsListeners) {
        listener({ payload: [{ relativePath: 'src/main.rs', kind: 'modified' }] });
      }
    });

    await waitFor(() => {
      expect(screen.getByText(/Reloaded main\.rs from disk/i)).toBeInTheDocument();
    });

    // Dirty tab: external modification surfaces a non-destructive conflict banner.
    const cmEditable = screen
      .getByTestId('codemirror-editor')
      .querySelector('.cm-content') as HTMLElement;
    cmEditable.textContent = 'fn main() { /* unsaved edit */ }';
    fireEvent.input(cmEditable);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save active file' })).toBeInTheDocument();
    });

    files['src/main.rs'] = 'fn main() { /* external edit */ }\n';
    act(() => {
      for (const listener of fsListeners) {
        listener({ payload: [{ relativePath: 'src/main.rs', kind: 'modified' }] });
      }
    });

    await waitFor(() => {
      expect(screen.getByTestId('external-change-banner')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Reload from disk' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep my edits' })).toBeInTheDocument();
  });

  it('scales UI and editor zoom with Ctrl+/Ctrl-/Ctrl+0 and persists zoomPercent', async () => {
    render(<App />);

    expect(screen.getByRole('button', { name: 'Reset zoom' })).toHaveTextContent('100%');
    expect(document.documentElement.style.fontSize).toBe('16px');
    expect(document.documentElement.style.getPropertyValue('--editor-font-size')).toBe('13px');

    fireEvent.keyDown(window, { key: '=', ctrlKey: true });
    expect(screen.getByRole('button', { name: 'Reset zoom' })).toHaveTextContent('110%');
    expect(document.documentElement.style.fontSize).toBe('17.6px');
    expect(document.documentElement.style.getPropertyValue('--editor-font-size')).toBe('14.3px');

    fireEvent.keyDown(window, { key: '-', ctrlKey: true });
    fireEvent.keyDown(window, { key: '-', ctrlKey: true });
    expect(screen.getByRole('button', { name: 'Reset zoom' })).toHaveTextContent('90%');
    expect(document.documentElement.style.fontSize).toBe('14.4px');

    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(PREFS_STORAGE_KEY) ?? '{}');
      expect(stored.layout?.zoomPercent).toBe(90);
    });

    fireEvent.keyDown(window, { key: '0', ctrlKey: true });
    expect(screen.getByRole('button', { name: 'Reset zoom' })).toHaveTextContent('100%');
    expect(document.documentElement.style.fontSize).toBe('16px');
  });

  it('toggles fullscreen via TitleBar button and F11 shortcut', async () => {
    setupMockRustWorkspace();
    render(<App />);

    const fsBtn = await screen.findByRole('button', { name: 'Enter fullscreen' });
    expect(fsBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(fsBtn);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    fireEvent.keyDown(window, { key: 'F11' });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Enter fullscreen' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });
  });

  it('runs Cargo project, streams Output + stdin, and jumps to Problems diagnostics', async () => {
    const { stdinInputs, emitRunnerEvent } = setupMockRustWorkspace();
    render(<App />);

    // Open workspace first.
    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'main.rs' })).toBeInTheDocument();
    });

    // Click Run in TitleBar.
    fireEvent.click(screen.getByRole('button', { name: 'Run project' }));
    await waitFor(() => {
      expect(screen.getByTestId('runner-output')).toHaveTextContent('give me a value');
    });

    // Send interactive stdin line while process is running.
    const stdinInput = screen.getByLabelText('Process stdin input');
    fireEvent.change(stdinInput, { target: { value: '42' } });
    fireEvent.submit(stdinInput.closest('form')!);

    await waitFor(() => {
      expect(stdinInputs).toEqual(['42']);
      expect(screen.getByTestId('runner-output')).toHaveTextContent('this is the value 42');
    });

    // Emit a compiler error diagnostic and click it in the Problems tab.
    act(() => {
      emitRunnerEvent({
        type: 'diagnostic',
        runId: 1,
        diagnostic: {
          severity: 'error',
          code: 'E0308',
          message: 'mismatched types',
          rendered: 'error[E0308]: mismatched types\n',
          primarySpan: {
            fileName: 'src/main.rs',
            lineStart: 2,
            lineEnd: 2,
            columnStart: 5,
            columnEnd: 12,
            isPrimary: true,
            label: 'expected `i32`',
          },
          spans: [],
        },
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open problems panel' }));
    const problemBtn = await screen.findByRole('button', { name: /mismatched types/i });
    fireEvent.click(problemBtn);

    await waitFor(() => {
      expect(screen.getByTestId('codemirror-editor')).toHaveAttribute(
        'data-active-path',
        'src/main.rs',
      );
    });
  });

  it('syncs rust-analyzer status, live LSP diagnostics, go-to-definition, and formatting', async () => {
    const { lspOpenedPaths, emitLspStatus, emitLspDiagnostics } = setupMockRustWorkspace();
    render(<App />);

    // Open workspace and open src/main.rs.
    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'main.rs' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'main.rs' }));
    await waitFor(() => {
      expect(lspOpenedPaths).toContain('src/main.rs');
      expect(screen.getByTestId('lsp-status-label')).toHaveTextContent('rust-analyzer: ready');
    });

    // Emit indexing -> ready status updates and live diagnostics from rust-analyzer.
    act(() => {
      emitLspStatus({ status: 'indexing', detail: 'loading metadata' });
    });
    expect(screen.getByTestId('lsp-status-label')).toHaveTextContent(
      'rust-analyzer: indexing (loading metadata)',
    );

    act(() => {
      emitLspStatus({ status: 'ready', detail: null });
      emitLspDiagnostics({
        relativePath: 'src/main.rs',
        diagnostics: [
          {
            severity: 'warning',
            code: 'unused_variables',
            message: 'unused variable: `draft`',
            rendered: null,
            primarySpan: {
              fileName: 'src/main.rs',
              lineStart: 2,
              lineEnd: 2,
              columnStart: 5,
              columnEnd: 10,
              isPrimary: true,
              label: null,
            },
            spans: [],
          },
        ],
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open problems panel' }));
    expect(await screen.findByText(/unused variable: `draft`/i)).toBeInTheDocument();

    // Trigger Format Rust File from the Inspector panel.
    fireEvent.click(screen.getByRole('button', { name: 'Toggle right inspector panel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Format Rust File' }));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('lsp_format_document', { relPath: 'src/main.rs' });
    });

    // Trigger F12 go-to-definition inside CodeMirror and verify cross-file jump to src/lib.rs.
    const cmContent = screen.getByTestId('codemirror-editor').querySelector('.cm-content')!;
    fireEvent.keyDown(cmContent, { key: 'F12' });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('lsp_goto_definition', {
        relPath: 'src/main.rs',
        line: expect.any(Number),
        col: expect.any(Number),
      });
      expect(screen.getByTestId('codemirror-editor')).toHaveAttribute(
        'data-active-path',
        'src/lib.rs',
      );
    });
  });

  it('detects workspace frameworks, displays run profiles, and runs a profile', async () => {
    setupMockRustWorkspace();
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }));
    await waitFor(() => {
      expect(screen.getByTestId('statusbar-frameworks')).toHaveTextContent('Axum');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Toggle right inspector panel' }));
    const frameworkSection = screen.getByTestId('inspector-framework-section');
    expect(frameworkSection).toHaveTextContent('Axum');
    expect(frameworkSection).toHaveTextContent('0.7.9');
    expect(frameworkSection).toHaveTextContent('Axum Server (Dev)');

    fireEvent.click(screen.getByRole('button', { name: 'Run profile Axum Server (Dev)' }));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        'start_profile_run',
        expect.objectContaining({ profileId: 'axum-serve' }),
      );
      expect(screen.getByTestId('bottom-panel')).toHaveTextContent(
        'listening on http://127.0.0.1:3000',
      );
    });
  });

  it('scaffolds a new project from template via NewProjectModal', async () => {
    setupMockRustWorkspace();
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /new rust project/i }));
    const modal = await screen.findByTestId('new-project-modal');
    expect(modal).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('template-card-axum')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'hello-axum' } });
    fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Parent directory')).toHaveValue('/tmp/projects');
    });

    fireEvent.click(screen.getByTestId('template-card-axum'));
    fireEvent.click(screen.getByRole('button', { name: /create & open/i }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('create_project_from_template', {
        parentDir: '/tmp/projects',
        projectName: 'hello-axum',
        template: 'axum',
      });
      expect(screen.getByTestId('titlebar')).toHaveTextContent('hello-axum');
    });
  });
});
