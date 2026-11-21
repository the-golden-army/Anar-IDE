import { Blocks, Check, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

interface StaticExtensionItem {
  id: string;
  name: string;
  publisher: string;
  version: string;
  description: string;
  badge: string;
}

const VISUAL_EXTENSIONS: StaticExtensionItem[] = [
  {
    id: 'rust-analyzer',
    name: 'rust-analyzer',
    publisher: 'rust-lang',
    version: '0.4.21',
    description: 'Rust language server integration for diagnostics, hover, and definitions.',
    badge: 'Bundled',
  },
  {
    id: 'even-better-toml',
    name: 'Even Better TOML',
    publisher: 'tamasfe',
    version: '0.21.2',
    description: 'Syntax highlighting and validation hints for Cargo.toml manifests.',
    badge: 'Syntax',
  },
  {
    id: 'codelldb',
    name: 'CodeLLDB',
    publisher: 'vadimcn',
    version: '1.11.0',
    description: 'Native Rust debugger interface layout for breakpoints and stack views.',
    badge: 'Debug',
  },
  {
    id: 'crates-lens',
    name: 'Crates Inspector',
    publisher: 'anar-ui',
    version: '2.3.0',
    description: 'Manifest dependency version overview for Cargo workspaces.',
    badge: 'Rust',
  },
  {
    id: 'rusturbo-accel',
    name: 'Rusturbo Accelerator',
    publisher: 'anar-ui',
    version: '0.1.2',
    description: 'Fast linker and shared target cache UI integration.',
    badge: 'Toolchain',
  },
];

export function ExtensionsView() {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return VISUAL_EXTENSIONS;
    return VISUAL_EXTENSIONS.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.publisher.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="extensions-view">
      <div className="flex h-10 shrink-0 items-center justify-between px-3">
        <span className="text-xs font-semibold text-[var(--text-primary)]">Extensions</span>
        <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
          UI Preview
        </span>
      </div>

      <div className="px-2.5 pb-2">
        <div className="flex h-7 items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter extensions..."
            aria-label="Filter extensions"
            className="min-w-0 flex-1 bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
        </div>
      </div>

      <div className="anar-scroll flex-1 space-y-1.5 overflow-y-auto px-2.5 pb-3">
        {filtered.map((ext) => (
          <div
            key={ext.id}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5 transition-colors duration-150 hover:border-[var(--border-strong)]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--accent-ring)] bg-[var(--accent-muted)] text-[var(--accent)]">
                  <Blocks className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-[var(--text-primary)]">
                    {ext.name}
                  </p>
                  <p className="truncate text-[10px] text-[var(--text-muted)]">
                    {ext.publisher} · v{ext.version}
                  </p>
                </div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">
                <Check className="h-2.5 w-2.5 text-[var(--status-ok)]" />
                <span>{ext.badge}</span>
              </span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">
              {ext.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
