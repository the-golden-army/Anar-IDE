import { useMemo } from 'react';

interface CodeMinimapProps {
  content: string;
  activeLine: number;
  isLargeFile: boolean;
  onJumpToLine: (line: number) => void;
}

const MAX_MINIMAP_LINES = 140;

function colorForLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return 'transparent';
  if (trimmed.startsWith('//')) return 'rgba(100, 116, 139, 0.5)';
  if (trimmed.startsWith('use ') || trimmed.startsWith('fn ') || trimmed.startsWith('pub ')) {
    return 'rgba(234, 179, 8, 0.7)';
  }
  if (trimmed.includes('println!') || trimmed.includes('format!')) {
    return 'rgba(192, 132, 252, 0.72)';
  }
  if (trimmed.includes('"')) {
    return 'rgba(74, 222, 128, 0.65)';
  }
  return 'rgba(148, 163, 184, 0.45)';
}

export function CodeMinimap({ content, activeLine, isLargeFile, onJumpToLine }: CodeMinimapProps) {
  const lines = useMemo(() => {
    if (isLargeFile) return [];
    return content.split('\n').slice(0, MAX_MINIMAP_LINES);
  }, [content, isLargeFile]);

  if (isLargeFile || lines.length === 0) {
    return null;
  }

  return (
    <div
      aria-label="Code minimap"
      data-testid="code-minimap"
      className="hidden w-[68px] shrink-0 flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-editor)] px-2 py-2.5 select-none md:flex"
    >
      <div className="space-y-[3px]">
        {lines.map((raw, idx) => {
          const lineNumber = idx + 1;
          const trimmed = raw.trim();
          const indentPx = Math.min(14, (raw.length - raw.trimStart().length) * 1.4);
          const widthPct = Math.min(100, Math.max(12, Math.round((trimmed.length / 48) * 100)));
          const isCurrent = lineNumber === activeLine;

          return (
            <button
              key={lineNumber}
              type="button"
              onClick={() => onJumpToLine(lineNumber)}
              title={`Line ${lineNumber}`}
              className={`block h-[4px] w-full rounded-[1px] text-left transition-colors ${
                isCurrent ? 'bg-[var(--accent-muted)]' : 'hover:bg-[var(--bg-hover)]'
              }`}
            >
              {trimmed.length > 0 && (
                <span
                  className="block h-[2.5px] rounded-full"
                  style={{
                    marginLeft: `${indentPx}px`,
                    width: `${widthPct}%`,
                    backgroundColor: colorForLine(raw),
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
