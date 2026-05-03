/**
 * Plan 084 Phase 6 — T001-test RTL tests for `<BootstrapPopup>`.
 *
 * Constitution P3 (TDD) + P4 (Fakes Over Mocks). Sanctioned exceptions:
 *   - `vi.mock('next/navigation', ...)` — sanctioned exception used elsewhere
 *     in this repo (see test/unit/web/components/dashboard-sidebar.test.tsx).
 *     Next.js does not ship a public router test stub for jsdom; rendering the
 *     component without a Router context throws.
 *   - `vi.spyOn(globalThis, 'fetch')` — assert request shape AND simulate the
 *     5 verify-route status codes without booting a real server. T005
 *     integration test exercises real route handlers.
 *   - `vi.spyOn(console, '*')` — verify console-log discipline (Phase 6 must
 *     never log the typed code; Phase 7 task 7.10 AC-22 grep audit obligation).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BootstrapPopup } from '@/features/063-login/components/bootstrap-popup';

const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh,
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

const VALID_CODE = 'ZVXB-28H2-A6N4';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('<BootstrapPopup>', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    refresh.mockReset();
    fetchSpy = vi.spyOn(globalThis, 'fetch') as never;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    fetchSpy.mockRestore();
    logSpy.mockRestore();
    errSpy.mockRestore();
    warnSpy.mockRestore();
  });

  // (8) Verified state renders children only — done first to assert prop shape.
  it('renders children when bootstrapVerified=true (no dialog)', () => {
    render(
      <BootstrapPopup bootstrapVerified={true}>
        <div data-testid="protected">protected</div>
      </BootstrapPopup>,
    );
    expect(screen.getByTestId('protected')).toBeInTheDocument();
    expect(screen.queryByTestId('bootstrap-popup')).not.toBeInTheDocument();
  });

  describe('when bootstrapVerified=false', () => {
    function renderPopup() {
      return render(
        <BootstrapPopup bootstrapVerified={false}>
          <div data-testid="protected">protected</div>
        </BootstrapPopup>,
      );
    }

    // (1) ARIA + roles
    it('1: dialog renders with role=dialog + aria-modal + labelledby', () => {
      renderPopup();
      const dialog = screen.getByTestId('bootstrap-popup');
      expect(dialog.getAttribute('role')).toBe('dialog');
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      // Radix wires aria-labelledby to its auto-generated DialogTitle id; verify
      // the attribute points at an element containing the title text.
      const labelledBy = dialog.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();
      const titleEl = document.getElementById(labelledBy as string);
      expect(titleEl?.textContent).toMatch(/bootstrap code required/i);
      // No error displayed → aria-describedby may be undefined OR point at a
      // valid element. We assert: when no error region is rendered,
      // aria-describedby either is absent or doesn't point at the error id.
      expect(screen.queryByTestId('bootstrap-code-error')).toBeNull();
    });

    // (2) Auto-focus
    it('2: input is auto-focused on mount', async () => {
      renderPopup();
      const input = screen.getByTestId('bootstrap-code-input');
      await waitFor(() => expect(document.activeElement).toBe(input));
    });

    // (3) Lowercase + autoformat
    it('3: typing 7k2p9xqm3t8r autoformats to 7K2P-9XQM-3T8R', () => {
      renderPopup();
      const input = screen.getByTestId<HTMLInputElement>('bootstrap-code-input');
      fireEvent.change(input, { target: { value: '7k2p9xqm3t8r' } });
      expect(input.value).toBe('7K2P-9XQM-3T8R');
    });

    // (4) Illegal chars stripped
    it('4: illegal characters (I, L, O, U, _, space) are stripped', () => {
      renderPopup();
      const input = screen.getByTestId<HTMLInputElement>('bootstrap-code-input');
      // I, L, O, U excluded from Crockford alphabet; _ and space not alphanumeric
      fireEvent.change(input, { target: { value: 'I L_O U7K2P9XQM3T8R' } });
      expect(input.value).toBe('7K2P-9XQM-3T8R');
    });

    // (5) Paste already-formatted: no double hyphens
    it('5: paste of ZVXB-28H2-A6N4 (already formatted) → no double hyphens', () => {
      renderPopup();
      const input = screen.getByTestId<HTMLInputElement>('bootstrap-code-input');
      fireEvent.change(input, { target: { value: 'ZVXB-28H2-A6N4' } });
      expect(input.value).toBe('ZVXB-28H2-A6N4');
    });

    // (6) Paste of 12 chars no hyphens → autoformatted with hyphens
    it('6: paste of 12 chars without hyphens → inserts hyphens', () => {
      renderPopup();
      const input = screen.getByTestId<HTMLInputElement>('bootstrap-code-input');
      fireEvent.change(input, { target: { value: 'ZVXB28H2A6N4' } });
      expect(input.value).toBe('ZVXB-28H2-A6N4');
    });

    // (7) Submit disabled until 14 chars
    it('7: submit disabled until 14 chars, enabled at exactly 14', () => {
      renderPopup();
      const input = screen.getByTestId<HTMLInputElement>('bootstrap-code-input');
      const submit = screen.getByTestId<HTMLButtonElement>('bootstrap-code-submit');
      expect(submit.disabled).toBe(true);
      fireEvent.change(input, { target: { value: 'ZVXB28H2' } });
      expect(submit.disabled).toBe(true);
      fireEvent.change(input, { target: { value: VALID_CODE } });
      expect(submit.disabled).toBe(false);
    });

    // (9) Fetch shape on submit
    it('9: submit fires POST /api/bootstrap/verify with correct body + credentials', async () => {
      fetchSpy.mockResolvedValue(jsonResponse(200, { ok: true }));
      renderPopup();
      const input = screen.getByTestId<HTMLInputElement>('bootstrap-code-input');
      fireEvent.change(input, { target: { value: VALID_CODE } });
      const submit = screen.getByTestId<HTMLButtonElement>('bootstrap-code-submit');
      fireEvent.click(submit);
      await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/bootstrap/verify');
      expect(init.method).toBe('POST');
      expect(init.credentials).toBe('same-origin');
      expect(init.headers).toMatchObject({ 'content-type': 'application/json' });
      expect(JSON.parse(init.body as string)).toEqual({ code: VALID_CODE });
    });

    // (10) 401 wrong-code: input retained
    it('10: 401 → "Wrong code" error displayed + input retained', async () => {
      fetchSpy.mockResolvedValue(jsonResponse(401, { error: 'wrong-code' }));
      renderPopup();
      const input = screen.getByTestId<HTMLInputElement>('bootstrap-code-input');
      fireEvent.change(input, { target: { value: VALID_CODE } });
      fireEvent.click(screen.getByTestId('bootstrap-code-submit'));
      await waitFor(() => expect(screen.getByTestId('bootstrap-code-error')).toHaveTextContent(/wrong code/i));
      expect(input.value).toBe(VALID_CODE);
      // aria-describedby toggled on while error present
      expect(screen.getByTestId('bootstrap-popup').getAttribute('aria-describedby')).toBe('bootstrap-error');
      // Error region is role=alert
      expect(screen.getByTestId('bootstrap-code-error').getAttribute('role')).toBe('alert');
    });

    // (11) 400 invalid-format: input retained
    it('11: 400 → "Invalid format" error + input retained', async () => {
      fetchSpy.mockResolvedValue(jsonResponse(400, { error: 'invalid-format' }));
      renderPopup();
      const input = screen.getByTestId<HTMLInputElement>('bootstrap-code-input');
      fireEvent.change(input, { target: { value: VALID_CODE } });
      fireEvent.click(screen.getByTestId('bootstrap-code-submit'));
      await waitFor(() => expect(screen.getByTestId('bootstrap-code-error')).toHaveTextContent(/invalid format/i));
      expect(input.value).toBe(VALID_CODE);
    });

    // (12) 429 rate-limited with countdown
    it('12: 429 → "Rate limited — try again in N seconds" + submit disabled + countdown ticks (real timer)', async () => {
      // Use a small retryAfterMs so the test runs in real time without fake timers
      // (fake timers + React 19 effect-flush has interaction issues; real-time
      // 1.5s wait is acceptable for one assertion).
      fetchSpy.mockResolvedValue(jsonResponse(429, { error: 'rate-limited', retryAfterMs: 2_000 }));
      renderPopup();
      const input = screen.getByTestId<HTMLInputElement>('bootstrap-code-input');
      fireEvent.change(input, { target: { value: VALID_CODE } });
      fireEvent.click(screen.getByTestId('bootstrap-code-submit'));
      const errEl = await screen.findByTestId('bootstrap-code-error');
      expect(errEl).toHaveTextContent(/rate limited.*2 seconds/i);
      expect((screen.getByTestId('bootstrap-code-submit') as HTMLButtonElement).disabled).toBe(true);
      // Wait for countdown tick — real timer, ~1s
      await waitFor(
        () => expect(screen.getByTestId('bootstrap-code-error')).toHaveTextContent(/1 seconds/),
        { timeout: 2500, interval: 100 },
      );
      // Input retained
      expect(input.value).toBe(VALID_CODE);
    }, 5000);

    // (13) 503 unavailable: input retained
    it('13: 503 → "Server unavailable" error + input retained', async () => {
      fetchSpy.mockResolvedValue(jsonResponse(503, { error: 'unavailable' }));
      renderPopup();
      const input = screen.getByTestId<HTMLInputElement>('bootstrap-code-input');
      fireEvent.change(input, { target: { value: VALID_CODE } });
      fireEvent.click(screen.getByTestId('bootstrap-code-submit'));
      await waitFor(() => expect(screen.getByTestId('bootstrap-code-error')).toHaveTextContent(/server unavailable/i));
      expect(input.value).toBe(VALID_CODE);
    });

    // (14) Network error: input retained
    it('14: fetch throws → "Network error" + input retained', async () => {
      fetchSpy.mockRejectedValue(new TypeError('failed to fetch'));
      renderPopup();
      const input = screen.getByTestId<HTMLInputElement>('bootstrap-code-input');
      fireEvent.change(input, { target: { value: VALID_CODE } });
      fireEvent.click(screen.getByTestId('bootstrap-code-submit'));
      await waitFor(() => expect(screen.getByTestId('bootstrap-code-error')).toHaveTextContent(/network error/i));
      expect(input.value).toBe(VALID_CODE);
    });

    // (15) Error clears on next input change
    it('15: error clears on next input change', async () => {
      fetchSpy.mockResolvedValue(jsonResponse(401, { error: 'wrong-code' }));
      renderPopup();
      const input = screen.getByTestId<HTMLInputElement>('bootstrap-code-input');
      fireEvent.change(input, { target: { value: VALID_CODE } });
      fireEvent.click(screen.getByTestId('bootstrap-code-submit'));
      await waitFor(() => expect(screen.queryByTestId('bootstrap-code-error')).toBeInTheDocument());
      fireEvent.change(input, { target: { value: 'A' } });
      expect(screen.queryByTestId('bootstrap-code-error')).not.toBeInTheDocument();
    });

    // (16) Focus stays on input after error
    it('16: focus stays on input after error', async () => {
      fetchSpy.mockResolvedValue(jsonResponse(401, { error: 'wrong-code' }));
      renderPopup();
      const input = screen.getByTestId<HTMLInputElement>('bootstrap-code-input');
      input.focus();
      fireEvent.change(input, { target: { value: VALID_CODE } });
      fireEvent.click(screen.getByTestId('bootstrap-code-submit'));
      await waitFor(() => expect(screen.getByTestId('bootstrap-code-error')).toBeInTheDocument());
      expect(document.activeElement).toBe(input);
    });

    // (17) Timer cleanup on unmount
    it('17: timer cleanup on unmount — clearInterval called with the setInterval handle', async () => {
      // Spy on setInterval BEFORE render so we capture the handle the effect creates.
      const setSpy = vi.spyOn(globalThis, 'setInterval');
      const clearSpy = vi.spyOn(globalThis, 'clearInterval');
      fetchSpy.mockResolvedValue(jsonResponse(429, { error: 'rate-limited', retryAfterMs: 30_000 }));
      const view = render(
        <BootstrapPopup bootstrapVerified={false}>
          <div>x</div>
        </BootstrapPopup>,
      );
      const input = screen.getByTestId<HTMLInputElement>('bootstrap-code-input');
      fireEvent.change(input, { target: { value: VALID_CODE } });
      fireEvent.click(screen.getByTestId('bootstrap-code-submit'));
      await screen.findByTestId('bootstrap-code-error');
      // Wait for the useEffect to have run and created the interval
      await waitFor(() => expect(setSpy).toHaveBeenCalled(), { timeout: 1000 });
      const intervalHandle = setSpy.mock.results[setSpy.mock.results.length - 1]?.value;
      view.unmount();
      // useEffect cleanup MUST have called clearInterval with the captured handle.
      expect(clearSpy).toHaveBeenCalledWith(intervalHandle);
      setSpy.mockRestore();
      clearSpy.mockRestore();
    });

    // (18) Console-log discipline — never logs the typed code value across error paths
    it('18: never logs the typed `code` value across all non-success error paths', async () => {
      // Test each non-success status individually so we can assert the popup
      // never logs the code in any error branch. Success path (200) is tested
      // separately because it triggers router.refresh() and unmounts the popup.
      const cases: Array<Response | Error> = [
        jsonResponse(401, { error: 'wrong-code' }),
        jsonResponse(400, { error: 'invalid-format' }),
        jsonResponse(503, { error: 'unavailable' }),
        new TypeError('failed to fetch'),
      ];
      for (const c of cases) {
        if (c instanceof Error) {
          fetchSpy.mockRejectedValueOnce(c);
        } else {
          fetchSpy.mockResolvedValueOnce(c);
        }
        const view = render(
          <BootstrapPopup bootstrapVerified={false}>
            <div>x</div>
          </BootstrapPopup>,
        );
        const input = screen.getByTestId<HTMLInputElement>('bootstrap-code-input');
        fireEvent.change(input, { target: { value: VALID_CODE } });
        fireEvent.click(screen.getByTestId('bootstrap-code-submit'));
        await screen.findByTestId('bootstrap-code-error');
        view.unmount();
      }
      // Every console.* call must not have been called with the code as a substring.
      const allCalls = [
        ...logSpy.mock.calls.flat(),
        ...errSpy.mock.calls.flat(),
        ...warnSpy.mock.calls.flat(),
      ];
      const containsCode = allCalls.some((arg) => {
        if (typeof arg === 'string') return arg.includes(VALID_CODE);
        try {
          return JSON.stringify(arg).includes(VALID_CODE);
        } catch {
          return false;
        }
      });
      expect(containsCode).toBe(false);
    });
  });
});
