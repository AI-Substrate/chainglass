/**
 * send-prompt-keys — deliver a saved prompt into the coding agent running in a
 * tmux pane (Plan 092, ph-0002).
 *
 * EVERY constant and every call shape in this file comes from
 * `docs/plans/092-terminal-prompt-drawer/assets/workshops/001-send-keys-to-coding-agents.md`
 * and from nowhere else. None of it is discoverable from tmux's manual; each
 * one is a production defect scar. In particular do NOT take these numbers
 * from a grep of the pij repo — its CLI carries a stale, harness-blind 300ms
 * (pij#159) while its daemon carries the real table below.
 *
 * The seven rules this file exists to keep:
 *
 * 1. TWO PROTECTION LAYERS, both required. `execCommand` is `execFileSync`, so
 *    the text travels as an argv element and no shell ever parses it —
 *    backticks, `$(…)`, quotes and semicolons are inert. `-l` is tmux's
 *    literal mode, so tmux never key-name-parses an embedded `Enter` or `C-c`
 *    as a keypress. Different parsers, different attacks, both needed. A
 *    drawer of saved prompts is a STORED-PAYLOAD surface (pij#128).
 *
 * 2. TYPE AND SUBMIT ARE SEPARATE CALLS. Never `-l` a trailing newline: it
 *    submits at the newline and then the explicit Enter fires a second time
 *    into whatever renders next.
 *
 * 3. A REAL NEWLINE IS A SUBMIT. A five-line prompt typed literally submits
 *    five partial prompts, so multi-line goes through bracketed paste
 *    (`set-buffer` then `paste-buffer -p`), which the receiver treats as one
 *    atomic paste. Flattening onto a separator is right for machine-generated
 *    turns and wrong for human-authored prompts; refusing multi-line is worse
 *    still, because it pushes the user to hand-paste with none of the
 *    controls.
 *
 * 4. FOCUS-IN BEFORE TYPING, on every send. Copilot gates submit on focus
 *    STATE, not on render — with `focus-events on` a backgrounded pane has
 *    been told focus-OUT and swallows Return, stranding the text in the
 *    composer. A SIGWINCH redraw does not fix it; pij tried. A browser drawer
 *    is definitionally driving a pane the user is not looking at, so this is
 *    the rule that would otherwise have shipped broken.
 *
 * 5. ONE SEND AT A TIME PER PANE. The three rules above describe a sequence
 *    with a ~900ms hole in the middle of it, and the websocket handler starts
 *    an independent async handler per frame, so two rapid submits to one pane
 *    interleave: A types and parks on the settle, B types into the SAME
 *    composer, and A's Enter submits A+B as one prompt. Note that rule 5 is a
 *    direct cost of the conservative maximum chosen for rule 2 — the safest
 *    settle is also the widest window. See `enqueueForTarget`.
 *
 * 6. AT-MOST-ONCE, NEVER SPECULATIVE REPLAY. The settle is a guess, so a
 *    submit can still fail to take; the recovery is to re-press ENTER — up to
 *    3 times, 250ms apart, and ONLY while the payload is observably still
 *    pending. The payload is NEVER retyped after the first Enter, because an
 *    empty composer with inconclusive telemetry is an ambiguous SUCCESS, and
 *    retyping turns an ambiguous success into a certain double-submit
 *    (workshop 001 § 2). The pending signal is INJECTED rather than read here:
 *    whether product code may read the pane it is driving is an open question
 *    (oq-0004, ph-0003 tk-0201), so this module implements the policy and the
 *    caller supplies the evidence. With no signal supplied there are zero
 *    re-presses, which is exactly today's behaviour.
 *
 * 7. RESOLVE THE PANE ONCE, THEN ADDRESS THE PANE. A session name is not an
 *    address. `tmux send-keys -t <session>` means "the active pane of whatever
 *    window that session is currently on", and BOTH halves of that are shared
 *    mutable state that anything on the box can move. Caught in production on
 *    2026-08-14: a click aimed at the agent in `dd:1.0` typed its prompt into a
 *    DIFFERENT agent's composer in `dd:2.0`. tmux exited zero, the socket
 *    reported `delivered: true`, the browser console was clean — a silent
 *    misdelivery into a third party, with no signal available to any layer.
 *
 *    A session with one window cannot show this, which is why it survived
 *    review: the development session had exactly one.
 *
 *    So the target is resolved to a concrete `%<n>` pane id ONCE, up front, and
 *    every call in the send uses that id. Note this is not only about aiming
 *    correctly at the start — rules 2 and 4 make one send FOUR tmux calls
 *    spanning ~900ms, and re-resolving a session name per call lets the window
 *    change MID-SEND, so the text lands in one pane and the Enter fires in
 *    another. A stray Enter in someone else's coding agent is precisely the
 *    blast radius rule 6 refuses to accept for retries; it must not arrive
 *    through the front door instead.
 *
 *    Resolution happens BEFORE the queue, and the queue is keyed on the
 *    resolved pane, because the hazard rule 5 addresses is two sends into one
 *    COMPOSER — which is a pane, not a session. Two sessions whose names differ
 *    but which resolve to the same pane must serialize; two sends to one
 *    session that resolve to different panes must not block each other.
 *
 *    NOTE what this does NOT fix: it makes the send hit the pane that was
 *    current when the user clicked, not necessarily the pane the user MEANT.
 *    Letting the caller name a pane outright is the real repair and needs a UI
 *    to pick one — and that picker must validate any pij seat label by
 *    `pid == pane_pid` at execution time, because tmux reissues pane ids from
 *    `%0` after a restart and stale bindings then name live panes they do not
 *    own (pij#171, pij#301).
 */

