import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { rust } from '@codemirror/lang-rust';
import { bracketMatching, foldGutter, indentOnInput } from '@codemirror/language';
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, type Extension, type Text } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  hoverTooltip,
  keymap,
  lineNumbers,
  type Tooltip,
} from '@codemirror/view';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { CodeMinimap } from './CodeMinimap';
import { createCodeMirrorTheme } from './codemirrorTheme';
import {
  lspCompletion,
  lspFormatDocument,
  lspGotoDefinition,
  lspHover,
} from '../../services/lspClient';
import type { LspCompletionItem, LspLocation, LspPosition, LspTextEdit } from '../../types/lsp';
import type { ResolvedTheme } from '../../types/preferences';
import type { DiagnosticItem } from '../../types/runner';

export interface CodeMirrorEditorHandle {
  getDocumentText: (relativePath: string) => string | null;
  markSaved: (relativePath: string) => void;
  replaceDocumentText: (relativePath: string, content: string, isLargeFile: boolean) => void;
  dropTabBuffer: (relativePath: string) => void;
  revealLocation: (line: number, col: number) => void;
  formatActiveDocument: () => Promise<boolean>;
  focus: () => void;
}

interface CodeMirrorEditorProps {
  relativePath: string;
  initialContent: string;
  isLargeFile: boolean;
  resolvedTheme: ResolvedTheme;
  lspReady: boolean;
  activeDiagnostics: DiagnosticItem[];
  onDirtyChange: (relativePath: string, dirty: boolean) => void;
  onCursorChange: (relativePath: string, line: number, col: number) => void;
  onDocumentChange: (relativePath: string, content: string) => void;
  onSaveRequested: () => void;
  onNavigateLocation: (location: LspLocation) => void;
}

interface TabBuffer {
  state: EditorState;
  savedDoc: Text;
  scrollTop: number;
  scrollLeft: number;
  isLargeFile: boolean;
}

function languageExtensionFor(relativePath: string): Extension {
  const lower = relativePath.toLowerCase();
  if (lower.endsWith('.rs')) {
    return rust();
  }
  if (lower.endsWith('.json')) {
    return json();
  }
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    return markdown();
  }
  return [];
}

function isRustPath(relativePath: string): boolean {
  return relativePath.toLowerCase().endsWith('.rs');
}

function mapCompletionKind(kind: number | null): string | undefined {
  switch (kind) {
    case 2:
    case 3:
    case 4:
      return 'function';
    case 5:
    case 10:
      return 'property';
    case 6:
      return 'variable';
    case 7:
    case 22:
      return 'class';
    case 8:
      return 'interface';
    case 9:
      return 'namespace';
    case 13:
      return 'enum';
    case 14:
      return 'keyword';
    case 15:
      return 'macro';
    case 21:
      return 'constant';
    default:
      return undefined;
  }
}

function toCodeMirrorCompletion(item: LspCompletionItem): Completion {
  const completion: Completion = {
    label: item.label,
    detail: item.detail ?? undefined,
    info: item.documentation ?? undefined,
    type: mapCompletionKind(item.kind),
  };
  if (item.insertText && item.insertText !== item.label) {
    completion.apply = item.insertText;
  }
  return completion;
}

function lspPositionToOffset(doc: Text, pos: LspPosition): number {
  const lineNumber = Math.max(1, Math.min(pos.line + 1, doc.lines));
  const line = doc.line(lineNumber);
  return Math.min(line.to, line.from + Math.max(0, pos.character));
}

function projectDiagnostics(doc: Text, items: DiagnosticItem[]): Diagnostic[] {
  const result: Diagnostic[] = [];
  for (const item of items) {
    const span = item.primarySpan;
    if (!span) {
      continue;
    }
    const startLineNum = Math.max(1, Math.min(span.lineStart, doc.lines));
    const endLineNum = Math.max(startLineNum, Math.min(span.lineEnd, doc.lines));
    const startLine = doc.line(startLineNum);
    const endLine = doc.line(endLineNum);

    const from = Math.min(startLine.to, startLine.from + Math.max(0, span.columnStart - 1));
    const rawTo = Math.min(endLine.to, endLine.from + Math.max(0, span.columnEnd - 1));
    const to = rawTo > from ? rawTo : Math.min(startLine.to, from + 1);

    const severity: Diagnostic['severity'] =
      item.severity === 'error' ? 'error' : item.severity === 'warning' ? 'warning' : 'info';

    result.push({
      from,
      to,
      severity,
      message: item.code ? `[${item.code}] ${item.message}` : item.message,
    });
  }
  return result;
}

