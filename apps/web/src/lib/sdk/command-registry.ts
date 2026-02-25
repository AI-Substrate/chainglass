/**
 * CommandRegistry — Real implementation of ICommandRegistry.
 *
 * Map-based storage mirroring NodeEventRegistry pattern (finding 06).
 * DYK-01: Throws on duplicate command ID.
 * DYK-05: execute() wraps handler in try/catch (swallow + toast).
 *
 * Per Plan 047 Phase 1, Task T006.
 */

import type { ICommandRegistry, IContextKeyService } from '@chainglass/shared/sdk';
import type { SDKCommand } from '@chainglass/shared/sdk';

export class CommandRegistry implements ICommandRegistry {
  private readonly commands = new Map<string, SDKCommand>();
  private readonly contextKeys: IContextKeyService;
  private readonly onError: (commandId: string, error: unknown) => void;

  constructor(
    contextKeys: IContextKeyService,
    onError?: (commandId: string, error: unknown) => void
  ) {
    this.contextKeys = contextKeys;
    this.onError =
      onError ??
      ((id, err) => {
        console.error(`[SDK] Command '${id}' failed:`, err);
      });
  }

  register(command: SDKCommand): { dispose: () => void } {
    if (this.commands.has(command.id)) {
      throw new Error(
        `SDK command '${command.id}' is already registered. Each command ID must have a single owner.`
      );
    }
    this.commands.set(command.id, command);
    return {
      dispose: () => {
        this.commands.delete(command.id);
      },
    };
  }

  async execute(id: string, params?: unknown): Promise<void> {
    const cmd = this.commands.get(id);
    if (!cmd) {
      throw new Error(`SDK command '${id}' is not registered.`);
    }

    // Zod validation — throws ZodError on invalid params (before handler)
    // Default to {} for no-param commands (z.object({}).parse(undefined) throws)
    const validated = cmd.params.parse(params ?? {});

    // DYK-05: Wrap handler in try/catch — never crash the caller
    try {
      await cmd.handler(validated);
    } catch (error) {
      this.onError(id, error);
    }
  }

  list(filter?: { domain?: string }): SDKCommand[] {
    const all = [...this.commands.values()];
    if (filter?.domain) {
      return all.filter((c) => c.domain === filter.domain);
    }
    return all;
  }

  isAvailable(id: string): boolean {
    const cmd = this.commands.get(id);
    if (!cmd) return false;
    return this.contextKeys.evaluate(cmd.when);
  }
}
