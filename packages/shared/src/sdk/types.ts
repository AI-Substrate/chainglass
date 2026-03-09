/**
 * SDK value types for the USDK framework.
 *
 * These are data structures (not interfaces) used by SDK interfaces.
 * Interfaces live in packages/shared/src/interfaces/sdk.interface.ts.
 *
 * DYK-04: Codebase uses Zod v4 (^4.3.5). Do not copy Zod v3 patterns from workshops.
 */

import type { z } from 'zod';

// Structural bridge for Zod v3/v4 type compatibility.
// packages/shared ships v4 types, but consumers may resolve v3 at build time.
// Both versions share this runtime interface, so the constraint is safe.
// biome-ignore lint/suspicious/noExplicitAny: Zod v3/v4 structural bridge
type ZodSchema = { parse: (data: any) => any; safeParse: (data: any) => any };

/**
 * A command registered by a domain.
 * Commands are the atomic unit of SDK functionality.
 */
export interface SDKCommand<TParams extends ZodSchema = ZodSchema> {
  /** Unique ID: 'domain.verb' or 'domain.noun.verb' */
  id: string;

  /** Human-readable title shown in command palette */
  title: string;

  /** Domain that owns this command */
  domain: string;

  /** Optional grouping for palette display */
  category?: string;

  /** Zod schema for parameters. Use z.object({}) for no params. */
  params: TParams;

  /** The handler. Receives validated params. */
  handler: (params: z.infer<TParams>) => Promise<void>;

  /** When-clause: command only available when this evaluates true */
  when?: string;

  /** Icon for palette display (Lucide icon name) */
  icon?: string;
}

/**
 * A setting contributed by a domain.
 * Settings are typed via Zod schema, validated on read/write,
 * and observable via onChange.
 */
export interface SDKSetting<T extends ZodSchema = ZodSchema> {
  /** Unique key: 'domain.settingName' */
  key: string;

  /** Domain that owns this setting */
  domain: string;

  /** Human-readable label for settings UI */
  label: string;

  /** Longer description for settings UI */
  description: string;

  /** Zod schema with .default() for the default value */
  schema: T;

  /** UI control hint for settings page rendering */
  ui?: 'toggle' | 'select' | 'text' | 'number' | 'color' | 'emoji';

  /** Options for 'select' ui type */
  options?: Array<{ value: string; label: string }>;

  /** Section path for settings page grouping. Falls back to domain if omitted. */
  section?: string;
}

/**
 * A keyboard shortcut bound to a command.
 * Supports single keys (ctrl+p) and chords (ctrl+k ctrl+c).
 */
export interface SDKKeybinding {
  /** Key combination: 'ctrl+shift+p' or 'ctrl+k ctrl+c' (chord) */
  key: string;

  /** Command ID to execute */
  command: string;

  /** When-clause: binding only active when this evaluates true */
  when?: string;

  /** Arguments to pass to command */
  args?: Record<string, unknown>;
}

/**
 * A domain's complete SDK contribution (static manifest).
 * Declared statically. Handlers bound at registration time.
 */
export interface SDKContribution {
  /** Domain identifier */
  domain: string;

  /** Human-readable domain name for settings grouping */
  domainLabel: string;

  /** Commands this domain contributes (without handlers — bound in register function) */
  commands: Omit<SDKCommand, 'handler'>[];

  /** Settings this domain contributes */
  settings: SDKSetting[];

  /** Default keybindings for this domain's commands */
  keybindings: SDKKeybinding[];
}
