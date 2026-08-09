// @vitest-environment node
/**
 * Phase 2 send path — Plan 092, tk-0106.
 *
 * These tests assert on the RECORDED ARGV ARRAYS, never on a live tmux pane.
 * Every case here is a production defect scar from
 * `assets/workshops/001-send-keys-to-coding-agents.md`, and the workshop's
 * standing warning is that all four of them pass a manual test: the default
 * posture (focused pane, single line, agent idle) is the one configuration in
 * which every bug is invisible. So the suite tests the hostile shapes —
 * backgrounded (focus-in), multi-line (bracketed paste), hostile text (two
 * protection layers), and the settle (must not block).
 *
 * Fakes over mocks (Constitution P4): the runner below is a plain recorder,
 * not `vi.mock`.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  ENTER_REPRESS_INTERVAL_MS,
  ENTER_REPRESS_MAX_ATTEMPTS,
  ENTER_SETTLE_BY_HARNESS,
  ENTER_SETTLE_MS,
  FOCUS_IN_ARGS,
  _resetPromptBufferSeqForTests,
  _resetPromptSendQueuesForTests,
  sendPromptKeys,
} from '@/features/064-terminal/server/send-prompt-keys';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TARGET = 'my-session';

interface RecordedCall {
  command: string;
  args: string[];
}

/** Recording argv runner. Records the exact array it was handed. */
function createRecorder(onCall?: (call: RecordedCall) => void) {
  const calls: RecordedCall[] = [];
  return {
    calls,
    exec: (command: string, args: string[]): string => {
      const call = { command, args };
      calls.push(call);
      onCall?.(call);
      return '';
    },
  };
}

/** The literal type call, if any — `send-keys … -l <payload>`. */
function typeCalls(calls: RecordedCall[]): RecordedCall[] {
  return calls.filter((c) => c.args[0] === 'send-keys' && c.args.includes('-l'));
}

/** The submit call, if any — `send-keys … Enter`, with no `-l`. */
function enterCalls(calls: RecordedCall[]): RecordedCall[] {
  return calls.filter(
    (c) => c.args[0] === 'send-keys' && !c.args.includes('-l') && c.args.includes('Enter')
  );
}

function focusInCalls(calls: RecordedCall[]): RecordedCall[] {
  return calls.filter((c) => c.args[0] === 'send-keys' && c.args.includes('-H'));
}

/** Zero-delay sleep — still a real yield to the event loop, just not 900ms of it. */
const instantSleep = () => Promise.resolve();

beforeEach(() => {
  _resetPromptBufferSeqForTests();
  _resetPromptSendQueuesForTests();
});

describe('send path — call shape and order (tk-0101)', () => {
  it('send.type-only-issues-no-enter: typing leaves the prompt in the composer to edit', async () => {
    /*
    Test Doc:
    - Why: ac-0004 — the type action must NOT submit, or the "edit before you
      send" affordance the drawer advertises is a lie.
    - Contract: submit:false produces exactly one literal send-keys and zero Enter.
    - Quality Contribution: dw-1011. Catches an accidental unconditional Enter.
    */
    const runner = createRecorder();

    await sendPromptKeys({
      execCommand: runner.exec,
      target: TARGET,
      text: 'refactor this module',
      submit: false,
      sleep: instantSleep,
    });

    expect(typeCalls(runner.calls)).toHaveLength(1);
    expect(enterCalls(runner.calls)).toHaveLength(0);
    expect(typeCalls(runner.calls)[0].args).toEqual([
      'send-keys',
      '-t',
      TARGET,
      '-l',
      'refactor this module',
    ]);
  });

  it('send.submit-issues-one-separate-enter: type and submit are two calls, never one', async () => {
    /*
    Test Doc:
    - Why: ac-0005 / workshop § 1 — `-l "text\n"` submits at the newline AND
      then the explicit Enter fires into whatever renders next. The only safe
      shape is two calls.
    - Contract: submit:true → exactly one literal type, then exactly one Enter,
      in that order, and the typed payload carries no newline.
    - Quality Contribution: dw-1012. Fails if Enter is folded into the type call.
    */
    const runner = createRecorder();

    await sendPromptKeys({
      execCommand: runner.exec,
      target: TARGET,
      text: 'ship it',
      submit: true,
      sleep: instantSleep,
    });

    const types = typeCalls(runner.calls);
    const enters = enterCalls(runner.calls);
    expect(types).toHaveLength(1);
    expect(enters).toHaveLength(1);
    expect(enters[0].args).toEqual(['send-keys', '-t', TARGET, 'Enter']);
    expect(runner.calls.indexOf(types[0])).toBeLessThan(runner.calls.indexOf(enters[0]));
    for (const arg of types[0].args) {
      expect(arg).not.toContain('\n');
    }
  });

  it('send.trailing-newline-never-typed: a stray newline in the source text cannot submit early', async () => {
    /*
    Test Doc:
    - Why: workshop § 1 — never `-l` a trailing newline. A prompt authored with
      a trailing blank line would otherwise submit at the newline and leave the
      explicit Enter to land somewhere unrelated.
    - Contract: trailing newlines are stripped, and the send stays on the
      single-line literal path rather than becoming a paste.
    - Quality Contribution: guards the boundary between the literal path and
      the paste path, which is decided by "contains a newline".
    */
    const runner = createRecorder();

    await sendPromptKeys({
      execCommand: runner.exec,
      target: TARGET,
      text: 'run the tests\n',
      submit: true,
      sleep: instantSleep,
    });

    expect(typeCalls(runner.calls)).toHaveLength(1);
    expect(typeCalls(runner.calls)[0].args.at(-1)).toBe('run the tests');
    expect(runner.calls.some((c) => c.args[0] === 'set-buffer')).toBe(false);
  });

  it('send.runner-receives-argv-never-a-shell-string: no shell is ever constructed', async () => {
    /*
    Test Doc:
    - Why: ac-0007 / pij#128 — argv is the layer that makes backticks and
      `$(…)` inert, because no shell ever sees them. A quoted body form was
      pij's own documented shape and it executed shell substitutions.
    - Contract: every call is (command, args[]) with the command a bare binary
      name, and no single argument smuggles the whole command line.
    - Quality Contribution: dw-1013. Fails the moment anyone builds a string.
    */
    const runner = createRecorder();

    await sendPromptKeys({
      execCommand: runner.exec,
      target: TARGET,
      text: 'echo hi',
      submit: true,
      sleep: instantSleep,
    });

    expect(runner.calls.length).toBeGreaterThan(0);
    for (const call of runner.calls) {
      expect(call.command).toBe('tmux');
      expect(Array.isArray(call.args)).toBe(true);
      // A shell string would show up as one argument containing the binary
      // name and its own separators.
      for (const arg of call.args) {
        expect(arg).not.toMatch(/^tmux\s/);
      }
      expect(call.args.some((a) => a === '-c' || a === '-lc')).toBe(false);
    }
  });
});