function applyLspEdits(view: EditorView, edits: LspTextEdit[]): void {
  if (edits.length === 0) {
    return;
  }
  const doc = view.state.doc;
  const changes = edits
    .map((edit) => ({
      from: lspPositionToOffset(doc, edit.range.start),
      to: lspPositionToOffset(doc, edit.range.end),
      insert: edit.newText,
    }))
    .sort((a, b) => a.from - b.from);

  view.dispatch({ changes });
}

export const CodeMirrorEditor = forwardRef<CodeMirrorEditorHandle, CodeMirrorEditorProps>(
  function CodeMirrorEditor(
    {
      relativePath,
      initialContent,
      isLargeFile,
      resolvedTheme,
      lspReady,
      activeDiagnostics,
      onDirtyChange,
      onCursorChange,
      onDocumentChange,
      onSaveRequested,
      onNavigateLocation,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<EditorView | null>(null);
    const buffersRef = useRef<Map<string, TabBuffer>>(new Map());
    const themeCompartmentRef = useRef(new Compartment());
    const activePathRef = useRef(relativePath);
    const lspReadyRef = useRef(lspReady);
    const callbacksRef = useRef({
      onDirtyChange,
      onCursorChange,
      onDocumentChange,
      onSaveRequested,
      onNavigateLocation,
    });

    const [minimapText, setMinimapText] = useState(isLargeFile ? '' : initialContent);
    const [activeLine, setActiveLine] = useState(1);

    lspReadyRef.current = lspReady;
    callbacksRef.current = {
      onDirtyChange,
      onCursorChange,
      onDocumentChange,
      onSaveRequested,
      onNavigateLocation,
    };

    const triggerGotoDefinitionAt = async (view: EditorView, pos: number) => {
      const currentPath = activePathRef.current;
      const buf = buffersRef.current.get(currentPath);
      if (!lspReadyRef.current || !isRustPath(currentPath) || buf?.isLargeFile) {
        return;
      }
      const lineInfo = view.state.doc.lineAt(pos);
      const line = lineInfo.number - 1;
      const col = Math.max(0, pos - lineInfo.from);
      try {
        const locations = await lspGotoDefinition(currentPath, line, col);
        if (locations.length > 0) {
          callbacksRef.current.onNavigateLocation(locations[0]);
        }
      } catch {
        // Ignore transient LSP cancellation errors during rapid navigation.
      }
    };

    const runFormatDocument = async (): Promise<boolean> => {
      const view = viewRef.current;
      const currentPath = activePathRef.current;
      const buf = buffersRef.current.get(currentPath);
      if (!view || !lspReadyRef.current || !isRustPath(currentPath) || buf?.isLargeFile) {
        return false;
      }
      try {
        const edits = await lspFormatDocument(currentPath);
        if (activePathRef.current !== currentPath) {
          return false;
        }
        applyLspEdits(view, edits);
        return edits.length > 0;
      } catch {
        return false;
      }
    };

    const rustCompletionSource = async (
      context: CompletionContext,
    ): Promise<CompletionResult | null> => {
      const currentPath = activePathRef.current;
      const buf = buffersRef.current.get(currentPath);
      if (!lspReadyRef.current || !isRustPath(currentPath) || buf?.isLargeFile) {
        return null;
      }

      const word = context.matchBefore(/[\w:]+/);
      if (!context.explicit && (!word || word.from === word.to)) {
        const before = context.state.sliceDoc(Math.max(0, context.pos - 2), context.pos);
        if (!before.endsWith('.') && before !== '::') {
          return null;
        }
      }

      const lineInfo = context.state.doc.lineAt(context.pos);
      const line = lineInfo.number - 1;
      const col = Math.max(0, context.pos - lineInfo.from);

      try {
        const items = await lspCompletion(currentPath, line, col);
        if (items.length === 0) {
          return null;
        }
        const from = word ? word.from : context.pos;
        return {
          from,
          options: items.map(toCodeMirrorCompletion),
          validFor: /^\w*$/,
        };
      } catch {
        return null;
      }
    };

    const rustHoverTooltip = hoverTooltip(async (view, pos): Promise<Tooltip | null> => {
      const currentPath = activePathRef.current;
      const buf = buffersRef.current.get(currentPath);
      if (!lspReadyRef.current || !isRustPath(currentPath) || buf?.isLargeFile) {
        return null;
      }

      const lineInfo = view.state.doc.lineAt(pos);
      const line = lineInfo.number - 1;
      const col = Math.max(0, pos - lineInfo.from);

      try {
        const hover = await lspHover(currentPath, line, col);
        if (!hover || !hover.contents.trim()) {
          return null;
        }
        return {
          pos,
          above: true,
          create() {
            const dom = document.createElement('div');
            dom.className =
              'max-w-md whitespace-pre-wrap rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1.5 font-[family-name:var(--font-mono)] text-[11px] text-[var(--text-primary)] shadow-lg';
            dom.textContent = hover.contents;
            return { dom };
          },
        };
      } catch {
        return null;
      }
    });

    const buildState = (path: string, docText: string, large: boolean, theme: ResolvedTheme) => {
      const extensions: Extension[] = [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        drawSelection(),
        indentOnInput(),
        languageExtensionFor(path),
        themeCompartmentRef.current.of(createCodeMirrorTheme(theme)),
        keymap.of([
          {
            key: 'Mod-s',
            preventDefault: true,
            run: () => {
              callbacksRef.current.onSaveRequested();
              return true;
            },
          },
          {
            key: 'F12',
            preventDefault: true,
            run: (view) => {
              void triggerGotoDefinitionAt(view, view.state.selection.main.head);
              return true;
            },
          },
          {
            key: 'Shift-Alt-f',
            preventDefault: true,
            run: () => {
              void runFormatDocument();
              return true;
            },
          },
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          indentWithTab,
        ]),
        EditorView.domEventHandlers({
          mousedown: (event, view) => {
            if ((event.ctrlKey || event.metaKey) && event.button === 0) {
              const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
              if (pos !== null) {
                event.preventDefault();
                void triggerGotoDefinitionAt(view, pos);
                return true;
              }
            }
            return false;
          },
        }),
        EditorView.updateListener.of((update) => {
          const currentPath = activePathRef.current;
          const record = buffersRef.current.get(currentPath);
          if (!record) {
            return;
          }
          record.state = update.state;

          if (update.docChanged) {
            const isDirty = !update.state.doc.eq(record.savedDoc);
            callbacksRef.current.onDirtyChange(currentPath, isDirty);
            if (!record.isLargeFile) {
              const nextText = update.state.doc.toString();
              setMinimapText(nextText);
              callbacksRef.current.onDocumentChange(currentPath, nextText);
            }
          }

          if (update.selectionSet || update.docChanged) {
            const head = update.state.selection.main.head;
            const lineInfo = update.state.doc.lineAt(head);
            setActiveLine(lineInfo.number);
            callbacksRef.current.onCursorChange(
              currentPath,
              lineInfo.number,
              head - lineInfo.from + 1,
            );
          }
        }),
      ];

      if (!large) {
        extensions.push(
          foldGutter(),
          bracketMatching(),
          highlightSelectionMatches(),
          lintGutter(),
          autocompletion({ override: [rustCompletionSource] }),
          rustHoverTooltip,
        );
      }

      return EditorState.create({
        doc: docText,
        extensions,
      });
    };

    const revealLineCol = (line: number, col: number) => {
      const view = viewRef.current;
      if (!view) {
        return;
      }
      const clampedLine = Math.max(1, Math.min(line, view.state.doc.lines));
      const lineInfo = view.state.doc.line(clampedLine);
      const clampedCol = Math.max(1, col);
      const pos = Math.min(lineInfo.from + clampedCol - 1, lineInfo.to);
      view.dispatch({
        selection: { anchor: pos },
        effects: EditorView.scrollIntoView(pos, { y: 'center' }),
      });
      view.focus();
    };

    useImperativeHandle(
      ref,
      () => ({
        getDocumentText(targetPath: string) {
          const view = viewRef.current;
          if (view && activePathRef.current === targetPath) {
            return view.state.doc.toString();
          }
          const buf = buffersRef.current.get(targetPath);
          return buf ? buf.state.doc.toString() : null;
        },
        markSaved(targetPath: string) {
          const view = viewRef.current;
          const buf = buffersRef.current.get(targetPath);
          if (!buf) {
            return;
          }
          if (view && activePathRef.current === targetPath) {
            buf.state = view.state;
          }
          buf.savedDoc = buf.state.doc;
          callbacksRef.current.onDirtyChange(targetPath, false);
        },
        replaceDocumentText(targetPath: string, content: string, large: boolean) {
          const nextState = buildState(targetPath, content, large, resolvedTheme);
          buffersRef.current.set(targetPath, {
            state: nextState,
            savedDoc: nextState.doc,
            scrollTop: 0,
            scrollLeft: 0,
            isLargeFile: large,
          });
          const view = viewRef.current;
          if (view && activePathRef.current === targetPath) {
            view.setState(nextState);
            setMinimapText(large ? '' : content);
          }
          callbacksRef.current.onDirtyChange(targetPath, false);
          callbacksRef.current.onCursorChange(targetPath, 1, 1);
        },
        dropTabBuffer(targetPath: string) {
          buffersRef.current.delete(targetPath);
        },
        revealLocation(line: number, col: number) {
          revealLineCol(line, col);
        },
        async formatActiveDocument() {
          return runFormatDocument();
        },
        focus() {
          viewRef.current?.focus();
        },
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [resolvedTheme],
    );

    useEffect(() => {
      const parent = containerRef.current;
      if (!parent) {
        return;
      }

      const initialState = buildState(relativePath, initialContent, isLargeFile, resolvedTheme);
      buffersRef.current.set(relativePath, {
        state: initialState,
        savedDoc: initialState.doc,
        scrollTop: 0,
        scrollLeft: 0,
        isLargeFile,
      });
      activePathRef.current = relativePath;

      const view = new EditorView({
        state: initialState,
        parent,
      });
      viewRef.current = view;

      // Default cursor to line 4 when viewing the initial sample main.rs snippet.
      if (relativePath === 'src/main.rs' && initialState.doc.lines >= 4) {
        const line4 = initialState.doc.line(4);
        const targetPos = Math.min(line4.to, line4.from + 40);
        view.dispatch({ selection: { anchor: targetPos } });
        setActiveLine(4);
      }

      return () => {
        view.destroy();
        viewRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) {
        return;
      }
      const prevPath = activePathRef.current;
      if (prevPath !== relativePath) {
        const prevBuf = buffersRef.current.get(prevPath);
        if (prevBuf) {
          prevBuf.state = view.state;
          prevBuf.scrollTop = view.scrollDOM.scrollTop;
          prevBuf.scrollLeft = view.scrollDOM.scrollLeft;
        }
      }

      activePathRef.current = relativePath;
      let nextBuf = buffersRef.current.get(relativePath);
      if (!nextBuf) {
        const nextState = buildState(relativePath, initialContent, isLargeFile, resolvedTheme);
        nextBuf = {
          state: nextState,
          savedDoc: nextState.doc,
          scrollTop: 0,
          scrollLeft: 0,
          isLargeFile,
        };
        buffersRef.current.set(relativePath, nextBuf);
      }

      view.setState(nextBuf.state);
      view.dispatch({
        effects: themeCompartmentRef.current.reconfigure(createCodeMirrorTheme(resolvedTheme)),
      });
      view.scrollDOM.scrollTop = nextBuf.scrollTop;
      view.scrollDOM.scrollLeft = nextBuf.scrollLeft;

      setMinimapText(nextBuf.isLargeFile ? '' : nextBuf.state.doc.toString());

      const head = nextBuf.state.selection.main.head;
      const lineInfo = nextBuf.state.doc.lineAt(head);
      setActiveLine(lineInfo.number);
      callbacksRef.current.onCursorChange(relativePath, lineInfo.number, head - lineInfo.from + 1);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [relativePath, initialContent, isLargeFile]);

    useEffect(() => {
      const view = viewRef.current;
      const buf = buffersRef.current.get(relativePath);
      if (!view || !buf || buf.isLargeFile) {
        return;
      }
      const cmDiagnostics = projectDiagnostics(view.state.doc, activeDiagnostics);
      view.dispatch(setDiagnostics(view.state, cmDiagnostics));
    }, [relativePath, activeDiagnostics]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) {
        return;
      }
      view.dispatch({
        effects: themeCompartmentRef.current.reconfigure(createCodeMirrorTheme(resolvedTheme)),
      });
    }, [resolvedTheme]);

    return (
      <div className="flex min-h-0 flex-1 overflow-hidden bg-[var(--bg-editor)]">
        <div
          ref={containerRef}
          data-testid="codemirror-editor"
          data-active-path={relativePath}
          data-large-file={isLargeFile ? 'true' : 'false'}
          className="h-full min-w-0 flex-1 overflow-hidden bg-[var(--bg-editor)]"
        />
        <CodeMinimap
          content={minimapText}
          activeLine={activeLine}
          isLargeFile={isLargeFile}
          onJumpToLine={(line) => revealLineCol(line, 1)}
        />
      </div>
    );
  },
);