import type { CommandExecutor } from '../types';

/**
 * The measured per-harness settle between the type call and the Enter call, in
 * milliseconds. Verbatim from pij `adapters/daemon-tmux.ts:50`. Copilot needs
 * ~2.6× the others; it was 350 for everyone until copilot messages began
 * stranding in the composer.
 *
 * THIS IS THE ONLY PLACE THESE NUMBERS MAY APPEAR. pij drifted precisely here
 * — two send-keys call sites, the table reached only one — so a second numeric
 * settle literal anywhere in this feature is the defect, not a convenience.
 *
 * It is kept as documented knowledge; nothing keys on it yet. See
 * `ENTER_SETTLE_MS`.
 */
export const ENTER_SETTLE_BY_HARNESS = {
  claude: 350,
  copilot: 900,
  codex: 350,
  pi: 350,
} as const;

/**
 * The settle actually used, for every send, unconditionally: the CONSERVATIVE
 * MAXIMUM of the table above.
 *
 * Deliberately not detected. The sidecar has no harness signal — it knows a
 * session name and nothing about what is running inside the pane — and a
 * detector's failure mode is the SHORT settle, i.e. the stranded-composer bug,
 * which is invisible in exactly the test posture everyone uses (focused pane,
 * single line, agent idle). Being 550ms slow is a cost the user can see and
 * shrug at; being 550ms early is a prompt that silently never sends.
 *
 * Derived from the table rather than restated, so the number cannot drift.
 */
export const ENTER_SETTLE_MS: number = Math.max(...Object.values(ENTER_SETTLE_BY_HARNESS));

/**
 * CSI I — focus-in. `-H` takes hex byte values, so this is ESC `[` `I`.
 * Issued before the first type call of every send (rule 4 above).
 */
export const FOCUS_IN_ARGS: readonly string[] = ['-H', '1b', '5b', '49'];

/**
 * The at-most-once re-press budget (rule 6 above), verbatim from workshop 001
 * § 2: "3 attempts, 250 ms apart".
 *
 * Bounded on purpose. An unbounded retry against a pane that is simply busy
 * would keep pressing Enter into whatever the agent renders next, and the
 * blast radius of a stray Enter in a coding agent is not knowable from here.
 * Three presses is the ceiling pij settled on; if three do not take, the
 * honest answer is to report nothing rather than to keep hammering.
 *
 * Like the settle table, these live in exactly one place — restating either
 * number elsewhere in the feature is the drift that produced pij#159.
 */
export const ENTER_REPRESS_MAX_ATTEMPTS = 3;
export const ENTER_REPRESS_INTERVAL_MS = 250;

/** Monotonic suffix so two concurrent sends cannot clobber each other's paste buffer. */
let bufferSeq = 0;

