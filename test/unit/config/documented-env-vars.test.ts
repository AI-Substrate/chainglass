import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChainglassConfigService } from '../../../packages/shared/src/config/chainglass-config.service.js';
import { parseEnvVars } from '../../../packages/shared/src/config/loaders/env.parser.js';
import { AgentConfigType } from '../../../packages/shared/src/config/schemas/agent.schema.js';
import { SampleConfigType } from '../../../packages/shared/src/config/schemas/sample.schema.js';

/**
 * Every CG_* variable the docs tell a user to set must load (B9).
 *
 * CG_ is shared by config overrides and plain process variables (CG_SERVER_PORT,
 * CG_REMOTE_VIEW__DAEMON_PORT). The env parser once rejected multi-word segments, so following
 * docs/how/remote-view.md crashed the web server's config load. This scans the documentation the
 * way a user reads it, so a newly documented name the loader rejects fails here.
 */

const ROOT = join(__dirname, '../../..');
const CG_NAME = /\bCG_[A-Z0-9_]*[A-Z0-9]\b/g;

/** User-facing docs: docs/ (not plan history), each app's .env.example, each package README. */
function documentationFiles(): string[] {
  const docs = readdirSync(join(ROOT, 'docs'), { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.md') && !path.startsWith('plans'))
    .map((path) => join(ROOT, 'docs', path));
  const examples = readdirSync(join(ROOT, 'apps')).map((app) =>
    join(ROOT, 'apps', app, '.env.example')
  );
  const readmes = readdirSync(join(ROOT, 'packages')).map((pkg) =>
    join(ROOT, 'packages', pkg, 'README.md')
  );
  return [...docs, ...examples, ...readmes];
}

function documentedNames(): Map<string, string> {
  const names = new Map<string, string>();
  for (const file of documentationFiles()) {
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue; // an app without .env.example, a package without README
    }
    for (const name of text.match(CG_NAME) ?? []) {
      if (!names.has(name)) names.set(name, relative(ROOT, file));
    }
  }
  return names;
}

describe('documented CG_* environment variables', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('CG_')) delete process.env[key];
    }
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const names = documentedNames();

  it('finds the names the remote-view and configuration docs document', () => {
    expect(names.has('CG_REMOTE_VIEW__DAEMON_PORT')).toBe(true);
    expect(names.has('CG_REMOTE_VIEW__ALLOWED_ORIGINS')).toBe(true);
    expect(names.has('CG_MYFEATURE__MAX_RETRIES')).toBe(true);
  });

  it.each([...names])('%s (documented in %s) parses', (name) => {
    process.env[name] = '60';
    expect(() => parseEnvVars()).not.toThrow();
  });

  // Overrides of registered sections are values their schemas validate (sample.timeout 1-300,
  // agent.timeout >= 1000); this is about every other CG_ name not breaking the load.
  it('config loads with every documented non-section name set at once', () => {
    const sections = [AgentConfigType.configPath, SampleConfigType.configPath];
    for (const name of names.keys()) {
      const section = name.slice(3).split('__')[0].toLowerCase();
      if (!sections.includes(section)) process.env[name] = 'x';
    }
    expect(Object.keys(process.env)).toContain('CG_REMOTE_VIEW__DAEMON_PORT');
    const service = new ChainglassConfigService({ userConfigDir: null, projectConfigDir: null });
    expect(() => service.load()).not.toThrow();
  });
});
