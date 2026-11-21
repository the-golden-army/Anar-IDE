import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { PREFS_STORAGE_KEY, THEME_STORAGE_KEY } from './services/preferencesClient';
import { DEFAULT_PREFERENCES } from './types/preferences';
import type { WorkspaceFsEvent } from './types/workspace';

const invokeMock = vi.fn();
const fsListeners = new Set<(event: { payload: WorkspaceFsEvent[] }) => void>();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(
    async (eventName: string, handler: (event: { payload: WorkspaceFsEvent[] }) => void) => {
      if (eventName === 'workspace://fs-changed') {
        fsListeners.add(handler);
        return () => {
          fsListeners.delete(handler);
        };
      }
      return () => {};
    },
  ),
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
  };
  if (largeContent !== null) {
    files['src/huge.rs'] = largeContent;
  }

  let prefs = { ...DEFAULT_PREFERENCES };

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
      default:
        return prefs;
    }
  });

  return { files };
}

describe('Anar App Shell, Themes & Phase 3 Editor', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    document.documentElement.style.colorScheme = '';
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    invokeMock.mockReset();
    fsListeners.clear();
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
    expect(screen.getByText(/Clickable compiler diagnostics/i)).toBeInTheDocument();

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
});
