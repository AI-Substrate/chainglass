/**
 * Agent folder management — discovery, slug validation, run folder creation.
 *
 * Agent definitions live at harness/agents/<slug>/ with at least prompt.md.
 * Run folders are created under harness/agents/<slug>/runs/<timestamp-suffix>/.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { AgentDefinition } from './types.js';

/** Base directory for agent definitions, relative to harness root. */
const AGENTS_DIR = 'agents';

/** Regex for valid agent slugs: alphanumeric, hyphens, underscores, 1-64 chars. */
const SLUG_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Validate an agent slug for path safety.
 * Rejects path traversal attempts, invalid characters, and excessive length.
 *
 * @returns null if valid, error message if invalid
 */
export function validateSlug(slug: string): string | null {
  if (!slug) return 'Agent slug cannot be empty';
  if (slug.includes('..')) return 'Agent slug cannot contain ".."';
  if (slug.includes('/')) return 'Agent slug cannot contain "/"';
  if (slug.includes('\\')) return 'Agent slug cannot contain "\\"';
  if (slug.includes('\0')) return 'Agent slug cannot contain null bytes';
  if (!SLUG_PATTERN.test(slug)) {
    return `Agent slug must match [a-zA-Z0-9_-]{1,64}, got: "${slug}"`;
  }
  return null;
}

/**
 * Resolve the harness root directory (where agents/ lives).
 * Walks up from __dirname to find the harness/ directory.
 */
export function resolveHarnessRoot(): string {
  // harness/src/agent/folder.ts → ../../ → harness/
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(thisDir, '..', '..');
}

/**
 * Resolve the agents directory.
 */
export function resolveAgentsDir(harnessRoot?: string): string {
  const root = harnessRoot ?? resolveHarnessRoot();
  return path.join(root, AGENTS_DIR);
}

/**
 * List all available agent definitions by scanning for prompt.md files.
 */
export function listAgents(harnessRoot?: string): AgentDefinition[] {
  const agentsDir = resolveAgentsDir(harnessRoot);
  if (!fs.existsSync(agentsDir)) return [];

  const entries = fs.readdirSync(agentsDir, { withFileTypes: true });
  const agents: AgentDefinition[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const slugError = validateSlug(entry.name);
    if (slugError) continue; // Skip invalid folder names

    const dir = path.join(agentsDir, entry.name);
    const promptPath = path.join(dir, 'prompt.md');

    if (!fs.existsSync(promptPath)) continue; // Must have prompt.md

    const schemaPath = path.join(dir, 'output-schema.json');
    const instructionsPath = path.join(dir, 'instructions.md');

    agents.push({
      slug: entry.name,
      dir,
      promptPath,
      schemaPath: fs.existsSync(schemaPath) ? schemaPath : null,
      instructionsPath: fs.existsSync(instructionsPath) ? instructionsPath : null,
    });
  }

  return agents.sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * Resolve an agent definition by slug.
 *
 * @returns AgentDefinition or null if not found
 */
export function resolveAgent(slug: string, harnessRoot?: string): AgentDefinition | null {
  const agents = listAgents(harnessRoot);
  return agents.find((a) => a.slug === slug) ?? null;
}

/**
 * Create a timestamped run folder under agents/<slug>/runs/.
 * Uses ISO date with milliseconds + 4-char random suffix to prevent collisions.
 *
 * @returns Absolute path to the created run folder + the run ID
 */
export function createRunFolder(
  agentDef: AgentDefinition,
): { runDir: string; runId: string } {
  const now = new Date();
  const suffix = crypto.randomBytes(2).toString('hex'); // 4 hex chars
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  const runId = `${yyyy}-${mm}-${dd}T${hh}-${min}-${ss}-${ms}Z-${suffix}`;

  const runsDir = path.join(agentDef.dir, 'runs');
  const runDir = path.join(runsDir, runId);
  fs.mkdirSync(runDir, { recursive: true });

  // Freeze copies of prompt and instructions into the run folder
  fs.copyFileSync(agentDef.promptPath, path.join(runDir, 'prompt.md'));
  if (agentDef.instructionsPath) {
    fs.copyFileSync(agentDef.instructionsPath, path.join(runDir, 'instructions.md'));
  }
  if (agentDef.schemaPath) {
    fs.copyFileSync(agentDef.schemaPath, path.join(runDir, 'output-schema.json'));
  }

  // Create output directory
  fs.mkdirSync(path.join(runDir, 'output'), { recursive: true });

  return { runDir, runId };
}
