/**
 * useClipboard — copy results are reported honestly
 *
 * @vitest-environment jsdom
 *
 * Why: `copyToClipboard` used to return void and every caller fired
 *   `toast.success` unconditionally. On a non-secure origin the toast
 *   rendered a full tick before the `execCommand` fallback had even run, and
 *   nothing read that fallback's return value — so "copied" appeared whether
 *   or not anything reached the clipboard. A user who trusts it pastes stale
 *   content and blames the paste target.
 * Contract: `copyToClipboard` resolves true only when a write actually
 *   landed. Every handler gates its success toast on that and surfaces an
 *   error toast otherwise. A rejected `writeText` in a secure context falls
 *   through to the legacy path rather than reporting failure early.
 * Usage Notes: Mocks `sonner`, stubs `navigator.clipboard.writeText`,
 *   `globalThis.isSecureContext` and `document.execCommand`. Real timers —
 *   the legacy path defers by a tick and the returned promise is what makes
 *   that observable, so awaiting it is the assertion.
 * Quality Contribution: These fail against the previous implementation:
 *   the success toast was unconditional, so every "refused" case below
 *   asserted a message that always rendered.
 */

import { useClipboard } from '@/features/041-file-browser/hooks/use-clipboard';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const toastSuccess = vi.fn();
const toastError = vi.fn();
const writeText = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    success: (msg: string) => toastSuccess(msg),
    error: (msg: string) => toastError(msg),
  },
}));

const baseOptions = { slug: 'ws', worktreePath: '/wt', readFile: vi.fn() };

function setSecureContext(value: boolean) {
  Object.defineProperty(globalThis, 'isSecureContext', { value, configurable: true });
}

beforeEach(() => {
  toastSuccess.mockClear();
  toastError.mockClear();
  writeText.mockReset();
  setSecureContext(true);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

describe('useClipboard — secure context', () => {
  it('resolves true and toasts success when the write lands', async () => {
    writeText.mockResolvedValue(undefined);
    const { result } = renderHook(() => useClipboard(baseOptions));

    await expect(result.current.copyToClipboard('hello')).resolves.toBe(true);

    await result.current.handleCopyFullPath('a/b.ts');
    expect(writeText).toHaveBeenCalledWith('/wt/a/b.ts');
    expect(toastSuccess).toHaveBeenCalledWith('Full path copied');
    expect(toastError).not.toHaveBeenCalled();
  });

  it('falls through to the legacy path when writeText rejects, rather than failing early', async () => {
    writeText.mockRejectedValue(new Error('permission denied'));
    const execCommand = vi.fn(() => true);
    document.execCommand = execCommand as unknown as typeof document.execCommand;
    const { result } = renderHook(() => useClipboard(baseOptions));

    await expect(result.current.copyToClipboard('hello')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });
});

describe('useClipboard — non-secure origin (the case that used to lie)', () => {
  beforeEach(() => setSecureContext(false));

  it('reports failure when execCommand refuses the copy', async () => {
    document.execCommand = vi.fn(() => false) as unknown as typeof document.execCommand;
    const { result } = renderHook(() => useClipboard(baseOptions));

    await expect(result.current.copyToClipboard('hello')).resolves.toBe(false);

    await result.current.handleCopyFullPath('a/b.ts');
    expect(toastError).toHaveBeenCalledWith('Could not copy full path');
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('reports failure when execCommand throws', async () => {
    document.execCommand = vi.fn(() => {
      throw new Error('unsupported');
    }) as unknown as typeof document.execCommand;
    const { result } = renderHook(() => useClipboard(baseOptions));

    await expect(result.current.copyToClipboard('hello')).resolves.toBe(false);
  });

  it('reports success when the legacy copy actually lands', async () => {
    document.execCommand = vi.fn(() => true) as unknown as typeof document.execCommand;
    const { result } = renderHook(() => useClipboard(baseOptions));

    await result.current.handleCopyRelativePath('a/b.ts');
    expect(toastSuccess).toHaveBeenCalledWith('Relative path copied');
    expect(toastError).not.toHaveBeenCalled();
  });

  it('removes the scratch textarea whether the copy succeeds or is refused', async () => {
    document.execCommand = vi.fn(() => false) as unknown as typeof document.execCommand;
    const { result } = renderHook(() => useClipboard(baseOptions));

    await result.current.copyToClipboard('hello');
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });
});

describe('useClipboard — content and tree handlers', () => {
  it('does not claim content was copied when the clipboard refused it', async () => {
    setSecureContext(false);
    document.execCommand = vi.fn(() => false) as unknown as typeof document.execCommand;
    const readFile = vi.fn().mockResolvedValue({ ok: true, isBinary: false, content: 'body' });
    const { result } = renderHook(() => useClipboard({ ...baseOptions, readFile }));

    await result.current.handleCopyContent('a/b.ts');
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith('Could not copy content');
  });
});
