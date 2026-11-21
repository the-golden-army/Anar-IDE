import { CaseSensitive, FileText, Search } from 'lucide-react';
import { useState } from 'react';
import type { LspLocation } from '../types/lsp';
import type { WorkspaceSearchResult } from '../types/search';

interface SearchViewProps {
  hasWorkspace: boolean;
  searchResult: WorkspaceSearchResult | null;
  isSearching: boolean;
  onSearch: (query: string, caseSensitive: boolean) => void;
  onOpenLocation: (loc: LspLocation) => void;
}

export function SearchView({
  hasWorkspace,
  searchResult,
  isSearching,
  onSearch,
  onOpenLocation,
}: SearchViewProps) {
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);

  if (!hasWorkspace) {
    return (
      <div
        data-testid="search-view"
        className="flex flex-1 flex-col items-center justify-center p-5 text-center text-xs text-[var(--text-secondary)]"
      >
        <Search className="h-5 w-5 text-[var(--accent)]" />
        <p className="mt-2 font-medium text-[var(--text-primary)]">Project Search</p>
        <p className="mt-1">Open a folder to search across workspace source files.</p>
      </div>
    );
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSearch(query, caseSensitive);
  };

  return (
    <div data-testid="search-view" className="flex min-h-0 flex-1 flex-col">
      <form
        onSubmit={handleSubmit}
        className="space-y-1.5 border-b border-[var(--border-subtle)] p-2.5"
      >
        <div className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 py-1 focus-within:border-[var(--accent)]">
          <Search className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search in workspace…"
            aria-label="Search workspace"
            className="min-w-0 flex-1 bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
          <button
            type="button"
            aria-label="Match case"
            aria-pressed={caseSensitive}
            title="Match case"
            onClick={() => {
              const next = !caseSensitive;
              setCaseSensitive(next);
              if (query.trim()) {
                onSearch(query, next);
              }
            }}
            className={`inline-flex h-5 w-5 items-center justify-center rounded ${
              caseSensitive
                ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            <CaseSensitive className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
          <button
            type="submit"
            disabled={isSearching || query.length === 0}
            className="rounded-[var(--radius-sm)] bg-[var(--accent)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-on-accent)] hover:bg-[var(--accent-hover)] disabled:opacity-45"
          >
            {isSearching ? 'Searching…' : 'Search'}
          </button>
          {searchResult && (
            <span>
              {searchResult.totalMatches} {searchResult.totalMatches === 1 ? 'match' : 'matches'} in{' '}
              {searchResult.files.length} {searchResult.files.length === 1 ? 'file' : 'files'}
              {searchResult.truncated ? ' (capped)' : ''}
            </span>
          )}
        </div>
      </form>

      <div className="anar-scroll flex-1 overflow-y-auto p-2 text-xs">
        {!searchResult ? (
          <p className="p-2 text-[var(--text-muted)]">
            Enter text and press Enter to search workspace files.
          </p>
        ) : searchResult.files.length === 0 ? (
          <p className="p-2 text-[var(--text-muted)]">
            No results found for &ldquo;{searchResult.query}&rdquo;.
          </p>
        ) : (
          <div className="space-y-2.5">
            {searchResult.files.map((group) => (
              <div key={group.relativePath}>
                <div className="flex items-center gap-1.5 px-1 py-0.5 font-medium text-[var(--text-primary)]">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                  <span className="truncate" title={group.relativePath}>
                    {group.relativePath}
                  </span>
                  <span className="ml-auto shrink-0 rounded bg-[var(--bg-elevated)] px-1 text-[10px] text-[var(--text-muted)]">
                    {group.matches.length}
                  </span>
                </div>
                <ul className="mt-0.5 space-y-0.5 pl-3">
                  {group.matches.map((hit, idx) => (
                    <li key={`${group.relativePath}:${hit.line}:${idx}`}>
                      <button
                        type="button"
                        onClick={() =>
                          onOpenLocation({
                            relativePath: group.relativePath,
                            line: hit.line,
                            col: hit.col,
                          })
                        }
                        className="flex w-full items-baseline gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 text-left font-[family-name:var(--font-mono)] text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                      >
                        <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
                          {hit.line}:
                        </span>
                        <span className="truncate">{hit.lineText.trim()}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
