import { z } from 'zod';

import type { ConfigType } from '../../interfaces/config.interface.js';

/**
 * SampleConfig Zod schema.
 *
 * Fields:
 * - enabled: boolean, default true
 * - timeout: number 1-300, default 30
 * - name: string, default 'default'
 *
 * This is the exemplar config schema. Use z.infer<> for type derivation.
 */
export const SampleConfigSchema = z.object({
  enabled: z.boolean().default(true),
  timeout: z.coerce.number().min(1).max(300).default(30),
  name: z.string().default('default'),
});

/**
 * Derived TypeScript type from the Zod schema.
 * Single source of truth - no separate interface definition.
 */
export type SampleConfig = z.infer<typeof SampleConfigSchema>;

/**
 * ConfigType definition for SampleConfig.
 * Used with IConfigService.get() and IConfigService.require().
 *
 * Example:
 * ```typescript
 * const config = configService.require(SampleConfigType);
 * console.log(config.timeout); // Type-safe: number
 * ```
 */
export const SampleConfigType: ConfigType<SampleConfig> = {
  configPath: 'sample',
  parse: (raw: unknown): SampleConfig => SampleConfigSchema.parse(raw),
};
