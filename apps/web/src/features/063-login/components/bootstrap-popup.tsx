'use client';

/**
 * Plan 084 Phase 6 — `<BootstrapPopup>` real client UX.
 *
 * Replaces Phase 3's text-only stub. Phase 3 locked these contracts:
 *  - Named exports: `BootstrapPopup`, `BootstrapPopupProps`
 *  - Prop shape: `{ bootstrapVerified: boolean; children: ReactNode }`
 *  - File path: `apps/web/src/features/063-login/components/bootstrap-popup.tsx`
 *
 * Phase 6 commits these contracts forward to Phase 7 (task 7.8 harness e2e
 * + task 7.10 AC-22 log audit):
 *  - 4 stable `data-testid` selectors: `bootstrap-popup`, `bootstrap-code-input`,
 *    `bootstrap-code-submit`, `bootstrap-code-error`.
 *  - Console-log discipline: this file MUST NOT call `console.log` /
 *    `console.error` / `console.warn` with the typed `code` value at any
 *    point — Phase 7 task 7.10 grep audit will assert zero matches.
 *  - Stable error message strings — see ERROR_MESSAGES below; Phase 7 docs
 *    may cite verbatim.
 *
 * Implementation notes:
 *  - Uses `@radix-ui/react-dialog` primitives directly (not the shadcn
 *    `<DialogContent>` wrapper which ships a close button — the popup is
 *    deliberately non-dismissable until the user submits a correct code).
 *  - Modal renders inside a Portal so the underlying page tree is left in
 *    place (children remain mounted but inert behind the overlay; Radix
 *    handles focus-trapping).
 *  - Cookie is HttpOnly — no client-side cookie reads. The success path
 *    calls `router.refresh()` so the RSC tree re-reads the cookie via
 *    `<BootstrapGate>` and the popup unmounts on the next render.
 *  - `submitting` stays true after a 200 response so the submit button
 *    remains disabled across the brief refresh window (defensive against
 *    rapid double-clicks).
 */
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useRouter } from 'next/navigation';
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useEffect,
  useState,
} from 'react';

const CROCKFORD_CHAR = /[0-9A-HJKMNP-TV-Z]/;

export interface BootstrapPopupProps {
  /** Server-side cookie verification result from `<BootstrapGate>`. */
  bootstrapVerified: boolean;
  /** Page tree the popup paints over when unverified. */
  children: ReactNode;
}

export function BootstrapPopup({
  bootstrapVerified,
  children,
}: BootstrapPopupProps) {
  if (bootstrapVerified) {
    return <>{children}</>;
  }
  return (
    <>
      {children}
      <BootstrapPopupDialog />
    </>
  );
}

type ErrorKind =
  | 'invalid-format'
  | 'wrong-code'
  | 'rate-limited'
  | 'unavailable'
  | 'network';

const ERROR_MESSAGES = {
  'invalid-format': 'Invalid format — must be XXXX-XXXX-XXXX',
  'wrong-code': 'Wrong code — try again',
  unavailable:
    'Server unavailable — see operator runbook at .chainglass/bootstrap-code.json',
  network: 'Network error — try again',
} as const;

function rateLimitedMessage(seconds: number): string {
  return `Rate limited — try again in ${seconds} seconds`;
}

