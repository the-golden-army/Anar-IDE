import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { rust } from '@codemirror/lang-rust';
import { bracketMatching, foldGutter, indentOnInput } from '@codemirror/language';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, type Extension, type Text } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { createCodeMirrorTheme } from './codemirrorTheme';
import type { ResolvedTheme } from '../../types/preferences';

export interface CodeMirrorEditorHandle {
  getDocumentText: (relativePath: string) => string | null;
  markSaved: (relativePath: string) => void;
  replaceDocumentText: (relativePath: string, content: string, isLargeFile: boolean) => void;
  dropTabBuffer: (relativePath: string) => void;
  revealLocation: (line: number, col: number) => void;
  focus: () => void;
}

interface CodeMirrorEditorProps {
  relativePath: string;
  initialContent: string;
  isLargeFile: boolean;
  resolvedTheme: ResolvedTheme;
  onDirtyChange: (relativePath: string, dirty: boolean) => void;
  onCursorChange: (relativePath: string, line: number, col: number) => void;
  onSaveRequested: () => void;
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

export const CodeMirrorEditor = forwardRef<CodeMirrorEditorHandle, CodeMirrorEditorProps>(
  function CodeMirrorEditor(
    {
      relativePath,
      initialContent,
      isLargeFile,
      resolvedTheme,
      onDirtyChange,
      onCursorChange,
      onSaveRequested,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<EditorView | null>(null);
    const buffersRef = useRef<Map<string, TabBuffer>>(new Map());
    const themeCompartmentRef = useRef(new Compartment());
    const activePathRef = useRef(relativePath);
    const callbacksRef = useRef({ onDirtyChange, onCursorChange, onSaveRequested });

    callbacksRef.current = { onDirtyChange, onCursorChange, onSaveRequested };

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
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          indentWithTab,
        ]),
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
          }

          if (update.selectionSet || update.docChanged) {
            const head = update.state.selection.main.head;
            const lineInfo = update.state.doc.lineAt(head);
            callbacksRef.current.onCursorChange(
              currentPath,
              lineInfo.number,
              head - lineInfo.from + 1,
            );
          }
        }),
      ];

      // On large files (>= 1 MiB), skip whole-document bracket/selection scans so
      // scrolling and typing stay responsive.
      if (!large) {
        extensions.push(foldGutter(), bracketMatching(), highlightSelectionMatches());
      }

      return EditorState.create({
        doc: docText,
        extensions,
      });
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
          }
          callbacksRef.current.onDirtyChange(targetPath, false);
          callbacksRef.current.onCursorChange(targetPath, 1, 1);
        },
        dropTabBuffer(targetPath: string) {
          buffersRef.current.delete(targetPath);
        },
        revealLocation(line: number, col: number) {
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
        },
        focus() {
          viewRef.current?.focus();
        },
      }),
      // resolvedTheme is captured so replaceDocumentText applies current theme cleanly.
      [resolvedTheme],
    );

    // Mount CodeMirror EditorView once and swap EditorState per active tab.
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

      return () => {
        view.destroy();
        viewRef.current = null;
      };
      // Mount once; tab switching and theme updates are handled in dedicated effects below.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Switch active tab state cleanly while preserving scroll and undo history.
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

      const head = nextBuf.state.selection.main.head;
      const lineInfo = nextBuf.state.doc.lineAt(head);
      callbacksRef.current.onCursorChange(relativePath, lineInfo.number, head - lineInfo.from + 1);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [relativePath, initialContent, isLargeFile]);

    // Update CodeMirror theme instantaneously when Dark/Light/System changes.
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
      <div
        ref={containerRef}
        data-testid="codemirror-editor"
        data-active-path={relativePath}
        data-large-file={isLargeFile ? 'true' : 'false'}
        className="h-full w-full flex-1 overflow-hidden bg-[var(--bg-app)]"
      />
    );
  },
);