/**
 * The tail of the in-flight send chain for each tmux target, or absent when
 * nothing is in flight for it.
 *
 * Keyed by TARGET, not globally: the hazard is two frames aimed at one
 * composer, so a send to pane A must not be made to wait ~900ms behind a send
 * to pane B. See `enqueueForTarget`.
 */
const sendQueues = new Map<string, Promise<void>>();

/** Test seam only — resets the paste-buffer counter so argv assertions are stable. */
export function _resetPromptBufferSeqForTests(): void {
  bufferSeq = 0;
}

/** Test seam only — drops any in-flight send chains so tests cannot leak into each other. */
export function _resetPromptSendQueuesForTests(): void {
  sendQueues.clear();
}

/**
 * Run `task` after every send already queued for `target` has finished, and
 * make the next one wait for it (rule 5 above).
 *
 * Three properties this has to keep:
 *
 * - The WHOLE sequence is inside the critical section — focus-in, type or
 *   paste, settle, Enter. Serializing anything smaller (the paste-buffer name,
 *   say) leaves the settle hole open, which is the actual defect.
 * - A rejection is delivered to ITS OWN caller and to nobody else. The chain
 *   the next send waits on swallows the error, so one failed tmux call cannot
 *   poison the pane's queue forever.
 * - The map entry is dropped once the chain drains, so a long-lived server
 *   does not accumulate one settled promise per session it has ever seen.
 */
function enqueueForTarget(target: string, task: () => Promise<void>): Promise<void> {
  const tail = sendQueues.get(target);
  // `tail` is a drained chain and never rejects, so a single `then` is enough.
  const run = tail ? tail.then(task) : task();
  const drained = run.then(
    () => undefined,
    () => undefined
  );
  sendQueues.set(target, drained);
  return run.finally(() => {
    if (sendQueues.get(target) === drained) sendQueues.delete(target);
  });
}

/**
 * A concrete tmux pane id — `%` followed by digits, and nothing else.
 *
 * Anchored on both ends deliberately. This is the value every subsequent call
 * in the send is aimed at, so anything that is not unambiguously a pane id must
 * fail the send rather than be passed to tmux, where a partial match would be
 * re-interpreted as some other kind of target.
 */
const PANE_ID_PATTERN = /^%\d+$/;

/**
 * Resolve a tmux target to the concrete pane it names RIGHT NOW (rule 7).
 *
 * Exported for tk-0106's direct coverage: the whole value of this function is
 * that it is called once per send rather than implicitly four times, and that
 * property is worth asserting on its own.
 *
 * Throws rather than falling back to `target` when the answer is not a pane id.
 * A fallback here would be a silent return to session-name addressing on
 * exactly the paths where resolution is least trustworthy — which is the defect
 * this function exists to remove, reappearing only under failure and therefore
 * only where nobody is looking.
 */
export function resolvePaneTarget(execCommand: CommandExecutor, target: string): string {
  const paneId = execCommand('tmux', ['display-message', '-p', '-t', target, '#{pane_id}']).trim();
  if (!PANE_ID_PATTERN.test(paneId)) {
    throw new Error(
      `Could not resolve tmux target "${target}" to a pane (got ${JSON.stringify(paneId)})`
    );
  }
  return paneId;
}

