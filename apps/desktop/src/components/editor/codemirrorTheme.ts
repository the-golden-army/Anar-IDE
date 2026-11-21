import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import type { ResolvedTheme } from '../../types/preferences';

const baseTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--bg-app)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.6',
  },
  '.cm-content': {
    padding: '10px 0',
    caretColor: 'var(--accent)',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--accent)',
    borderLeftWidth: '2px',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--accent-muted)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-panel)',
    color: 'var(--text-muted)',
    borderRight: '1px solid var(--border-subtle)',
    userSelect: 'none',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--bg-hover)',
    color: 'var(--text-primary)',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(148, 163, 184, 0.08)',
  },
  '.cm-matchingBracket': {
    backgroundColor: 'var(--accent-muted)',
    outline: '1px solid var(--accent-ring)',
  },
  '.cm-panels': {
    backgroundColor: 'var(--bg-panel)',
    color: 'var(--text-primary)',
    borderTop: '1px solid var(--border-subtle)',
    borderBottom: '1px solid var(--border-subtle)',
  },
  '.cm-searchMatch': {
    backgroundColor: 'var(--accent-muted)',
    outline: '1px solid var(--accent)',
  },
  '.cm-button': {
    backgroundImage: 'none',
    backgroundColor: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '4px',
  },
  '.cm-textfield': {
    backgroundColor: 'var(--bg-input)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '4px',
  },
});

const darkHighlightStyle = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword], color: '#f97316' },
  { tag: [tags.typeName, tags.className, tags.namespace], color: '#38bdf8' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#fbbf24' },
  { tag: [tags.macroName, tags.special(tags.name)], color: '#c084fc' },
  { tag: [tags.string, tags.special(tags.string)], color: '#34d399' },
  { tag: [tags.number, tags.bool, tags.atom], color: '#fb7185' },
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment],
    color: '#64748b',
    fontStyle: 'italic',
  },
  { tag: [tags.operator, tags.punctuation], color: '#94a3b8' },
  { tag: [tags.attributeName, tags.meta], color: '#a78bfa' },
  { tag: tags.propertyName, color: '#e2e8f0' },
]);

const lightHighlightStyle = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword], color: '#c2410c' },
  { tag: [tags.typeName, tags.className, tags.namespace], color: '#0369a1' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#b45309' },
  { tag: [tags.macroName, tags.special(tags.name)], color: '#7e22ce' },
  { tag: [tags.string, tags.special(tags.string)], color: '#047857' },
  { tag: [tags.number, tags.bool, tags.atom], color: '#be123c' },
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment],
    color: '#64748b',
    fontStyle: 'italic',
  },
  { tag: [tags.operator, tags.punctuation], color: '#475569' },
  { tag: [tags.attributeName, tags.meta], color: '#6d28d9' },
  { tag: tags.propertyName, color: '#1e293b' },
]);

export function languageLabelFor(relativePath: string): string {
  const lower = relativePath.toLowerCase();
  if (lower.endsWith('.rs')) return 'Rust';
  if (lower.endsWith('.toml')) return 'TOML';
  if (lower.endsWith('.json')) return 'JSON';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'Markdown';
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'TypeScript';
  if (lower.endsWith('.js') || lower.endsWith('.jsx')) return 'JavaScript';
  if (lower.endsWith('.css')) return 'CSS';
  if (lower.endsWith('.html')) return 'HTML';
  return 'Plain Text';
}

export function createCodeMirrorTheme(resolvedTheme: ResolvedTheme): Extension {
  const isDark = resolvedTheme === 'dark';
  return [
    baseTheme,
    EditorView.theme({}, { dark: isDark }),
    syntaxHighlighting(isDark ? darkHighlightStyle : lightHighlightStyle),
  ];
}