describe('send path — focus-in before typing (tk-0102)', () => {
  it('send.focus-in-precedes-first-type-on-submit: a backgrounded copilot pane still submits', async () => {
    /*
    Test Doc:
    - Why: ac-0011 / workshop § 4 — copilot gates submit on FOCUS STATE, not on
      render. With focus-events on, a backgrounded pane has been told focus-OUT
      and swallows Return; the text strands in the composer. A SIGWINCH redraw
      does not fix it. A browser drawer is definitionally driving an unfocused
      pane, so this is the failure that would otherwise ship.
    - Contract: `send-keys -t <target> -H 1b 5b 49` (CSI I) is the FIRST call.
    - Quality Contribution: dw-1021.
    */
    const runner = createRecorder();

    await sendPromptKeys({
      execCommand: runner.exec,
      target: TARGET,
      text: 'go',
      submit: true,
      sleep: instantSleep,
    });

    const focus = focusInCalls(runner.calls);
    expect(focus).toHaveLength(1);
    expect(focus[0].args).toEqual(['send-keys', '-t', TARGET, ...FOCUS_IN_ARGS]);
    expect(runner.calls[0]).toBe(focus[0]);
    expect(runner.calls.indexOf(focus[0])).toBeLessThan(
      runner.calls.indexOf(typeCalls(runner.calls)[0])
    );
  });

  it('send.focus-in-on-every-send-including-type-only: not just the submitting path', async () => {
    /*
    Test Doc:
    - Why: "every send" is the workshop's word. A type-only send into a
      backgrounded pane has the same focus problem — the composer is what is
      being written to either way.
    - Contract: submit:false still issues focus-in first.
    - Quality Contribution: dw-1021 — fails if focus-in is gated on submit.
    */
    const runner = createRecorder();

    await sendPromptKeys({
      execCommand: runner.exec,
      target: TARGET,
      text: 'draft only',
      submit: false,
      sleep: instantSleep,
    });

    expect(focusInCalls(runner.calls)).toHaveLength(1);
    expect(runner.calls[0].args).toEqual(['send-keys', '-t', TARGET, ...FOCUS_IN_ARGS]);
  });

  it('send.focus-in-precedes-the-paste-path-too: multi-line is not a side door', async () => {
    /*
    Test Doc:
    - Why: the paste path is a separate branch, and a rule applied on only one
      branch is exactly how pij's settle table reached only one call site.
    - Contract: focus-in is still first when the payload goes via set-buffer.
    - Quality Contribution: dw-1021 across both delivery shapes.
    */
    const runner = createRecorder();

    await sendPromptKeys({
      execCommand: runner.exec,
      target: TARGET,
      text: 'line one\nline two',
      submit: false,
      sleep: instantSleep,
    });

    expect(runner.calls[0].args).toEqual(['send-keys', '-t', TARGET, ...FOCUS_IN_ARGS]);
    expect(runner.calls[1].args[0]).toBe('set-buffer');
  });
});