function BootstrapPopupDialog() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ErrorKind | null>(null);
  const [retryAfterSec, setRetryAfterSec] = useState(0);

  useEffect(() => {
    if (retryAfterSec <= 0) return;
    const id = setInterval(() => {
      setRetryAfterSec((n) => Math.max(0, n - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [retryAfterSec]);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    setCode(formatBootstrapInput(e.target.value));
    if (error) setError(null);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting || retryAfterSec > 0 || code.length !== 14) return;
    setSubmitting(true);
    let res: Response;
    try {
      res = await fetch('/api/bootstrap/verify', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
    } catch {
      setError('network');
      setSubmitting(false);
      return;
    }
    if (res.status === 200) {
      // Keep submitting=true — submit stays disabled across router.refresh()
      // window. The popup unmounts when RSC re-renders with the new cookie.
      router.refresh();
      return;
    }
    if (res.status === 400) {
      setError('invalid-format');
    } else if (res.status === 401) {
      setError('wrong-code');
    } else if (res.status === 429) {
      let body: { retryAfterMs?: unknown } = {};
      try {
        body = (await res.json()) as { retryAfterMs?: unknown };
      } catch {
        body = {};
      }
      const ms = typeof body.retryAfterMs === 'number' ? body.retryAfterMs : 30_000;
      setRetryAfterSec(Math.max(1, Math.ceil(ms / 1000)));
      setError('rate-limited');
    } else if (res.status === 503) {
      setError('unavailable');
    } else {
      setError('network');
    }
    setSubmitting(false);
  };

  const submitDisabled = code.length !== 14 || submitting || retryAfterSec > 0;
  const errorMessage =
    error === 'rate-limited'
      ? rateLimitedMessage(retryAfterSec)
      : error
        ? ERROR_MESSAGES[error]
        : null;
  const hasError = errorMessage !== null;

  return (
    <DialogPrimitive.Root open>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-[9999] min-h-[100dvh] bg-black/85 backdrop-blur-sm"
        />
        <DialogPrimitive.Content
          data-testid="bootstrap-popup"
          role="dialog"
          aria-modal="true"
          aria-describedby={hasError ? 'bootstrap-error' : undefined}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="fixed left-1/2 top-1/2 z-[10000] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-zinc-100 shadow-2xl pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
          <DialogPrimitive.Title className="mb-2 text-lg font-semibold">
            Bootstrap code required
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mb-4 text-sm text-zinc-400">
            Type the code from{' '}
            <code className="rounded bg-zinc-800 px-1 py-0.5 text-xs">
              .chainglass/bootstrap-code.json
            </code>{' '}
            to unlock this workspace.
          </DialogPrimitive.Description>
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <input
              data-testid="bootstrap-code-input"
              name="code"
              type="text"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              aria-label="Bootstrap code"
              placeholder="XXXX-XXXX-XXXX"
              maxLength={14}
              value={code}
              onChange={onChange}
              className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-3 text-center font-mono text-lg uppercase tracking-widest focus:border-zinc-500 focus:outline-none"
            />
            <button
              data-testid="bootstrap-code-submit"
              type="submit"
              disabled={submitDisabled}
              className="min-h-[44px] rounded-md bg-zinc-100 px-3 py-2 font-medium text-zinc-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Unlocking…' : 'Unlock'}
            </button>
            {hasError ? (
              <div
                id="bootstrap-error"
                data-testid="bootstrap-code-error"
                role="alert"
                aria-live="assertive"
                className="mt-1 text-sm text-red-400"
              >
                {errorMessage}
              </div>
            ) : null}
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * Pure helper — strip non-Crockford-base32 characters, uppercase, then
 * insert hyphens at positions 4 and 8 (in cleaned form) to produce
 * `XXXX-XXXX-XXXX`. Paste-safe: pastes of already-formatted strings
 * (with hyphens) and unformatted strings (no hyphens) both yield the
 * canonical format.
 *
 * Exported for testability via the input-typing path.
 */
export function formatBootstrapInput(raw: string): string {
  const cleaned = raw
    .toUpperCase()
    .split('')
    .filter((c) => CROCKFORD_CHAR.test(c))
    .slice(0, 12)
    .join('');
  const parts: string[] = [];
  if (cleaned.length > 0) parts.push(cleaned.slice(0, 4));
  if (cleaned.length > 4) parts.push(cleaned.slice(4, 8));
  if (cleaned.length > 8) parts.push(cleaned.slice(8, 12));
  return parts.join('-');
}
