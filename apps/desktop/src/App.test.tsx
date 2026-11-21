import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { PREFS_STORAGE_KEY, THEME_STORAGE_KEY } from './services/preferencesClient';
import { DEFAULT_PREFERENCES } from './types/preferences';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
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

describe('Anar Phase 2 App Shell & Themes', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    document.documentElement.style.colorScheme = '';
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    invokeMock.mockReset();
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
});
