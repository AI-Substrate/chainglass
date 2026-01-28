/**
 * YAML parser interface for workflow files.
 *
 * Per Critical Discovery 06: YAML parse errors must include line/column
 * information for agent-friendly error messages.
 *
 * Per Phase 2 didyouknow: Re-exported from @chainglass/shared for backward compatibility.
 * The actual definitions are in the shared package.
 */

// Re-export from shared
export { YamlParseError } from '@chainglass/shared';
export type { IYamlParser, ParseResult } from '@chainglass/shared';
