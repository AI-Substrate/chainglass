/**
 * FakeTmuxExecutor — Test double for shell command execution
 *
 * Injectable replacement for the async `execFile` runner used by TmuxSessionManager.
 * Configurable responses per command+args combination. Rejects on unmatched commands.
 * The call is recorded synchronously, before the first await, so tests can assert on it at once.
 *
 * Constitution P4: Fakes Over Mocks — no vi.mock().
 */

interface CommandResponse {
  output: string;
  shouldThrow: boolean;
  exitCode: number;
}

export class FakeTmuxExecutor {
  private responses = new Map<string, CommandResponse>();
  readonly executedCommands: Array<{ command: string; args: string[] }> = [];

  private makeKey(command: string, args: string[]): string {
    return `${command} ${args.join(' ')}`;
  }

  /** Configure a successful response for a specific command+args */
  whenCommand(
    command: string,
    args: string[]
  ): {
    returns: (output: string) => FakeTmuxExecutor;
    throws: (exitCode?: number) => FakeTmuxExecutor;
  } {
    const key = this.makeKey(command, args);
    return {
      returns: (output: string) => {
        this.responses.set(key, { output, shouldThrow: false, exitCode: 0 });
        return this;
      },
      throws: (exitCode = 1) => {
        this.responses.set(key, { output: '', shouldThrow: true, exitCode });
        return this;
      },
    };
  }

  /** The injectable exec function — pass this to TmuxSessionManager constructor */
  exec = async (command: string, args: string[]): Promise<string> => {
    this.executedCommands.push({ command, args });
    const key = this.makeKey(command, args);
    const response = this.responses.get(key);

    if (!response) {
      const error = new Error(`FakeTmuxExecutor: unmatched command: ${key}`);
      (error as NodeJS.ErrnoException).code = 'ENOENT';
      throw error;
    }

    if (response.shouldThrow) {
      const error = new Error(`Command failed: ${key}`);
      Object.assign(error, { status: response.exitCode });
      throw error;
    }

    return response.output;
  };

  /** Assert a command was executed */
  assertExecuted(command: string, args: string[]): void {
    const key = this.makeKey(command, args);
    const found = this.executedCommands.some((c) => this.makeKey(c.command, c.args) === key);
    if (!found) {
      throw new Error(
        `Expected command "${key}" to be executed. Executed: ${this.executedCommands.map((c) => this.makeKey(c.command, c.args)).join(', ')}`
      );
    }
  }

  /** Reset all recorded commands */
  reset(): void {
    this.executedCommands.length = 0;
  }
}
