/**
 * FakeFocusExecutor — test double for the focus route's process seam — Plan 089 Phase 4 (T004).
 *
 * Injectable replacement for the `execFile`-backed `FocusExecutor`. Distinct from
 * {@link FakeTmuxExecutor} because that one is synchronous (`execFileSync`) and models the terminal
 * feature's session manager; this seam is async and runs exactly one command.
 *
 * It records **every** invocation verbatim, including ones no test stubs, because the assertions this
 * fake exists for are as much about what was NOT run as about what was: a refusal must leave
 * `calls` empty, and a success must contain exactly one fixed argv with no shell anywhere in it.
 *
 * Constitution P4: fakes over mocks, no `vi.mock()`.
 */

export interface RecordedFocusCall {
  command: string;
  args: readonly string[];
  timeoutMs: number;
}

export class FakeFocusExecutor {
  readonly calls: RecordedFocusCall[] = [];
  private failure: Error | null = null;

  /** Make the next (and every) invocation reject, as a dead tmux server would. */
  fails(error: Error): this {
    this.failure = error;
    return this;
  }

  /** The injectable executor — pass straight to `handlePijFocusRequest` deps. */
  exec = async (
    command: string,
    args: readonly string[],
    options: { timeoutMs: number }
  ): Promise<void> => {
    this.calls.push({ command, args: [...args], timeoutMs: options.timeoutMs });
    if (this.failure) throw this.failure;
  };

  /** The argv of the most recent call. Throws rather than returning undefined on no calls. */
  get lastArgs(): readonly string[] {
    const last = this.calls.at(-1);
    if (!last) throw new Error('FakeFocusExecutor: no calls recorded');
    return last.args;
  }
}