describe('send path — one settle table, conservative and non-blocking (tk-0103)', () => {
  it('settle.table-carries-the-measured-values: claude/codex/pi 350, copilot 900', () => {
    /*
    Test Doc:
    - Why: ac-0013 — these are ermine's measured values from pij's daemon. A
      grep of the pij repo surfaces a stale harness-blind 300 from their CLI
      (pij#159), so the table has to be pinned here rather than trusted.
    - Contract: the exported table matches the workshop verbatim.
    - Quality Contribution: dw-1031.
    */
    expect(ENTER_SETTLE_BY_HARNESS).toEqual({
      claude: 350,
      copilot: 900,
      codex: 350,
      pi: 350,
    });
  });

  it('settle.selection-is-the-conservative-maximum: never the short one', () => {
    /*
    Test Doc:
    - Why: ac-0013 — the sidecar has no harness signal, and a detector's
      failure mode is the SHORT settle, i.e. the stranded-composer bug, which
      is invisible in the default test posture. Slow is visible; early is
      silent.
    - Contract: ENTER_SETTLE_MS is the maximum of the table, not a restated
      literal — so the number cannot drift away from the table.
    - Quality Contribution: dw-1031.
    */
    expect(ENTER_SETTLE_MS).toBe(Math.max(...Object.values(ENTER_SETTLE_BY_HARNESS)));
    expect(ENTER_SETTLE_MS).toBe(ENTER_SETTLE_BY_HARNESS.copilot);
  });

  it('settle.no-second-numeric-literal-in-the-feature: pij drifted precisely here', () => {
    /*
    Test Doc:
    - Why: ac-0013 — pij has two send-keys call sites and the per-harness table
      reached only one of them; the other still hardcodes 300 (pij#159). The
      structural defence is that the values appear in exactly one file.
    - Contract: the settle values occur nowhere in the feature directory except
      the module that exports the table.
    - Quality Contribution: dw-1031. This is a source scan, not a behaviour
      test, because the defect it guards is a second copy — which no behaviour
      test can see.
    */
    const REPO_ROOT = join(import.meta.dirname, '../../../../..');
    const FEATURE_DIR = join(REPO_ROOT, 'apps/web/src/features/064-terminal');
    const SETTLE_MODULE = join(FEATURE_DIR, 'server/send-prompt-keys.ts');

    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (/\.(ts|tsx)$/.test(full)) files.push(full);
      }
    };
    walk(FEATURE_DIR);
    expect(files).toContain(SETTLE_MODULE);

    const settleValues = [...new Set(Object.values(ENTER_SETTLE_BY_HARNESS))];
    const pattern = new RegExp(`\\b(${settleValues.join('|')})\\b`);
    const offenders = files
      .filter((f) => f !== SETTLE_MODULE)
      .filter((f) => pattern.test(readFileSync(f, 'utf8')))
      .map((f) => relative(REPO_ROOT, f));

    expect(
      offenders,
      `A settle value (${settleValues.join(', ')}) appears outside the one exported table. That is exactly how pij drifted — daemon 350/900, CLI 300 (pij#159). Import ENTER_SETTLE_MS instead of restating it. Offending files: ${offenders.join(', ')}`
    ).toEqual([]);
  });

  it('settle.does-not-block-the-message-loop: other work runs between the type and the Enter', async () => {
    /*
    Test Doc:
    - Why: ac-0012 — execCommand is execFileSync and the ws message handler is
      the event loop. A synchronous 900ms settle freezes the user's terminal
      for a second on every click.
    - Contract: with the REAL default sleep and the REAL 900ms constant,
      unrelated queued work runs after the type call and before the Enter.
    - Quality Contribution: dw-1032. A busy-wait or a sync sleep would put
      'other-work' after 'enter' and fail this.
    */
    vi.useFakeTimers();
    try {
      const order: string[] = [];
      const runner = createRecorder((call) => {
        if (call.args.includes('-l')) order.push('type');
        else if (call.args.includes('Enter')) order.push('enter');
      });

      setTimeout(() => order.push('other-work'), 0);

      // No `sleep` override — this exercises the shipped default.
      const pending = sendPromptKeys({
        execCommand: runner.exec,
        target: TARGET,
        text: 'slow one',
        submit: true,
      });

      // Control came back to the test with the Enter still outstanding.
      expect(order).toEqual(['type']);

      await vi.advanceTimersByTimeAsync(ENTER_SETTLE_MS);
      await pending;

      expect(order).toEqual(['type', 'other-work', 'enter']);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('send path — bracketed paste for multi-line (tk-0104)', () => {
  it('send.multiline-uses-bracketed-paste: three lines are one paste, not three submits', async () => {
    /*
    Test Doc:
    - Why: ac-0010 / workshop § 3 — a real newline in an agent TUI IS a submit,
      so a 3-line prompt typed literally submits three partial prompts.
    - Contract: set-buffer then `paste-buffer -p -d`, and zero literal
      send-keys calls.
    - Quality Contribution: dw-1041.
    */
    const runner = createRecorder();
    const text = 'first line\nsecond line\nthird line';

    await sendPromptKeys({
      execCommand: runner.exec,
      target: TARGET,
      text,
      submit: false,
      sleep: instantSleep,
    });

    const setBuffer = runner.calls.filter((c) => c.args[0] === 'set-buffer');
    const paste = runner.calls.filter((c) => c.args[0] === 'paste-buffer');
    expect(setBuffer).toHaveLength(1);
    expect(paste).toHaveLength(1);
    expect(typeCalls(runner.calls)).toHaveLength(0);

    // The payload is one argv element, whole and unflattened — flattening onto
    // a separator is right for machine turns and wrong for human prompts.
    expect(setBuffer[0].args.at(-1)).toBe(text);
    const bufferName = setBuffer[0].args[setBuffer[0].args.indexOf('-b') + 1];
    expect(paste[0].args).toEqual(['paste-buffer', '-p', '-d', '-b', bufferName, '-t', TARGET]);
    expect(runner.calls.indexOf(setBuffer[0])).toBeLessThan(runner.calls.indexOf(paste[0]));
  });

  it('send.multiline-submit-still-uses-one-separate-enter: paste then settle then Enter', async () => {
    /*
    Test Doc:
    - Why: the paste must not carry its own submit, and the submit must still
      be one separate Enter after the settle.
    - Contract: exactly one Enter, issued after the paste.
    - Quality Contribution: dw-1041 + dw-1012 across the paste branch.
    */
    const runner = createRecorder();

    await sendPromptKeys({
      execCommand: runner.exec,
      target: TARGET,
      text: 'a\nb\nc',
      submit: true,
      sleep: instantSleep,
    });

    const enters = enterCalls(runner.calls);
    expect(enters).toHaveLength(1);
    const paste = runner.calls.find((c) => c.args[0] === 'paste-buffer');
    expect(paste).toBeDefined();
    expect(runner.calls.indexOf(paste as RecordedCall)).toBeLessThan(
      runner.calls.indexOf(enters[0])
    );
  });

  it('send.paste-buffers-do-not-collide: sequential sends get distinct buffer names', async () => {
    /*
    Test Doc:
    - Why: a fixed buffer name lets a second send's set-buffer overwrite the
      first's before it pastes, so the wrong prompt lands in the wrong pane.
    - Contract: two sends use two buffer names.
    - Quality Contribution: guards buffer-name reuse ONLY. This test is
      deliberately sequential and is now deliberately named so: an earlier
      version called itself a concurrency guard while its body was
      await-then-await, and its green is why the interleaving defect in
      bp-0020 survived seven mutations and a review pass. The concurrency
      contract lives in the tk-0107 describe below, where the sends actually
      are concurrent.
    */
    const runner = createRecorder();
    const opts = {
      execCommand: runner.exec,
      target: TARGET,
      submit: false,
      sleep: instantSleep,
    };

    await sendPromptKeys({ ...opts, text: 'one\ntwo' });
    await sendPromptKeys({ ...opts, text: 'three\nfour' });

    const names = runner.calls
      .filter((c) => c.args[0] === 'set-buffer')
      .map((c) => c.args[c.args.indexOf('-b') + 1]);
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
  });
});

describe('send path — one send at a time per pane (tk-0107)', () => {
  /**
   * The index of the call carrying `payload` — the literal `-l <payload>` call
   * on the single-line branch, or the `set-buffer` on the multi-line one.
   */
  function typedAt(calls: RecordedCall[], payload: string): number {
    return calls.findIndex((c) => c.args.includes(payload));
  }

  it('send.concurrent-sends-to-one-pane-do-not-interleave: every call of A precedes every call of B', async () => {
    /*
    Test Doc:
    - Why: ac-0017 / bp-0020. The websocket handler is registered as
      `ws.on('message', async …)`, so every frame starts an INDEPENDENT
      handler, and the send sequence parks on a 900ms settle between typing and
      Enter. Two rapid submits to one pane therefore interleave: A types and
      waits, B types into the SAME composer, and A's Enter submits A+B as a
      single prompt. The conservative-maximum settle that makes the send
      reliable is the very thing that makes this window nearly a second wide.
    - Contract: with two sends fired TRULY concurrently at one target, the two
      three-call sequences do not interleave — every call of A lands before the
      first call of B.
    - Quality Contribution: dw-1071. Removing the per-session queue reorders
      these calls and reddens this test (dw-1072). Asserting distinct paste
      buffer names does not, which is exactly how the defect got through.
    */
    const runner = createRecorder();
    const opts = {
      execCommand: runner.exec,
      target: TARGET,
      submit: true,
      sleep: instantSleep,
    };

    await Promise.all([
      sendPromptKeys({ ...opts, text: 'PROMPT-A' }),
      sendPromptKeys({ ...opts, text: 'PROMPT-B' }),
    ]);

    // Two complete sequences, three calls each: focus-in, type, Enter.
    expect(runner.calls).toHaveLength(6);
    // Each send owns a contiguous block, so its type call is the middle of it.
    expect(typedAt(runner.calls, 'PROMPT-A')).toBe(1);
    expect(typedAt(runner.calls, 'PROMPT-B')).toBe(4);
    expect(focusInCalls(runner.calls).map((c) => runner.calls.indexOf(c))).toEqual([0, 3]);
    expect(enterCalls(runner.calls).map((c) => runner.calls.indexOf(c))).toEqual([2, 5]);
  });

  it('send.concurrent-multiline-sends-do-not-interleave: set-buffer, paste and Enter stay contiguous', async () => {
    /*
    Test Doc:
    - Why: on the paste branch the critical section is wider — set-buffer and
      paste-buffer are two calls, and an interleaved send lands between them.
      Distinct buffer names stop the BUFFER being clobbered; they do nothing
      about the second prompt being pasted into the composer before the first
      is submitted, which is the actual bp-0020 hazard.
    - Contract: each send's four calls are contiguous and in order.
    - Quality Contribution: dw-1071 across the multi-line branch.
    */
    const runner = createRecorder();
    const opts = {
      execCommand: runner.exec,
      target: TARGET,
      submit: true,
      sleep: instantSleep,
    };

    await Promise.all([
      sendPromptKeys({ ...opts, text: 'A-one\nA-two' }),
      sendPromptKeys({ ...opts, text: 'B-one\nB-two' }),
    ]);

    expect(runner.calls).toHaveLength(8);
    expect(typedAt(runner.calls, 'A-one\nA-two')).toBe(1);
    expect(typedAt(runner.calls, 'B-one\nB-two')).toBe(5);
    expect(runner.calls.map((c) => c.args[0])).toEqual([
      'send-keys',
      'set-buffer',
      'paste-buffer',
      'send-keys',
      'send-keys',
      'set-buffer',
      'paste-buffer',
      'send-keys',
    ]);
  });

  it('send.different-panes-are-not-serialized: the queue is keyed by session, not global', async () => {
    /*
    Test Doc:
    - Why: the hazard is two frames aimed at ONE composer. A single global lock
      would also fix it, and would additionally make every pane in the
      workspace wait ~900ms behind every other — a performance defect no
      assertion elsewhere would notice.
    - Contract: a send to a second target types while the first target's send
      is still parked on its settle.
    - Quality Contribution: pins the queue KEY, so a later "simplification" to
      one shared chain fails here rather than shipping.
    */
    const runner = createRecorder();
    const releases: Array<() => void> = [];
    const heldSleep = () => new Promise<void>((resolve) => releases.push(resolve));

    const first = sendPromptKeys({
      execCommand: runner.exec,
      target: 'pane-one',
      text: 'FIRST',
      submit: true,
      sleep: heldSleep,
    });
    const second = sendPromptKeys({
      execCommand: runner.exec,
      target: 'pane-two',
      text: 'SECOND',
      submit: true,
      sleep: heldSleep,
    });

    // Both have typed and are parked on their own settles.
    expect(typedAt(runner.calls, 'FIRST')).toBeGreaterThanOrEqual(0);
    expect(typedAt(runner.calls, 'SECOND')).toBeGreaterThanOrEqual(0);
    expect(enterCalls(runner.calls)).toHaveLength(0);

    for (const release of releases) release();
    await Promise.all([first, second]);
    expect(enterCalls(runner.calls)).toHaveLength(2);
  });

  it('send.a-failed-send-does-not-poison-the-pane-queue: the next send still runs', async () => {
    /*
    Test Doc:
    - Why: the queue is long-lived module state. A rejected tail left in the
      map would silently disable the drawer for that pane until the server
      restarted, and it would present as "nothing happens when I click" rather
      than as an error.
    - Contract: the failing send rejects to ITS OWN caller; the next send for
      the same target completes normally.
    - Quality Contribution: dw-1071, queue-lifetime half.
    */
    let failNext = true;
    const runner = createRecorder();
    const exec = (command: string, args: string[]): string => {
      if (failNext && args.includes('-l')) {
        failNext = false;
        throw new Error('tmux: no server running');
      }
      return runner.exec(command, args);
    };

    await expect(
      sendPromptKeys({
        execCommand: exec,
        target: TARGET,
        text: 'BOOM',
        submit: true,
        sleep: instantSleep,
      })
    ).rejects.toThrow('no server running');

    await sendPromptKeys({
      execCommand: exec,
      target: TARGET,
      text: 'AFTER',
      submit: true,
      sleep: instantSleep,
    });

    expect(typedAt(runner.calls, 'AFTER')).toBeGreaterThanOrEqual(0);
    expect(enterCalls(runner.calls)).toHaveLength(1);
  });
});

describe('send path — hostile text is inert on both layers (tk-0106)', () => {
  it('send.hostile-prompt-survives-byte-identical: argv and -l, two parsers, two layers', async () => {
    /*
    Test Doc:
    - Why: ac-0007 — a drawer of SAVED prompts is a stored-payload surface. A
      saved prompt containing `$(rm -rf …)` is the attack (pij#128). argv stops
      the shell; `-l` stops tmux key-name-parsing an embedded `Enter`. Removing
      either one is a live vulnerability, so both are asserted here together.
    - Contract: the payload reaches the runner as one unmodified argv element,
      alongside `-l`.
    - Quality Contribution: dw-1061.
    */
    const hostile = '-x `id` $(rm -rf /) "quoted" \'single\'; echo pwned && Enter C-c | tee /tmp/x';
    const runner = createRecorder();

    await sendPromptKeys({
      execCommand: runner.exec,
      target: TARGET,
      text: hostile,
      submit: false,
      sleep: instantSleep,
    });

    const types = typeCalls(runner.calls);
    expect(types).toHaveLength(1);
    expect(types[0].args).toContain('-l');
    // Byte-identical: not escaped, not quoted, not truncated at the semicolon,
    // not split at the leading dash.
    expect(types[0].args.at(-1)).toBe(hostile);
    expect(types[0].args.filter((a) => a === hostile)).toHaveLength(1);
  });

  it('send.hostile-multiline-prompt-survives-the-paste-path-too', async () => {
    /*
    Test Doc:
    - Why: the paste branch hands the payload to `set-buffer`, which is a
      different argv position than the literal branch — the protection has to
      hold on both.
    - Contract: the multi-line hostile payload is one unmodified argv element.
    - Quality Contribution: dw-1061 across both delivery shapes.
    */
    const hostile = '`whoami`\n$(cat /etc/passwd)\n; rm -rf ~ # Enter';
    const runner = createRecorder();

    await sendPromptKeys({
      execCommand: runner.exec,
      target: TARGET,
      text: hostile,
      submit: false,
      sleep: instantSleep,
    });

    const setBuffer = runner.calls.find((c) => c.args[0] === 'set-buffer');
    expect(setBuffer).toBeDefined();
    expect((setBuffer as RecordedCall).args.at(-1)).toBe(hostile);
  });

  it('send.empty-prompt-touches-nothing: no focus-in, no type, no Enter', async () => {
    /*
    Test Doc:
    - Why: a bare Enter into a coding agent re-submits whatever is already in
      the composer, which is a stray submit the user never asked for.
    - Contract: an empty (or newline-only) payload issues zero tmux calls.
    - Quality Contribution: guards the degenerate input the UI does not
      currently prevent.
    */
    const runner = createRecorder();

    await sendPromptKeys({
      execCommand: runner.exec,
      target: TARGET,
      text: '\n\n',
      submit: true,
      sleep: instantSleep,
    });

    expect(runner.calls).toEqual([]);
  });
});

describe('send path — at-most-once Enter re-press (tk-0202)', () => {
  /** Records every settle the send asks for, and never actually waits. */
  function createSleepRecorder() {
    const waits: number[] = [];
    return {
      waits,
      sleep: (ms: number): Promise<void> => {
        waits.push(ms);
        return Promise.resolve();
      },
    };
  }

  /** A pending signal that always answers "still sitting in the composer". */
  function alwaysPending() {
    let probes = 0;
    return {
      probeCount: () => probes,
      isPayloadPending: () => {
        probes++;
        return true;
      },
    };
  }

  it('repress.inconclusive-verification-yields-at-most-three-enters-and-zero-retypes', async () => {
    /*
    Test Doc:
    - Why: dw-2021 / workshop 001 § 2. The settle is a guess, so a submit can
      fail to take; the recovery is bounded and Enter-only. The forbidden
      recovery is retyping — "an empty composer with inconclusive telemetry is
      an ambiguous SUCCESS, and at-most-once beats speculative replay", so a
      retype converts an ambiguous success into a certain double-submit.
    - Contract: a signal that never clears yields exactly 1 + 3 Enter calls,
      exactly ONE type call, exactly one focus-in, and nothing else. The
      re-presses are 250ms apart and the first one follows the full settle.
    - Quality Contribution: dw-2021. This is the load-bearing assertion of the
      task: it pins the ceiling AND the never-retype rule in one place. Adding
      a type call inside the loop, or dropping the bound, reddens it.
    */
    const runner = createRecorder();
    const timer = createSleepRecorder();
    const signal = alwaysPending();

    await sendPromptKeys({
      execCommand: runner.exec,
      target: TARGET,
      text: 'ship it',
      submit: true,
      sleep: timer.sleep,
      isPayloadPending: signal.isPayloadPending,
    });

    // AT MOST once more, three times over: the first Enter plus the budget.
    expect(enterCalls(runner.calls)).toHaveLength(1 + ENTER_REPRESS_MAX_ATTEMPTS);
    // The whole point: the payload is typed ONCE, no matter how many Enters.
    expect(typeCalls(runner.calls)).toHaveLength(1);
    expect(focusInCalls(runner.calls)).toHaveLength(1);
    // Nothing else at all — no capture, no set-buffer, no second focus-in.
    expect(runner.calls).toHaveLength(2 + 1 + ENTER_REPRESS_MAX_ATTEMPTS);

    // Settle first, then the re-press cadence — three probes, three waits.
    expect(timer.waits).toEqual([
      ENTER_SETTLE_MS,
      ENTER_REPRESS_INTERVAL_MS,
      ENTER_REPRESS_INTERVAL_MS,
      ENTER_REPRESS_INTERVAL_MS,
    ]);
    expect(signal.probeCount()).toBe(ENTER_REPRESS_MAX_ATTEMPTS);
  });

  it('repress.stops-the-moment-the-composer-is-clear: no Enter on no evidence', async () => {
    /*
    Test Doc:
    - Why: a stray Enter in a coding agent is not free — it submits whatever
      the agent is rendering next. Re-pressing is licensed ONLY by observed
      pendency, so a cleared composer must end the loop immediately rather
      than spend the remaining budget.
    - Contract: a signal that answers "not pending" on its first probe yields
      exactly one Enter in total and is never probed again.
    - Quality Contribution: dw-2021's other edge. Deleting the `if
      (!stillPending) return` guard turns this into four Enters.
    */
    const runner = createRecorder();
    let probes = 0;

    await sendPromptKeys({
      execCommand: runner.exec,
      target: TARGET,
      text: 'ship it',
      submit: true,
      sleep: instantSleep,
      isPayloadPending: () => {
        probes++;
        return false;
      },
    });

    expect(enterCalls(runner.calls)).toHaveLength(1);
    expect(probes).toBe(1);
  });

  it('repress.never-retypes-on-the-paste-path-either: one set-buffer, one paste', async () => {
    /*
    Test Doc:
    - Why: the multi-line branch has two ways to retype — set-buffer and
      paste-buffer — and a recovery loop written around "re-send the prompt"
      rather than "re-press Enter" would repeat both. A repeated bracketed
      paste is the double-submit in its most visible form.
    - Contract: with a signal that never clears, the paste branch issues
      set-buffer once and paste-buffer once while pressing Enter four times.
    - Quality Contribution: dw-2021 across the branch the single-line test
      cannot see.
    */
    const runner = createRecorder();
    const signal = alwaysPending();

    await sendPromptKeys({
      execCommand: runner.exec,
      target: TARGET,
      text: 'line one\nline two',
      submit: true,
      sleep: instantSleep,
      isPayloadPending: signal.isPayloadPending,
    });

    expect(runner.calls.filter((c) => c.args[0] === 'set-buffer')).toHaveLength(1);
    expect(runner.calls.filter((c) => c.args[0] === 'paste-buffer')).toHaveLength(1);
    expect(enterCalls(runner.calls)).toHaveLength(1 + ENTER_REPRESS_MAX_ATTEMPTS);
  });

  it('repress.no-signal-means-no-re-press: the shipped behaviour while oq-0004 is open', async () => {
    /*
    Test Doc:
    - Why: the pane read is HELD (tk-0201, oq-0004), so the sender ships today
      with no evidence source. Re-pressing on no evidence is precisely the
      speculative replay the workshop forbids, so the absent-signal case must
      degrade to exactly the phase-2 behaviour rather than to a blind retry.
    - Contract: with `isPayloadPending` omitted, one Enter, one settle, and no
      re-press cadence at all.
    - Quality Contribution: dw-2021. This is the assertion that makes the
      injected-signal design safe to land ahead of its signal.
    */
    const runner = createRecorder();
    const timer = createSleepRecorder();

    await sendPromptKeys({
      execCommand: runner.exec,
      target: TARGET,
      text: 'ship it',
      submit: true,
      sleep: timer.sleep,
    });

    expect(enterCalls(runner.calls)).toHaveLength(1);
    expect(timer.waits).toEqual([ENTER_SETTLE_MS]);
  });

  it('repress.type-only-never-re-presses: nothing was submitted to recover', async () => {
    /*
    Test Doc:
    - Why: the type action deliberately leaves the prompt in the composer for
      the user to edit, so the payload being "still pending" there is the
      INTENDED state. A recovery loop that ran on this path would submit a
      prompt the user explicitly chose not to submit.
    - Contract: with submit:false the signal is never consulted and no Enter
      is ever issued, even though the payload is pending by construction.
    - Quality Contribution: dw-2021. Hoisting the loop out of the `if (submit)`
      block reddens this.
    */
    const runner = createRecorder();
    const signal = alwaysPending();

    await sendPromptKeys({
      execCommand: runner.exec,
      target: TARGET,
      text: 'draft this',
      submit: false,
      sleep: instantSleep,
      isPayloadPending: signal.isPayloadPending,
    });

    expect(enterCalls(runner.calls)).toEqual([]);
    expect(signal.probeCount()).toBe(0);
  });

  it('repress.an-inconclusive-probe-ends-the-loop-without-failing-the-send', async () => {
    /*
    Test Doc:
    - Why: the probe is a pane read that can fail (dead pane, tmux gone). Two
      wrong answers are available: press anyway — speculative replay on zero
      evidence — or reject, which reports a delivery failure for a send whose
      type and Enter both already happened, and which the UI would toast at a
      user whose prompt did in fact go.
    - Contract: a throwing probe stops the loop, leaves exactly one Enter, and
      the send still resolves.
    - Quality Contribution: this is the decision the tk-0201 implementer would
      otherwise have to rediscover; pinning it means supplying the real signal
      cannot silently change the failure semantics.
    */
    const runner = createRecorder();

    await expect(
      sendPromptKeys({
        execCommand: runner.exec,
        target: TARGET,
        text: 'ship it',
        submit: true,
        sleep: instantSleep,
        isPayloadPending: () => {
          throw new Error('no such pane');
        },
      })
    ).resolves.toBeUndefined();

    expect(enterCalls(runner.calls)).toHaveLength(1);
  });

  it('repress.stays-inside-the-per-pane-queue: a retry cannot submit the next prompt', async () => {
    /*
    Test Doc:
    - Why: the re-press loop adds up to 750ms of awaiting to a critical section
      that already parks for 900ms. If it ran outside the queue built in
      tk-0107 it would re-open bp-0020 in its worst form — a second send types
      into the composer between a retry's probe and its Enter, so the retry
      submits the WRONG prompt, and the probe that licensed it was answered
      about a payload that is no longer there.
    - Contract: with A re-pressing to its full budget and B fired truly
      concurrently at the same pane, every call of A precedes every call of B.
    - Quality Contribution: dw-2021 × dw-1071. Moving the loop outside
      `enqueueForTarget` reddens this and nothing else.
    */
    const runner = createRecorder();
    const signal = alwaysPending();

    await Promise.all([
      sendPromptKeys({
        execCommand: runner.exec,
        target: TARGET,
        text: 'PROMPT-A',
        submit: true,
        sleep: instantSleep,
        isPayloadPending: signal.isPayloadPending,
      }),
      sendPromptKeys({
        execCommand: runner.exec,
        target: TARGET,
        text: 'PROMPT-B',
        submit: true,
        sleep: instantSleep,
      }),
    ]);

    // A: focus, type, Enter, and three re-press Enters. B: focus, type, Enter.
    const aCalls = 2 + 1 + ENTER_REPRESS_MAX_ATTEMPTS;
    expect(runner.calls).toHaveLength(aCalls + 3);
    expect(runner.calls.findIndex((c) => c.args.includes('PROMPT-A'))).toBe(1);
    // B's payload lands only after every one of A's re-presses.
    expect(runner.calls.findIndex((c) => c.args.includes('PROMPT-B'))).toBe(aCalls + 1);
  });

  it('repress.budget-and-interval-live-in-exactly-one-place', () => {
    /*
    Test Doc:
    - Why: same structural defence as ac-0013's settle scan. These are
      defect-scar constants from workshop 001 § 2, and the way pij lost the
      settle table was a second call site restating the number (pij#159). The
      re-press interval is the next candidate for that.
    - Contract: 250 appears nowhere in the feature directory except the module
      that exports it.
    - Quality Contribution: a source scan, because the defect it guards is a
      second copy, which no behaviour test can see.
    */
    const REPO_ROOT = join(import.meta.dirname, '../../../../..');
    const FEATURE_DIR = join(REPO_ROOT, 'apps/web/src/features/064-terminal');
    const REPRESS_MODULE = join(FEATURE_DIR, 'server/send-prompt-keys.ts');

    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (/\.(ts|tsx)$/.test(full)) files.push(full);
      }
    };
    walk(FEATURE_DIR);
    expect(files).toContain(REPRESS_MODULE);

    const pattern = new RegExp(`\\b${ENTER_REPRESS_INTERVAL_MS}\\b`);
    const offenders = files
      .filter((f) => f !== REPRESS_MODULE)
      .filter((f) => pattern.test(readFileSync(f, 'utf8')))
      .map((f) => relative(REPO_ROOT, f));

    expect(
      offenders,
      `The re-press interval (${ENTER_REPRESS_INTERVAL_MS}) appears outside the module that exports it. Import ENTER_REPRESS_INTERVAL_MS instead of restating it. Offending files: ${offenders.join(', ')}`
    ).toEqual([]);
  });
});

describe('send path — nothing claims a success it cannot prove (tk-0202)', () => {
  it('honesty.the-sender-resolves-no-success-value: exit zero is not acceptance', async () => {
    /*
    Test Doc:
    - Why: dw-2022 / workshop 001 § 5 — "send-keys exiting 0 proves bytes
      moved, not that the agent accepted them. pij had to add composer polling
      because exit 0 was a lie." The cheapest way for that lie to enter this
      codebase is for the sender to start returning something truthy that a
      caller then forwards as a success.
    - Contract: a fully successful submit resolves `undefined`. There is
      nothing to build a success claim on.
    - Quality Contribution: dw-2022, at the source of the claim rather than at
      its display.
    */
    const runner = createRecorder();

    await expect(
      sendPromptKeys({
        execCommand: runner.exec,
        target: TARGET,
        text: 'ship it',
        submit: true,
        sleep: instantSleep,
      })
    ).resolves.toBeUndefined();
  });

  it('honesty.no-consumer-of-the-delivered-flag-signals-success', () => {
    /*
    Test Doc:
    - Why: dw-2022. Phase 2 ships NO success signal on purpose — terminal-inner
      toasts on failure only — and this task's job is to KEEP it that way, not
      to add one. The regression is a one-line "nice touch": a success toast
      next to the existing error toast, which would lie on every send that
      typed cleanly and never submitted.
    - Contract: any file in the feature that handles the `delivered` flag emits
      no success or informational notification. Files that never see the flag
      are untouched by this (the clipboard copy legitimately confirms itself —
      a clipboard write it can actually observe).
    - Quality Contribution: dw-2022. A source scan because the honest-state
      decision lives in an inline handler inside a component jsdom cannot
      render (DYK-04 — xterm), so no behaviour test can reach it. The scan is
      weaker evidence than a behaviour test and is named so no one mistakes it
      for one.
    */
    const REPO_ROOT = join(import.meta.dirname, '../../../../..');
    const FEATURE_DIR = join(REPO_ROOT, 'apps/web/src/features/064-terminal');

    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (/\.(ts|tsx)$/.test(full)) files.push(full);
      }
    };
    walk(FEATURE_DIR);

    const claimants = files
      .map((f) => ({ file: f, source: readFileSync(f, 'utf8') }))
      .filter(({ source }) => /\bdelivered\b/.test(source))
      .filter(({ source }) => /toast\.(success|info)\s*\(/.test(source))
      .map(({ file }) => relative(REPO_ROOT, file));

    expect(
      claimants,
      `A file that handles the send \`delivered\` flag reports success to the user. tmux exiting zero proves bytes moved, not that the agent accepted them (workshop 001 § 5) — pij shipped exactly this toast and it lied. An honest success signal needs an observed submit, which is ph-0003 tk-0201 and is HELD on oq-0004. Offending files: ${claimants.join(', ')}`
    ).toEqual([]);
  });
});
