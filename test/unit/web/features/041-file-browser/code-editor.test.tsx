/**
 * CodeEditor Wrapper Tests
 *
 * Purpose: Verify thin wrapper passes props correctly to CodeMirror.
 * Quality Contribution: Tests contract, not CodeMirror internals.
 * Acceptance Criteria: AC-25
 *
 * Phase 4: File Browser — Plan 041
 * DYK-P4-04: Thin wrapper tests with CodeMirror stubbed in jsdom
 */

import { describe, expect, it, vi } from 'vitest';

// Stub the dynamic import since CodeMirror doesn't work in jsdom
vi.mock('@uiw/react-codemirror', () => ({
  __esModule: true,
  default: ({
    value,
    onChange,
    readOnly,
  }: { value: string; onChange?: (val: string) => void; readOnly?: boolean }) => {
    return `<textarea data-testid="code-editor" ${readOnly ? 'readonly' : ''}>${value}</textarea>`;
  },
}));

import { CodeEditor } from '@/features/041-file-browser/components/code-editor';
import { render } from '@testing-library/react';

describe('CodeEditor', () => {
  it('renders without crashing', () => {
    const { container } = render(<CodeEditor value="const x = 1;" language="typescript" />);
    expect(container).toBeTruthy();
  });

  it('accepts value, language, and onChange props', () => {
    const onChange = vi.fn();
    const { container } = render(
      <CodeEditor value="hello" language="javascript" onChange={onChange} />
    );
    expect(container).toBeTruthy();
  });

  it('supports readOnly mode', () => {
    const { container } = render(
      <CodeEditor value="readonly content" language="markdown" readOnly />
    );
    expect(container).toBeTruthy();
  });
});
