import { z } from 'zod';

import type { ConfigType } from '../../interfaces/config.interface.js';

/**
 * AgentConfig Zod schema.
 *
 * Per spec Q6 and ADR-0003: Configurable timeout with sensible defaults.
 *
 * Fields:
 * - timeout: number 1000-3600000 (1s - 1hr), default 600000 (10 min)
 *
 * Per spec AC-20: Default 10 minutes prevents runaway agents.
 *
 * This follows the SampleConfigSchema exemplar pattern.
 * Use z.infer<> for type derivation - single source of truth.
 */
export const AgentConfigSchema = z.object({
  /**
   * Execution timeout in milliseconds.
   * Minimum: 1000ms (1 second)
   * Maximum: 3600000ms (1 hour)
   * Default: 600000ms (10 minutes)
   *
   * Per AC-20: If agent exceeds this timeout, it is terminated.
   */
  timeout: z.coerce.number().min(1000).max(3600000).default(600000),
});

/**
 * Derived TypeScript type from the Zod schema.
 * Single source of truth - no separate interface definition.
 */
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/**
 * ConfigType definition for AgentConfig.
 * Used with IConfigService.get() and IConfigService.require().
 *
 * Example:
 * ```typescript
 * const config = configService.require(AgentConfigType);
 * console.log(config.timeout); // Type-safe: number (default: 600000)
 * ```
 */
export const AgentConfigType: ConfigType<AgentConfig> = {
  configPath: 'agent',
  parse: (raw: unknown): AgentConfig => AgentConfigSchema.parse(raw),
};
