import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadSecretsToEnv } from '../../../packages/shared/src/config/loaders/secrets.loader.js';

/**
 * Unit tests for loadSecretsToEnv() - Secrets file loading with precedence.
 *
 * Per seven-phase pipeline (Phases 1-3):
 * 1. Load user secrets.env (lowest priority)
 * 2. Load project secrets.env (overrides user)
 * 3. Load CWD .env with dotenv-expand (highest priority)
 *
 * Tests use temporary directories to simulate user and project config dirs.
 */
describe('loadSecretsToEnv', () => {
  let tempDir: string;
  let userDir: string;
  let projectDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Explicitly clean up test-specific env vars that might leak
    // biome-ignore lint/performance/noDelete: delete is required for process.env (undefined becomes "undefined" string)
    delete process.env.USER_SECRET;
    // biome-ignore lint/performance/noDelete: delete is required for process.env
    delete process.env.PROJECT_KEY;
    // biome-ignore lint/performance/noDelete: delete is required for process.env
    delete process.env.API_KEY;
    // biome-ignore lint/performance/noDelete: delete is required for process.env
    delete process.env.USER_ONLY;
    // biome-ignore lint/performance/noDelete: delete is required for process.env
    delete process.env.PROJECT_ONLY;
    // biome-ignore lint/performance/noDelete: delete is required for process.env
    delete process.env.KEY;
    // biome-ignore lint/performance/noDelete: delete is required for process.env
    delete process.env.BASE_URL;
    // biome-ignore lint/performance/noDelete: delete is required for process.env
    delete process.env.FULL_URL;
    // biome-ignore lint/performance/noDelete: delete is required for process.env
    delete process.env.DERIVED;
    // biome-ignore lint/performance/noDelete: delete is required for process.env
    delete process.env.PRESET_KEY;
    // biome-ignore lint/performance/noDelete: delete is required for process.env
    delete process.env.MULTILINE;

    // Create temp directories
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secrets-loader-test-'));
    userDir = path.join(tempDir, 'user-config');
    projectDir = path.join(tempDir, 'project-config');
    fs.mkdirSync(userDir, { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });
  });

  afterEach(() => {
    // Properly restore original environment
    // Note: process.env = originalEnv doesn't work as expected in Node.js
    // We need to delete new keys and restore original keys

    // Delete keys that weren't in original
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }

    // Restore original values
    for (const [key, value] of Object.entries(originalEnv)) {
      process.env[key] = value;
    }

    // Clean up temp directories
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('basic loading', () => {
    it('should load user secrets.env to process.env', () => {
      /*
      Test Doc:
      - Why: User secrets are the base layer of the secrets hierarchy
      - Contract: Values in user secrets.env are added to process.env
      - Usage Notes: User secrets path is typically ~/.config/chainglass/secrets.env
      - Quality Contribution: Verifies basic dotenv loading works
      - Worked Example: USER_SECRET=value in file → process.env.USER_SECRET = 'value'
      */
      fs.writeFileSync(path.join(userDir, 'secrets.env'), 'USER_SECRET=user-secret-value\n');

      loadSecretsToEnv({
        userConfigDir: userDir,
        projectConfigDir: null,
      });

      expect(process.env.USER_SECRET).toBe('user-secret-value');
    });

    it('should load project secrets.env to process.env', () => {
      /*
      Test Doc:
      - Why: Project secrets override user secrets
      - Contract: Values in project secrets.env are added to process.env
      - Usage Notes: Project secrets path is typically .chainglass/secrets.env
      - Quality Contribution: Verifies project-level secrets work
      - Worked Example: PROJECT_KEY=value in file → process.env.PROJECT_KEY = 'value'
      */
      fs.writeFileSync(path.join(projectDir, 'secrets.env'), 'PROJECT_KEY=project-key-value\n');

      loadSecretsToEnv({
        userConfigDir: null,
        projectConfigDir: projectDir,
      });

      expect(process.env.PROJECT_KEY).toBe('project-key-value');
    });
  });

  describe('precedence (overrides)', () => {
    it('should override user secrets with project secrets', () => {
      /*
      Test Doc:
      - Why: Project-specific secrets should take precedence over user defaults
      - Contract: Project secrets.env values override user secrets.env values
      - Usage Notes: Same key in both → project value wins
      - Quality Contribution: Verifies correct precedence order
      - Worked Example: User API_KEY=user, Project API_KEY=project → process.env.API_KEY = 'project'
      */
      fs.writeFileSync(path.join(userDir, 'secrets.env'), 'API_KEY=user-api-key\n');
      fs.writeFileSync(path.join(projectDir, 'secrets.env'), 'API_KEY=project-api-key\n');

      loadSecretsToEnv({
        userConfigDir: userDir,
        projectConfigDir: projectDir,
      });

      expect(process.env.API_KEY).toBe('project-api-key');
    });

    it('should preserve user secrets not overridden by project', () => {
      /*
      Test Doc:
      - Why: Non-conflicting secrets from both sources should coexist
      - Contract: User secrets without project override remain in process.env
      - Usage Notes: Merge behavior, not replace
      - Quality Contribution: Verifies merge semantics
      - Worked Example: User has A=1, Project has B=2 → both present
      */
      fs.writeFileSync(path.join(userDir, 'secrets.env'), 'USER_ONLY=user-value\n');
      fs.writeFileSync(path.join(projectDir, 'secrets.env'), 'PROJECT_ONLY=project-value\n');

      loadSecretsToEnv({
        userConfigDir: userDir,
        projectConfigDir: projectDir,
      });

      expect(process.env.USER_ONLY).toBe('user-value');
      expect(process.env.PROJECT_ONLY).toBe('project-value');
    });
  });

  describe('missing files (graceful handling)', () => {
    it('should handle missing user secrets file gracefully', () => {
      /*
      Test Doc:
      - Why: User may not have created secrets.env yet
      - Contract: Missing user secrets.env does not throw; processing continues
      - Usage Notes: Optional file - absence is not an error
      - Quality Contribution: Ensures smooth first-run experience
      - Worked Example: No user secrets.env → no error, empty contribution
      */
      fs.writeFileSync(path.join(projectDir, 'secrets.env'), 'PROJECT_KEY=value\n');
      // userDir exists but no secrets.env file

      expect(() =>
        loadSecretsToEnv({
          userConfigDir: userDir,
          projectConfigDir: projectDir,
        })
      ).not.toThrow();

      expect(process.env.PROJECT_KEY).toBe('value');
    });

    it('should handle missing project secrets file gracefully', () => {
      /*
      Test Doc:
      - Why: Project may not use secrets.env
      - Contract: Missing project secrets.env does not throw; processing continues
      - Usage Notes: Optional file - absence is not an error
      - Quality Contribution: Allows projects without secrets
      - Worked Example: No project secrets.env → no error, uses user only
      */
      fs.writeFileSync(path.join(userDir, 'secrets.env'), 'USER_KEY=value\n');
      // projectDir exists but no secrets.env file

      expect(() =>
        loadSecretsToEnv({
          userConfigDir: userDir,
          projectConfigDir: projectDir,
        })
      ).not.toThrow();

      expect(process.env.USER_KEY).toBe('value');
    });

    it('should handle missing user config directory gracefully', () => {
      /*
      Test Doc:
      - Why: User config dir may not exist on fresh install
      - Contract: null userConfigDir does not throw
      - Usage Notes: Pass null to skip user secrets
      - Quality Contribution: Flexibility in config setup
      - Worked Example: userConfigDir=null → skip user secrets entirely
      */
      fs.writeFileSync(path.join(projectDir, 'secrets.env'), 'KEY=value\n');

      expect(() =>
        loadSecretsToEnv({
          userConfigDir: null,
          projectConfigDir: projectDir,
        })
      ).not.toThrow();

      expect(process.env.KEY).toBe('value');
    });

    it('should handle missing project config directory gracefully', () => {
      /*
      Test Doc:
      - Why: Project may not have .chainglass/ directory
      - Contract: null projectConfigDir does not throw
      - Usage Notes: Pass null to skip project secrets
      - Quality Contribution: Works outside project context
      - Worked Example: projectConfigDir=null → skip project secrets entirely
      */
      fs.writeFileSync(path.join(userDir, 'secrets.env'), 'KEY=value\n');

      expect(() =>
        loadSecretsToEnv({
          userConfigDir: userDir,
          projectConfigDir: null,
        })
      ).not.toThrow();

      expect(process.env.KEY).toBe('value');
    });

    it('should handle both directories missing gracefully', () => {
      /*
      Test Doc:
      - Why: Edge case - no secrets at all
      - Contract: Both null does not throw; process.env unchanged
      - Usage Notes: Legal configuration for minimal setup
      - Quality Contribution: Handles degenerate case
      - Worked Example: Both null → no-op, no error
      */
      expect(() =>
        loadSecretsToEnv({
          userConfigDir: null,
          projectConfigDir: null,
        })
      ).not.toThrow();
    });
  });

  describe('dotenv-expand support', () => {
    it('should expand ${VAR} references in secrets.env files', () => {
      /*
      Test Doc:
      - Why: Secrets may reference other env vars
      - Contract: ${VAR} in secrets.env is expanded from process.env
      - Usage Notes: Uses dotenv-expand under the hood
      - Quality Contribution: Enables secret composition
      - Worked Example: BASE=abc, FULL=${BASE}_123 → FULL='abc_123'
      */
      fs.writeFileSync(
        path.join(userDir, 'secrets.env'),
        'BASE_URL=https://api.example.com\nFULL_URL=${BASE_URL}/v1\n'
      );

      loadSecretsToEnv({
        userConfigDir: userDir,
        projectConfigDir: null,
      });

      expect(process.env.BASE_URL).toBe('https://api.example.com');
      expect(process.env.FULL_URL).toBe('https://api.example.com/v1');
    });

    it('should expand references from existing process.env', () => {
      /*
      Test Doc:
      - Why: Secrets may reference pre-existing env vars (e.g., PATH)
      - Contract: ${EXISTING} expands from process.env set before loading
      - Usage Notes: Allows referencing system env vars
      - Quality Contribution: Interoperability with system environment
      - Worked Example: process.env.HOME=/home/user, ${HOME}/dir → /home/user/dir
      */
      process.env.EXISTING_VAR = 'existing-value';
      fs.writeFileSync(path.join(userDir, 'secrets.env'), 'DERIVED=${EXISTING_VAR}-derived\n');

      loadSecretsToEnv({
        userConfigDir: userDir,
        projectConfigDir: null,
      });

      expect(process.env.DERIVED).toBe('existing-value-derived');
    });
  });

  describe('existing env vars', () => {
    it('should NOT override existing process.env values', () => {
      /*
      Test Doc:
      - Why: Pre-set env vars (e.g., from shell) should have highest priority
      - Contract: Existing process.env values are preserved, not overwritten
      - Usage Notes: dotenv convention - don't clobber existing values
      - Quality Contribution: Respects explicit environment configuration
      - Worked Example: process.env.KEY='shell', secrets.env KEY=file → keeps 'shell'
      */
      process.env.PRESET_KEY = 'preset-value';
      fs.writeFileSync(path.join(userDir, 'secrets.env'), 'PRESET_KEY=file-value\n');

      loadSecretsToEnv({
        userConfigDir: userDir,
        projectConfigDir: null,
      });

      expect(process.env.PRESET_KEY).toBe('preset-value');
    });
  });

  describe('multiline values', () => {
    it('should handle multiline values in secrets.env', () => {
      /*
      Test Doc:
      - Why: Some secrets (like private keys) span multiple lines
      - Contract: Quoted multiline values are loaded correctly
      - Usage Notes: Use double quotes and \n for multilines
      - Quality Contribution: Supports complex secret formats
      - Worked Example: PRIVATE_KEY="line1\nline2" → preserves newlines
      */
      fs.writeFileSync(path.join(userDir, 'secrets.env'), 'MULTILINE="line1\\nline2\\nline3"\n');

      loadSecretsToEnv({
        userConfigDir: userDir,
        projectConfigDir: null,
      });

      expect(process.env.MULTILINE).toBe('line1\nline2\nline3');
    });
  });
});
