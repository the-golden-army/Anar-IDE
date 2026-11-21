import { Bug, Cpu, ExternalLink, Play, SlidersHorizontal, Wrench } from 'lucide-react';
import { ANAR_VERSION_LABEL } from './sampleWorkspace';
import { ThemeSwitcher } from './ThemeSwitcher';
import type { LspStatusEvent } from '../types/lsp';
import type { CompilerBackend, ThemeMode } from '../types/preferences';
import type { RunnerAction } from '../types/runner';

interface DebugSidebarViewProps {
  hasWorkspace: boolean;
  isRunning: boolean;
  onRunAction: (action: RunnerAction) => void;
  onOpenDebugConsole: () => void;
}

export function DebugSidebarView({
  hasWorkspace,
  isRunning,
  onRunAction,
  onOpenDebugConsole,
}: DebugSidebarViewProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="debug-view">
      <div className="flex h-10 shrink-0 items-center justify-between px-3">
        <span className="text-xs font-semibold text-[var(--text-primary)]">Run &amp; Debug</span>
        <Bug className="h-3.5 w-3.5 text-[var(--accent)]" />
      </div>

      <div className="anar-scroll flex-1 space-y-3 overflow-y-auto px-3 pb-3 text-xs">
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
          <p className="font-medium text-[var(--text-primary)]">Cargo Launch Profile</p>
          <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
            {hasWorkspace
              ? 'Run Cargo binary or check diagnostics in the integrated Debug Console.'
              : 'Open a Cargo workspace to launch and inspect builds.'}
          </p>
          <div className="mt-2.5 flex gap-1.5">
            <button
              type="button"
              disabled={!hasWorkspace || isRunning}
              onClick={() => onRunAction('run')}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-[var(--accent-strong)] px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Play className="h-3 w-3" />
              <span>Run Crate</span>
            </button>
            <button
              type="button"
              onClick={onOpenDebugConsole}
              className="inline-flex items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-2.5 py-1.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              Console
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
          <p className="text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
            Breakpoints
          </p>
          <p className="mt-1.5 text-[11px] text-[var(--text-secondary)]">
            No active breakpoints configured.
          </p>
        </div>

        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
          <p className="text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
            Variables &amp; Call Stack
          </p>
          <p className="mt-1.5 text-[11px] text-[var(--text-secondary)]">
            Attach a session or run Cargo checks to populate diagnostics.
          </p>
        </div>
      </div>
    </div>
  );
}

interface SettingsSidebarViewProps {
  themeMode: ThemeMode;
  zoomPercent: number;
  compilerBackend: CompilerBackend;
  lspStatus: LspStatusEvent;
  onThemeChange: (mode: ThemeMode) => void;
  onThemeCycle: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onZoomIn: () => void;
  onOpenInspector: () => void;
}

export function SettingsSidebarView({
  themeMode,
  zoomPercent,
  compilerBackend,
  lspStatus,
  onThemeChange,
  onThemeCycle,
  onZoomOut,
  onZoomReset,
  onZoomIn,
  onOpenInspector,
}: SettingsSidebarViewProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="settings-view">
      <div className="flex h-10 shrink-0 items-center justify-between px-3">
        <span className="text-xs font-semibold text-[var(--text-primary)]">Settings</span>
        <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--accent)]" />
      </div>

      <div className="anar-scroll flex-1 space-y-3 overflow-y-auto px-3 pb-3 text-xs">
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
          <p className="font-medium text-[var(--text-primary)]">Appearance</p>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Theme mode</p>
          <div className="mt-2">
            <ThemeSwitcher mode={themeMode} onChange={onThemeChange} onCycle={onThemeCycle} />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[11px] text-[var(--text-secondary)]">Interface zoom</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Zoom out"
                onClick={onZoomOut}
                className="h-6 w-6 rounded border border-[var(--border-subtle)] bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)]"
              >
                -
              </button>
              <button
                type="button"
                aria-label="Reset zoom"
                onClick={onZoomReset}
                className="h-6 rounded border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-2 font-[family-name:var(--font-mono)] text-[11px] hover:bg-[var(--bg-hover)]"
              >
                {zoomPercent}%
              </button>
              <button
                type="button"
                aria-label="Zoom in"
                onClick={onZoomIn}
                className="h-6 w-6 rounded border border-[var(--border-subtle)] bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)]"
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
          <div className="flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
            <Cpu className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span>Rust Toolchain</span>
          </div>
          <p className="mt-1.5 text-[11px] text-[var(--text-secondary)]">
            Backend:{' '}
            <span className="font-medium text-[var(--text-primary)]">
              {compilerBackend === 'rusturbo' ? 'Rusturbo' : 'Cargo'}
            </span>
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
            rust-analyzer:{' '}
            <span className="font-medium text-[var(--text-primary)]">{lspStatus.status}</span>
          </p>
          <button
            type="button"
            onClick={onOpenInspector}
            className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[var(--accent-ring)] bg-[var(--accent-muted)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--accent-strong)] hover:text-white"
          >
            <Wrench className="h-3 w-3" />
            <span>Open Toolchain Inspector</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function AboutSidebarView() {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="about-view">
      <div className="flex h-10 shrink-0 items-center justify-between px-3">
        <span className="text-xs font-semibold text-[var(--text-primary)]">About Anar</span>
        <span className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[10px] text-[var(--text-secondary)]">
          {ANAR_VERSION_LABEL}
        </span>
      </div>

      <div className="anar-scroll flex-1 space-y-3 overflow-y-auto px-3 pb-3 text-xs">
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
          <p className="font-semibold text-[var(--text-primary)]">Anar Desktop Editor</p>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">
            Focused Rust engineering environment built with Tauri 2, React, CodeMirror 6,
            rust-analyzer, Cargo, Rusturbo, and portable PTY terminals.
          </p>
        </div>

        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
          <p className="text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
            Developer
          </p>
          <p className="mt-1.5 font-medium text-[var(--text-primary)]">Nour Yahyaoui</p>
          <a
            href="https://github.com/Nour-yahyaoui"
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-[11px] text-[var(--accent)] hover:underline"
          >
            <span>github.com/Nour-yahyaoui</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
