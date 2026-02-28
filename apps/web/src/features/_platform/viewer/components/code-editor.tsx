'use client';

/**
 * CodeEditor — Lazy-loaded CodeMirror 6 wrapper.
 *
 * Thin wrapper over @uiw/react-codemirror with theme sync and
 * language detection. Loaded via dynamic import to minimize bundle.
 *
 * Extracted to _platform/viewer for shared use across features.
 * Origin: Plan 041 (file-browser). Extraction: Plan 058 (workunit-editor).
 */

import { useTheme } from 'next-themes';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { cpp } from '@codemirror/lang-cpp';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { java } from '@codemirror/lang-java';
// Language imports (tree-shakeable)
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';
import { yaml } from '@codemirror/lang-yaml';
import { StreamLanguage } from '@codemirror/language';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

// Stronger active line highlight for search navigation (Plan 052)
const activeLineHighlight = EditorView.theme({
  '.cm-activeLine': {
    backgroundColor: 'rgba(250, 204, 21, 0.25) !important', // yellow-400 at 25%
    borderLeft: '3px solid rgb(234, 179, 8)', // yellow-500
    boxShadow: 'inset 0 0 0 1px rgba(234, 179, 8, 0.3)',
  },
  '&.cm-focused .cm-activeLine': {
    backgroundColor: 'rgba(250, 204, 21, 0.35) !important',
  },
  '.dark .cm-activeLine, &.dark .cm-activeLine': {
    backgroundColor: 'rgba(250, 204, 21, 0.15) !important',
    borderLeft: '3px solid rgb(250, 204, 21)',
  },
});

// Lazy-load CodeMirror itself
const ReactCodeMirror = dynamic(() => import('@uiw/react-codemirror'), {
  ssr: false,
  loading: () => <div className="animate-pulse rounded bg-muted p-4 h-64" />,
});

const LANGUAGE_EXTENSIONS: Record<string, () => Extension> = {
  typescript: () => javascript({ typescript: true, jsx: false }),
  javascript: () => javascript(),
  tsx: () => javascript({ typescript: true, jsx: true }),
  jsx: () => javascript({ jsx: true }),
  python: () => python(),
  markdown: () => markdown(),
  json: () => json(),
  yaml: () => yaml(),
  css: () => css(),
  html: () => html(),
  rust: () => rust(),
  java: () => java(),
  cpp: () => cpp(),
  bash: () => StreamLanguage.define(shell),
  shell: () => StreamLanguage.define(shell),
  sh: () => StreamLanguage.define(shell),
};

export interface CodeEditorProps {
  value: string;
  language: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  /** Line number to scroll to (1-based). DYK-P6-03: prop-driven, not ref-driven. */
  scrollToLine?: number | null;
  /** Enable word wrapping (default: true). */
  wordWrap?: boolean;
}

export function CodeEditor({
  value,
  language,
  onChange,
  readOnly,
  scrollToLine,
  wordWrap = true,
}: CodeEditorProps) {
  const { resolvedTheme } = useTheme();
  const viewRef = useRef<EditorView | null>(null);

  const extensions = useMemo(() => {
    const langExt = LANGUAGE_EXTENSIONS[language];
    const exts: Extension[] = [activeLineHighlight];
    if (wordWrap) exts.push(EditorView.lineWrapping);
    if (langExt) exts.push(langExt());
    // After geometry changes, re-scroll to target line if needed
    exts.push(
      EditorView.updateListener.of((update) => {
        if (
          update.geometryChanged &&
          scrollToLineRef.current != null &&
          scrollToLineRef.current > 0
        ) {
          const line = scrollToLineRef.current;
          const view = update.view;
          const docLines = view.state.doc.lines;
          if (line >= 1 && line <= docLines) {
            const lineInfo = view.state.doc.line(line);
            const { from, to } = view.viewport;
            // Only re-scroll if the target line is outside the visible viewport
            if (lineInfo.from < from || lineInfo.from > to) {
              setTimeout(() => {
                view.dispatch({
                  effects: EditorView.scrollIntoView(lineInfo.from, { y: 'center' }),
                });
              }, 0);
            }
          }
        }
      })
    );
    return exts;
  }, [language, wordWrap]);

  // DYK-P6-03: Capture EditorView via onCreateEditor callback
  // FT-009: Use ref for scrollToLine to keep callback stable
  const scrollToLineRef = useRef(scrollToLine);
  scrollToLineRef.current = scrollToLine;

  const handleCreateEditor = useCallback((view: EditorView) => {
    viewRef.current = view;
    const line = scrollToLineRef.current;
    if (line != null && line > 0) {
      scrollViewToLine(view, line);
    }
  }, []);

  // Scroll to line when prop changes or content loads — the updateListener
  // extension handles retries as CM renders virtualized content
  // biome-ignore lint/correctness/useExhaustiveDependencies: need to re-scroll when value changes (content loaded async)
  useEffect(() => {
    if (scrollToLine == null || scrollToLine <= 0 || !viewRef.current) return;
    scrollViewToLine(viewRef.current, scrollToLine);
  }, [scrollToLine, value]);

  return (
    <ReactCodeMirror
      value={value}
      extensions={extensions}
      onChange={onChange}
      readOnly={readOnly}
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      onCreateEditor={handleCreateEditor}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        bracketMatching: true,
      }}
      className="flex-1 min-h-0 [&_.cm-editor]:h-full [&_.cm-scroller]:!overflow-auto"
    />
  );
}

/** Scroll a CodeMirror EditorView to a 1-based line number. */
function scrollViewToLine(view: EditorView, line: number): void {
  const docLines = view.state.doc.lines;
  if (line < 1 || line > docLines) return;
  const lineInfo = view.state.doc.line(line);
  view.dispatch({
    selection: { anchor: lineInfo.from },
    effects: EditorView.scrollIntoView(lineInfo.from, { y: 'center' }),
    scrollIntoView: true,
  });
}
