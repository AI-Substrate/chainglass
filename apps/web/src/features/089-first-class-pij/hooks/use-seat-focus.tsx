/**
 * Seat focus — Plan 089 Phase 4 (T006). The CLIENT half of the one sanctioned mutation (C-06).
 *
 * The server half (`POST /api/pij/focus`) refuses to focus anything it should not. This half exists
 * to make sure the request only ever happens because a human clicked, and that what comes back is
 * shown as an observation rather than swallowed.
 *
 * **Why the fetch lives in a provider rather than in the button.** Not for tidiness — for the audit.
 * C-06 requires that no effect, timer or self-firing handler can reach the focus call, and that is a
 * property of the whole client surface, not of one component. Putting the single `fetch` here means
 * the claim "only an onClick reaches it" is checkable by reading one file, and
 * `test/unit/web/pij/fence.test.ts` checks exactly that.
 *
 * Three deliberate absences:
 *
 * - **No retry.** A failed focus is reported, never re-attempted. An automatic retry is a second
 *   invocation the human did not ask for.
 * - **No optimistic state.** The result is what the server said, verbatim; there is nothing to
 *   optimistically render, because the outcome IS the message.
 * - **No queue.** One focus at a time; a click while another is in flight is ignored rather than
 *   stacked, because stacking would move the window twice for one intention.
 */
'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { PijId } from '../types';

/** What came back from one focus attempt. Rendered verbatim — the route owns the wording. */
export interface SeatFocusOutcome {
  seatId: string;
  /** True only for a 200. */
  focused: boolean;
  /** The route's `focusReason`, when it refused. */
  reason?: string;
  /** The sentence to show: the route's observation, or the success wording. */
  observation: string;
}

export interface SeatFocusValue {
  /**
   * The workspace focus is scoped to. Carried here rather than threaded through every `SeatRow` call
   * site, so a row deep in a prime shell cannot end up checking containment against nothing.
   */
  workspacePath: string;
  /** THE call site. Nothing else in this feature may invoke the focus route. */
  focus: (seatId: PijId) => void;
  /** The last outcome per seat. Keyed by id so two rows never show each other's result. */
  outcomes: Record<string, SeatFocusOutcome>;
  /** The seat currently in flight, if any. */
  pending: string | null;
}

const SeatFocusContext = createContext<SeatFocusValue | null>(null);

/**
 * Read the focus affordance, or `null` where there is none.
 *
 * `null` is a real answer, not an error: the global fleet view has no workspace to check containment
 * against, so it mounts no provider and every row correctly renders no button.
 */
export function useSeatFocus(): SeatFocusValue | null {
  return useContext(SeatFocusContext);
}

export interface SeatFocusProviderProps {
  /** The workspace the page is scoped to. Sent as the containment parameter. */
  workspacePath: string;
  /** Test seam. Production uses the global `fetch`. */
  fetchImpl?: typeof fetch;
  children: React.ReactNode;
}

export function SeatFocusProvider({ workspacePath, fetchImpl, children }: SeatFocusProviderProps) {
  const [outcomes, setOutcomes] = useState<Record<string, SeatFocusOutcome>>({});
  const [pending, setPending] = useState<string | null>(null);

  const focus = useCallback(
    (seatId: PijId) => {
      // Ignore rather than queue: two clicks are one intention, and a queue would move the window
      // again after the human already got what they asked for.
      if (pending) return;
      setPending(seatId);

      const doFetch = fetchImpl ?? fetch;
      void doFetch(`/api/pij/focus?workspace=${encodeURIComponent(workspacePath)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seatId }),
      })
        .then(async (response) => {
          const body = (await response.json().catch(() => ({}))) as {
            focused?: string;
            reason?: string;
            observation?: string;
            error?: string;
            code?: string;
          };
          if (response.ok && body.focused) {
            return {
              seatId,
              focused: true,
              observation: `focused ${body.focused}`,
            } satisfies SeatFocusOutcome;
          }
          return {
            seatId,
            focused: false,
            reason: body.reason,
            // The route's own words. The fallbacks cover the two shapes that are not refusals:
            // a 503 store failure (`error` + `code`) and a response with no body at all.
            observation:
              body.observation ??
              (body.error ? `${body.code ?? 'error'}: ${body.error}` : 'focus request failed'),
          } satisfies SeatFocusOutcome;
        })
        .catch((error: Error) => ({
          seatId,
          focused: false,
          observation: `focus request failed: ${error.message}`,
        }))
        .then((outcome) => {
          setOutcomes((previous) => ({ ...previous, [seatId]: outcome }));
          setPending(null);
        });
    },
    [workspacePath, fetchImpl, pending]
  );

  const value = useMemo<SeatFocusValue>(
    () => ({ workspacePath, focus, outcomes, pending }),
    [workspacePath, focus, outcomes, pending]
  );

  return <SeatFocusContext.Provider value={value}>{children}</SeatFocusContext.Provider>;
}