export interface SendPromptKeysOptions {
  /** argv-only command runner (`execFileSync`). Never a shell string. */
  execCommand: CommandExecutor;
  /**
   * tmux target. Today the sidecar has only a validated session name, which is
   * NOT an address — see rule 7. It is resolved to a pane id before anything is
   * typed, and a `%<n>` passed here is resolved to itself.
   */
  target: string;
  /** The prompt, verbatim. May contain newlines and hostile shell syntax. */
  text: string;
  /** True to submit after typing; false to leave it in the composer to edit. */
  submit: boolean;
  /**
   * Injectable delay. The default yields to the event loop — the settle must
   * NEVER block the websocket message loop, because `execCommand` is
   * synchronous and a blocking 900ms freezes the user's terminal once per
   * click.
   */
  sleep?: (ms: number) => Promise<void>;
  /**
   * Evidence that the payload is STILL SITTING IN THE COMPOSER — i.e. that the
   * Enter did not take. Injected, not read here.
   *
   * Called at most `ENTER_REPRESS_MAX_ATTEMPTS` times, each after
   * `ENTER_REPRESS_INTERVAL_MS`, and only on the submitting path. A `true`
   * answer buys exactly one more Enter; a `false` answer ends the loop.
   *
   * Absent means "no evidence available", which is the shipped state while
   * oq-0004 is open: zero re-presses, one Enter, no claim either way. It is a
   * predicate rather than a captured pane string so that tk-0201 can decide
   * HOW to observe without reshaping this module.
   *
   * A probe that THROWS is treated as inconclusive and ends the loop without
   * failing the send: the type and the first Enter already happened, so
   * rejecting here would report a delivery failure that did not occur, and
   * pressing again on no evidence is the speculative replay rule 6 forbids.
   */
  isPayloadPending?: () => boolean | Promise<boolean>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Type `text` into the agent in `target`, and optionally submit it.
 *
 * Resolves `undefined` and never a success value. tmux exiting zero proves
 * bytes moved, not that the agent accepted them (workshop 001 § 5), so there
 * is deliberately nothing here for a caller to build a success claim on.
 *
 * Throws whatever the runner throws — the caller returns it over the socket as
 * a JSON error, never on the message loop.
 */
export async function sendPromptKeys({
  execCommand,
  target,
  text,
  submit,
  sleep = defaultSleep,
  isPayloadPending,
}: SendPromptKeysOptions): Promise<void> {
  // Rule 2: a trailing newline is a submit we did not ask for. Strip it rather
  // than typing it — on the paste path it would submit mid-paste, and on the
  // literal path it would submit and then let the explicit Enter fall through
  // to whatever renders next.
  const payload = text.replace(/[\r\n]+$/, '');
  // Nothing to type issues no tmux calls at all, so it cannot interleave with
  // anything and is answered without joining the queue. A bare Enter here
  // would re-submit whatever is already sitting in the composer.
  if (payload.length === 0) return;

  // Rule 7: resolve ONCE, before the queue, and address the pane from here on.
  // Before the queue because the queue key must be the composer being written
  // to, and a session name is not one; a throw here reaches the caller as a
  // failed send having issued no keystrokes at all.
  const pane = resolvePaneTarget(execCommand, target);

  // Rule 5: the whole sequence below is one critical section per pane.
  return enqueueForTarget(pane, async () => {
    // Rule 4: focus-in first, every time, before anything is typed.
    execCommand('tmux', ['send-keys', '-t', pane, ...FOCUS_IN_ARGS]);

    if (payload.includes('\n')) {
      // Rule 3: one atomic bracketed paste, not one send-keys per line.
      // `-p` is bracketed paste; `-d` deletes the buffer once it has been pasted.
      const buffer = `cg-prompt-${bufferSeq++}`;
      execCommand('tmux', ['set-buffer', '-b', buffer, payload]);
      execCommand('tmux', ['paste-buffer', '-p', '-d', '-b', buffer, '-t', pane]);
    } else {
      // Rule 1: `-l` literal mode. No `--` — with argv there is no shell to
      // confuse, and the workshop is explicit that a leading dash is already
      // safe here, so adding `--` would be re-deriving a shape it settled.
      execCommand('tmux', ['send-keys', '-t', pane, '-l', payload]);
    }

    if (submit) {
      // Rule 2: a SEPARATE call, after the settle, and the settle yields.
      await sleep(ENTER_SETTLE_MS);
      execCommand('tmux', ['send-keys', '-t', pane, 'Enter']);

      // Rule 6: at-most-once recovery. Note what is NOT in this loop — there
      // is no type call, no set-buffer and no paste-buffer. The only thing it
      // may ever issue again is Enter.
      //
      // It also runs INSIDE the queued critical section deliberately. A retry
      // that escaped the queue would re-open exactly the interleaving bug
      // rule 5 closes, and in its worst form: a second send could type into
      // the composer between a retry's probe and its Enter, so the retry
      // submits the wrong prompt.
      if (isPayloadPending) {
        for (let attempt = 0; attempt < ENTER_REPRESS_MAX_ATTEMPTS; attempt++) {
          await sleep(ENTER_REPRESS_INTERVAL_MS);
          let stillPending: boolean;
          try {
            stillPending = await isPayloadPending();
          } catch {
            return;
          }
          if (!stillPending) return;
          execCommand('tmux', ['send-keys', '-t', pane, 'Enter']);
        }
      }
    }
  });
}
