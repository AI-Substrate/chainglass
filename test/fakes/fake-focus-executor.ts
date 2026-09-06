/**
 * FakeFocusExecutor — test double for the focus route's process seam — Plan 089 Phase 4 (T004).
 *
 * Injectable replacement for the `execFile`-backed `FocusExecutor`. Distinct from
 * {@link FakeTmuxExecutor} because that one is synchronous (`execFileSync`) and models the terminal
 * feature's session manager; this seam runs bounded read probes before its one selection.
 *
 * It records **every** invocation verbatim, including ones no test stubs, because the assertions this
 * fake exists for are as much about what was NOT run as about what was: identity refusals must
 * never select, and successes must contain exactly one selection with fixed argv and no shell.
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
  private readonly responses = new Map<string, Array<string | Error>>();

  /** Queue exact read responses; the final response repeats for subsequent clicks. */
  when(command: string, args: readonly string[], ...responses: Array<string | Error>): this {
    if (responses.length === 0) throw new Error('FakeFocusExecutor: a response is required');
    this.responses.set(JSON.stringify([command, args]), responses);
    return this;
  }

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
  ): Promise<string> => {
    this.calls.push({ command, args: [...args], timeoutMs: options.timeoutMs });
    if (this.failure) throw this.failure;
    const responses = this.responses.get(JSON.stringify([command, args]));
    const response = responses && (responses.length > 1 ? responses.shift() : responses[0]);
    if (response instanceof Error) throw response;
    if (response !== undefined) return response;
    if (command === 'tmux' && args[0] === 'select-window') return '';
    throw new Error(`FakeFocusExecutor: unstubbed ${command} ${JSON.stringify(args)}`);
  };

  /** The argv of the most recent call. Throws rather than returning undefined on no calls. */
  get lastArgs(): readonly string[] {
    const last = this.calls.at(-1);
    if (!last) throw new Error('FakeFocusExecutor: no calls recorded');
    return last.args;
  }
}
