'use client';

/**
 * CodeEditor — Lazy-loaded CodeMirror 6 wrapper.
 *
 * Thin wrapper over @uiw/react-codemirror with theme sync and
 * language detection. Loaded via dynamic import to minimize bundle.
 *
 * Phase 4: File Browser — Plan 041
 * DYK-P4-04: Thin wrapper, tests stub CodeMirror
 * DYK-P4-05: Uses shared detectLanguage()
 * Finding 10: Lazy load via dynamic import
 */

import { useTheme } from 'next-themes';
import dynamic from 'next/dynamic';
import { useMemo } from 'react';

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
import type { Extension } from '@codemirror/state';

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
};

export interface CodeEditorProps {
  value: string;
  language: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
}

export function CodeEditor({ value, language, onChange, readOnly }: CodeEditorProps) {
  const { resolvedTheme } = useTheme();

  const extensions = useMemo(() => {
    const langExt = LANGUAGE_EXTENSIONS[language];
    return langExt ? [langExt()] : [];
  }, [language]);

  return (
    <ReactCodeMirror
      value={value}
      extensions={extensions}
      onChange={onChange}
      readOnly={readOnly}
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        bracketMatching: true,
      }}
      className="min-h-[300px] border rounded-md overflow-hidden"
    />
  );
}
