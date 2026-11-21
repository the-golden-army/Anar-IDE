import { Cpu, Gauge, Layers, Play, RotateCw, Sparkles, Zap, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { WorkspaceFrameworkReport } from '../types/frameworks';
import type { LspStatusEvent } from '../types/lsp';
import { LAYOUT_LIMITS, type CompilerBackend } from '../types/preferences';
import type { RusturboAnalysis, RusturboStatus } from '../types/runner';

interface InspectorPanelProps {
  open: boolean;
  width: number;
  isCompact: boolean;
  lspStatus: LspStatusEvent;
  compilerBackend: CompilerBackend;
  rusturboStatus: RusturboStatus | null;
  rusturboAnalysis: RusturboAnalysis | null;
  rusturboBusy: boolean;
  frameworkReport: WorkspaceFrameworkReport | null;
  selectedProfileId: string | null;
  isRunning: boolean;
  hasWorkspace: boolean;
  canFormat: boolean;
  onRestartLsp: () => void;
  onFormatDocument: () => void;
  onSelectCompilerBackend: (backend: CompilerBackend) => void;
  onAnalyzeRusturbo: () => void;
  onInitRusturboConfig: () => void;
  onSelectProfile: (profileId: string) => void;
  onRunProfile: (profileId: string) => void;
  onClose: () => void;
  onResize: (width: number) => void;
}

export function InspectorPanel({
  open,
  width,
  isCompact,
  lspStatus,
  compilerBackend,
  rusturboStatus,
  rusturboAnalysis,
  rusturboBusy,
  frameworkReport,
  selectedProfileId,
  isRunning,
  hasWorkspace,
  canFormat,
  onRestartLsp,
  onFormatDocument,
  onSelectCompilerBackend,
  onAnalyzeRusturbo,
  onInitRusturboConfig,
  onSelectProfile,
  onRunProfile,
  onClose,
  onResize,
}: InspectorPanelProps) {
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);
  const [isResizing, setIsResizing] = useState(false);

  if (!open) {
    return null;
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    startXRef.current = event.clientX;
    startWidthRef.current = width;
    setIsResizing(true);
    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (moveEvent: PointerEvent) => {
      const delta = startXRef.current - moveEvent.clientX;
      const next = Math.min(
        LAYOUT_LIMITS.maxInspectorWidth,
        Math.max(LAYOUT_LIMITS.minInspectorWidth, startWidthRef.current + delta),
      );
      onResize(next);
    };

    const onUp = () => {
      setIsResizing(false);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const panel = (
    <aside
      aria-label="Workspace inspector"
      data-testid="inspector-panel"
      style={isCompact ? { width: 'min(280px, calc(100vw - 16px))' } : { width: `${width}px` }}
      className={`relative flex h-full shrink-0 flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-panel)] ${
        isCompact ? 'shadow-xl' : ''
      }`}
    >
      {!isCompact && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize inspector panel"
          onPointerDown={handlePointerDown}
          className="group absolute top-0 bottom-0 -left-1 z-10 flex w-2 cursor-col-resize touch-none justify-center"
        >
          <span
            className={`h-full w-0.5 transition-colors duration-150 ${
              isResizing ? 'bg-[var(--accent)]' : 'bg-transparent group-hover:bg-[var(--accent)]'
            }`}
          />
        </div>
      )}

      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-3">
        <span className="text-xs font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
          Inspector
        </span>
        <button
          type="button"
          aria-label="Close inspector panel"
          onClick={onClose}
          className="inline-flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="anar-scroll flex-1 space-y-3 overflow-y-auto p-3 text-xs">
        <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-medium text-[var(--text-primary)]">
              <Cpu className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span>Language Server</span>
            </div>
            {hasWorkspace && (
              <button
                type="button"
                onClick={onRestartLsp}
                title="Restart rust-analyzer"
                className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <RotateCw className="h-3 w-3" />
                <span>Restart</span>
              </button>
            )}
          </div>
          <p className="mt-1 text-[var(--text-secondary)]">
            rust-analyzer:{' '}
            <span className="font-medium text-[var(--text-primary)]">{lspStatus.status}</span>
          </p>
          {lspStatus.detail && (
            <p
              className="mt-1 truncate text-[11px] text-[var(--text-muted)]"
              title={lspStatus.detail}
            >
              {lspStatus.detail}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!canFormat}
              onClick={onFormatDocument}
              title="Format Rust file (Shift+Alt+F)"
              className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] px-2 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Sparkles className="h-3 w-3 text-[var(--accent)]" />
              <span>Format Rust File</span>
            </button>
          </div>
          <p className="mt-2 text-[10px] text-[var(--text-muted)]">
            F12 / Ctrl+Click: Go to Definition · Shift+Alt+F: Format
          </p>
        </div>

        <div
          className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3"
          data-testid="inspector-backend-section"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-medium text-[var(--text-primary)]">
              <Zap className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span>Compiler Backend</span>
            </div>
            <span className="rounded bg-[var(--bg-panel)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
              {rusturboStatus?.available
                ? (rusturboStatus.version ?? 'rusturbo ready')
                : 'rusturbo not found'}
            </span>
          </div>

          <div
            role="group"
            aria-label="Compiler backend selection"
            className="mt-2 grid grid-cols-2 gap-1 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-0.5"
          >
            <button
              type="button"
              data-testid="backend-cargo"
              disabled={isRunning}
              aria-pressed={compilerBackend === 'cargo'}
              onClick={() => onSelectCompilerBackend('cargo')}
              className={`rounded-[var(--radius-sm)] px-2 py-1 text-[11px] font-medium transition-colors ${
                compilerBackend === 'cargo'
                  ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              Cargo
            </button>
            <button
              type="button"
              data-testid="backend-rusturbo"
              disabled={isRunning || (!rusturboStatus?.available && compilerBackend !== 'rusturbo')}
              aria-pressed={compilerBackend === 'rusturbo'}
              title={
                rusturboStatus?.available
                  ? 'Accelerate Build & Run with Rusturbo'
                  : 'Install rusturbo on PATH to enable acceleration'
              }
              onClick={() => onSelectCompilerBackend('rusturbo')}
              className={`rounded-[var(--radius-sm)] px-2 py-1 text-[11px] font-medium transition-colors ${
                compilerBackend === 'rusturbo'
                  ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
              } disabled:cursor-not-allowed disabled:opacity-45`}
            >
              Rusturbo
            </button>
          </div>

          {!rusturboStatus?.available ? (
            <p className="mt-2 text-[10px] text-[var(--text-muted)]">
              Install Rusturbo to enable shared dependency target caching and fast linker probing.
            </p>
          ) : (
            <div className="mt-2 space-y-2">
              {hasWorkspace && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    data-testid="rusturbo-analyze-button"
                    disabled={rusturboBusy}
                    onClick={onAnalyzeRusturbo}
                    className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-2 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-50"
                  >
                    <Gauge className="h-3 w-3 text-[var(--accent)]" />
                    <span>{rusturboBusy ? 'Analyzing…' : 'Analyze'}</span>
                  </button>
                  {!rusturboStatus.configExists && (
                    <button
                      type="button"
                      data-testid="rusturbo-init-button"
                      disabled={rusturboBusy}
                      onClick={onInitRusturboConfig}
                      className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-2 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-50"
                    >
                      <span>Init rusturbo.toml</span>
                    </button>
                  )}
                </div>
              )}

              {rusturboStatus.configExists && (
                <p className="text-[10px] text-[var(--text-secondary)]">
                  rusturbo.toml: preset{' '}
                  <span className="font-medium text-[var(--text-primary)]">
                    {rusturboStatus.configuredPreset ?? 'balanced'}
                  </span>
                  {rusturboStatus.linkerMode ? ` · linker ${rusturboStatus.linkerMode}` : ''}
                </p>
              )}

              {rusturboAnalysis && (
                <div
                  data-testid="rusturbo-analysis-card"
                  className="space-y-1 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-2 text-[10px]"
                >
                  <div className="flex flex-wrap gap-1.5">
                    {rusturboAnalysis.linkerSelected && (
                      <span className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[var(--text-primary)]">
                        linker: {rusturboAnalysis.linkerSelected}
                      </span>
                    )}
                    {rusturboAnalysis.sccacheActive !== null && (
                      <span className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[var(--text-primary)]">
                        sccache: {rusturboAnalysis.sccacheActive ? 'on' : 'off'}
                      </span>
                    )}
                    {rusturboAnalysis.cacheDecision && (
                      <span className="rounded bg-[var(--accent-muted)] px-1.5 py-0.5 font-medium text-[var(--accent)]">
                        cache: {rusturboAnalysis.cacheDecision}
                      </span>
                    )}
                  </div>
                  {rusturboAnalysis.packageCount !== null && (
                    <p className="text-[var(--text-secondary)]">
                      Graph: {rusturboAnalysis.packageCount} crates
                      {rusturboAnalysis.edgeCount !== null
                        ? `, ${rusturboAnalysis.edgeCount} edges`
                        : ''}
                      {rusturboAnalysis.duplicateCount !== null &&
                      rusturboAnalysis.duplicateCount > 0
                        ? ` (${rusturboAnalysis.duplicateCount} duplicates)`
                        : ''}
                    </p>
                  )}
                  {rusturboAnalysis.advice.length > 0 && (
                    <ul className="list-disc space-y-0.5 pl-4 text-[var(--text-muted)]">
                      {rusturboAnalysis.advice.slice(0, 3).map((tip) => (
                        <li key={tip}>{tip}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <p className="text-[10px] text-[var(--text-muted)]">
                Build &amp; Run use the selected backend; Check &amp; Test always use Cargo.
              </p>
            </div>
          )}
        </div>

        <div
          className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3"
          data-testid="inspector-framework-section"
        >
          <div className="flex items-center gap-2 font-medium text-[var(--text-primary)]">
            <Layers className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span>Framework Profile</span>
          </div>

          {!hasWorkspace && (
            <p className="mt-1 text-[var(--text-secondary)]">
              Open a Cargo project to inspect frameworks and run profiles.
            </p>
          )}

          {hasWorkspace && frameworkReport && (
            <div className="mt-2 space-y-2.5">
              {frameworkReport.detected.length === 0 ? (
                <p className="text-[var(--text-secondary)]">
                  Standard Cargo crate (no web/GUI/CLI framework detected).
                </p>
              ) : (
                <ul className="space-y-1.5" aria-label="Detected frameworks">
                  {frameworkReport.detected.map((fw) => (
                    <li
                      key={`${fw.crateName}-${fw.sourceManifest}`}
                      className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-2 py-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[var(--text-primary)]">
                          {fw.displayName}
                        </span>
                        <span className="rounded bg-[var(--accent-muted)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                          {fw.resolvedVersion ?? fw.versionSpec ?? fw.category}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate font-[family-name:var(--font-mono)] text-[10px] text-[var(--text-muted)]">
                        {fw.sourceManifest}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              {frameworkReport.profiles.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
                    Run Profiles
                  </span>
                  <div className="space-y-1">
                    {frameworkReport.profiles.map((profile) => {
                      const active = profile.id === selectedProfileId;
                      return (
                        <div
                          key={profile.id}
                          className={`rounded-[var(--radius-sm)] border p-2 ${
                            active
                              ? 'border-[var(--accent)] bg-[var(--accent-muted)]'
                              : 'border-[var(--border-subtle)] bg-[var(--bg-panel)]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <button
                              type="button"
                              onClick={() => onSelectProfile(profile.id)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <span className="block truncate font-medium text-[var(--text-primary)]">
                                {profile.label}
                              </span>
                            </button>
                            <button
                              type="button"
                              disabled={isRunning || !profile.toolAvailable}
                              onClick={() => onRunProfile(profile.id)}
                              aria-label={`Run profile ${profile.label}`}
                              title={
                                profile.toolAvailable
                                  ? `Run ${profile.program} ${profile.args.join(' ')}`
                                  : `Install ${profile.requiredTool ?? profile.program} to run`
                              }
                              className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-45"
                            >
                              <Play className="h-2.5 w-2.5 text-[var(--accent)]" />
                              <span>Run</span>
                            </button>
                          </div>
                          <p className="mt-1 truncate font-[family-name:var(--font-mono)] text-[10px] text-[var(--text-muted)]">
                            {profile.program} {profile.args.join(' ')}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                            {profile.defaultPort !== null && (
                              <span className="rounded bg-[var(--bg-elevated)] px-1 py-0.5 text-[var(--text-secondary)]">
                                :{profile.defaultPort}
                              </span>
                            )}
                            {!profile.toolAvailable && profile.requiredTool && (
                              <span className="rounded bg-[var(--bg-elevated)] px-1 py-0.5 text-[var(--status-warn)]">
                                missing {profile.requiredTool}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );

  if (isCompact) {
    return (
      <div className="fixed inset-y-[var(--titlebar-height)] right-0 bottom-[var(--statusbar-height)] left-0 z-30 flex justify-end">
        <button
          type="button"
          aria-label="Dismiss inspector overlay"
          onClick={onClose}
          className="flex-1 bg-black/40"
        />
        {panel}
      </div>
    );
  }

  return panel;
}
