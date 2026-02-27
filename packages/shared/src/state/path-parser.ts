/**
 * Plan 053: GlobalStateSystem — Path Parser
 *
 * Parses colon-delimited state paths into structured ParsedPath objects.
 * Pure function with no runtime dependencies.
 *
 * Per DYK-01: Only 2 and 3 segment paths are supported.
 *   2 segments: singleton domain — `domain:property`
 *   3 segments: multi-instance domain — `domain:instanceId:property`
 *
 * Per DYK-03: This parser is syntax-only — it does NOT validate against
 * domain registration. Domain-level validation (AC-08, AC-13, AC-14)
 * happens in GlobalStateSystem.publish().
 */

import type { ParsedPath } from './types.js';

const DOMAIN_PROPERTY_REGEX = /^[a-z][a-z0-9-]*$/;
const INSTANCE_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

/**
 * Parse a colon-delimited state path into its segments.
 *
 * @param path - State path (e.g., 'worktree:active-file' or 'workflow:wf-1:status')
 * @returns Parsed path with domain, instanceId, property, and raw fields
 * @throws Error if path has invalid format, empty segments, or unsupported segment count
 */
export function parsePath(path: string): ParsedPath {
  if (!path || typeof path !== 'string') {
    throw new Error(`Invalid state path: expected non-empty string, got ${String(path)}`);
  }

  const segments = path.split(':');

  if (segments.some((s) => s === '')) {
    throw new Error(`Invalid state path "${path}": contains empty segment`);
  }

  if (segments.length === 2) {
    const [domain, property] = segments;
    validateDomainOrProperty(domain, 'domain', path);
    validateDomainOrProperty(property, 'property', path);
    return { domain, instanceId: null, property, raw: path };
  }

  if (segments.length === 3) {
    const [domain, instanceId, property] = segments;
    validateDomainOrProperty(domain, 'domain', path);
    validateInstanceId(instanceId, path);
    validateDomainOrProperty(property, 'property', path);
    return { domain, instanceId, property, raw: path };
  }

  throw new Error(
    `Invalid state path "${path}": expected 2 segments (domain:property) ` +
      `or 3 segments (domain:instanceId:property), got ${segments.length}`
  );
}

function validateDomainOrProperty(segment: string, role: string, path: string): void {
  if (!DOMAIN_PROPERTY_REGEX.test(segment)) {
    throw new Error(
      `Invalid state path "${path}": ${role} "${segment}" must match [a-z][a-z0-9-]*`
    );
  }
}

function validateInstanceId(segment: string, path: string): void {
  if (!INSTANCE_ID_REGEX.test(segment)) {
    throw new Error(
      `Invalid state path "${path}": instanceId "${segment}" must match [a-zA-Z0-9_-]+`
    );
  }
}
