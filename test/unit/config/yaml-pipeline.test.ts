import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { deepMerge } from '../../../packages/shared/src/config/loaders/deep-merge.js';
import { loadYamlConfig } from '../../../packages/shared/src/config/loaders/yaml.loader.js';

/**
 * Unit tests for YAML loading pipeline - user→project merge.
 *
 * Per seven-phase pipeline (Phase 4):
 * - Load user config.yaml
 * - Load project config.yaml
 * - Deep merge (project overrides user)
 *
 * These tests verify that loadYamlConfig and deepMerge work together
 * as expected in the ChainglassConfigService pipeline.
 */
describe('YAML loading pipeline', () => {
  let tempDir: string;
  let userDir: string;
  let projectDir: string;

  beforeEach(() => {
    // Create temp directories
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaml-pipeline-test-'));
    userDir = path.join(tempDir, 'user-config');
    projectDir = path.join(tempDir, 'project-config');
    fs.mkdirSync(userDir, { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up temp directories
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('single source loading', () => {
    it('should load user config when only user config exists', () => {
      /*
      Test Doc:
      - Why: Common case for global user preferences
      - Contract: User config.yaml values are returned when no project config
      - Usage Notes: User config path is typically ~/.config/chainglass/config.yaml
      - Quality Contribution: Verifies single-source loading
      - Worked Example: User config { sample: { timeout: 30 } } → same output
      */
      fs.writeFileSync(
        path.join(userDir, 'config.yaml'),
        'sample:\n  enabled: true\n  timeout: 30\n  name: user-config\n'
      );

      const userConfig = loadYamlConfig(path.join(userDir, 'config.yaml'));
      const projectConfig = loadYamlConfig(path.join(projectDir, 'config.yaml')); // Missing
      const merged = deepMerge(userConfig, projectConfig);

      expect(merged).toEqual({
        sample: {
          enabled: true,
          timeout: 30,
          name: 'user-config',
        },
      });
    });

    it('should load project config when only project config exists', () => {
      /*
      Test Doc:
      - Why: Some users may only have project config
      - Contract: Project config.yaml values are returned when no user config
      - Usage Notes: Project config path is typically .chainglass/config.yaml
      - Quality Contribution: Verifies single-source loading
      - Worked Example: Project config { sample: { timeout: 60 } } → same output
      */
      fs.writeFileSync(
        path.join(projectDir, 'config.yaml'),
        'sample:\n  enabled: false\n  timeout: 60\n  name: project-config\n'
      );

      const userConfig = loadYamlConfig(path.join(userDir, 'config.yaml')); // Missing
      const projectConfig = loadYamlConfig(path.join(projectDir, 'config.yaml'));
      const merged = deepMerge(userConfig, projectConfig);

      expect(merged).toEqual({
        sample: {
          enabled: false,
          timeout: 60,
          name: 'project-config',
        },
      });
    });
  });

  describe('merge precedence', () => {
    it('should override user config with project config', () => {
      /*
      Test Doc:
      - Why: Project-specific settings should override user defaults
      - Contract: Project values override user values for same keys
      - Usage Notes: deepMerge(user, project) gives project priority
      - Quality Contribution: Verifies correct precedence order
      - Worked Example: User timeout=30, Project timeout=60 → timeout=60
      */
      fs.writeFileSync(
        path.join(userDir, 'config.yaml'),
        'sample:\n  enabled: true\n  timeout: 30\n  name: user-config\n'
      );
      fs.writeFileSync(path.join(projectDir, 'config.yaml'), 'sample:\n  timeout: 60\n');

      const userConfig = loadYamlConfig(path.join(userDir, 'config.yaml'));
      const projectConfig = loadYamlConfig(path.join(projectDir, 'config.yaml'));
      const merged = deepMerge(userConfig, projectConfig);

      expect(merged).toEqual({
        sample: {
          enabled: true, // From user (not in project)
          timeout: 60, // From project (overrides user)
          name: 'user-config', // From user (not in project)
        },
      });
    });

    it('should preserve user config values not in project config', () => {
      /*
      Test Doc:
      - Why: Non-conflicting values from user should remain
      - Contract: User values without project override are preserved
      - Usage Notes: Merge behavior, not replace
      - Quality Contribution: Verifies merge semantics
      - Worked Example: User has extra fields → preserved in output
      */
      fs.writeFileSync(
        path.join(userDir, 'config.yaml'),
        'sample:\n  enabled: true\n  timeout: 30\n  name: user-only\n  debug: true\n'
      );
      fs.writeFileSync(path.join(projectDir, 'config.yaml'), 'sample:\n  name: project\n');

      const userConfig = loadYamlConfig(path.join(userDir, 'config.yaml'));
      const projectConfig = loadYamlConfig(path.join(projectDir, 'config.yaml'));
      const merged = deepMerge(userConfig, projectConfig);

      expect(merged.sample.debug).toBe(true);
      expect(merged.sample.timeout).toBe(30);
      expect(merged.sample.name).toBe('project');
    });

    it('should add project-only sections to merged config', () => {
      /*
      Test Doc:
      - Why: Project may define additional config sections
      - Contract: Sections only in project config are added to merged output
      - Usage Notes: Supports project-specific features
      - Quality Contribution: Verifies additive merge for new sections
      - Worked Example: Project has 'experimental' section → appears in merged
      */
      fs.writeFileSync(path.join(userDir, 'config.yaml'), 'sample:\n  timeout: 30\n');
      fs.writeFileSync(
        path.join(projectDir, 'config.yaml'),
        'sample:\n  timeout: 60\nexperimental:\n  feature_x: true\n'
      );

      const userConfig = loadYamlConfig(path.join(userDir, 'config.yaml'));
      const projectConfig = loadYamlConfig(path.join(projectDir, 'config.yaml'));
      const merged = deepMerge(userConfig, projectConfig);

      expect(merged.sample.timeout).toBe(60);
      expect(merged.experimental).toEqual({ feature_x: true });
    });
  });

  describe('missing files', () => {
    it('should return empty object for missing config file', () => {
      /*
      Test Doc:
      - Why: Missing config is valid - use defaults
      - Contract: loadYamlConfig() returns {} for missing file
      - Usage Notes: Merge with {} is identity operation
      - Quality Contribution: Verifies graceful handling of missing files
      - Worked Example: Missing file → {} → merge works correctly
      */
      const config = loadYamlConfig(path.join(userDir, 'nonexistent.yaml'));

      expect(config).toEqual({});
    });

    it('should work when both configs are missing', () => {
      /*
      Test Doc:
      - Why: Edge case - no YAML config at all
      - Contract: Merging two empty objects gives empty object
      - Usage Notes: Zod defaults will provide values in this case
      - Quality Contribution: Handles degenerate case
      - Worked Example: No configs → {} → schema defaults apply
      */
      const userConfig = loadYamlConfig(path.join(userDir, 'config.yaml'));
      const projectConfig = loadYamlConfig(path.join(projectDir, 'config.yaml'));
      const merged = deepMerge(userConfig, projectConfig);

      expect(merged).toEqual({});
    });
  });

  describe('complex nested structures', () => {
    it('should deep merge nested objects', () => {
      /*
      Test Doc:
      - Why: Config can have arbitrarily deep nesting
      - Contract: Nested objects are recursively merged
      - Usage Notes: deepMerge handles any depth
      - Quality Contribution: Verifies recursive merge behavior
      - Worked Example: User a.b.c=1, Project a.b.d=2 → a.b has both
      */
      fs.writeFileSync(
        path.join(userDir, 'config.yaml'),
        'level1:\n  level2:\n    level3:\n      user_value: true\n'
      );
      fs.writeFileSync(
        path.join(projectDir, 'config.yaml'),
        'level1:\n  level2:\n    level3:\n      project_value: true\n'
      );

      const userConfig = loadYamlConfig(path.join(userDir, 'config.yaml'));
      const projectConfig = loadYamlConfig(path.join(projectDir, 'config.yaml'));
      const merged = deepMerge(userConfig, projectConfig);

      expect(merged).toEqual({
        level1: {
          level2: {
            level3: {
              user_value: true,
              project_value: true,
            },
          },
        },
      });
    });

    it('should replace arrays entirely (DYK-08)', () => {
      /*
      Test Doc:
      - Why: Array merge semantics are ambiguous (DYK-08 decision)
      - Contract: Project array completely replaces user array
      - Usage Notes: This is deliberate - use explicit merge if needed
      - Quality Contribution: Verifies DYK-08 array replacement behavior
      - Worked Example: User plugins=[a,b], Project plugins=[c] → plugins=[c]
      */
      fs.writeFileSync(path.join(userDir, 'config.yaml'), 'plugins:\n  - plugin-a\n  - plugin-b\n');
      fs.writeFileSync(path.join(projectDir, 'config.yaml'), 'plugins:\n  - plugin-c\n');

      const userConfig = loadYamlConfig(path.join(userDir, 'config.yaml'));
      const projectConfig = loadYamlConfig(path.join(projectDir, 'config.yaml'));
      const merged = deepMerge(userConfig, projectConfig);

      expect(merged.plugins).toEqual(['plugin-c']);
    });
  });

  describe('placeholder preservation', () => {
    it('should preserve ${VAR} placeholders in merged config', () => {
      /*
      Test Doc:
      - Why: Placeholders must survive YAML loading and merge
      - Contract: ${VAR} strings are preserved as-is through the pipeline
      - Usage Notes: Expansion happens later in the pipeline
      - Quality Contribution: Verifies placeholder handling in YAML
      - Worked Example: api_key: ${OPENAI_API_KEY} → preserved in output
      */
      fs.writeFileSync(
        path.join(userDir, 'config.yaml'),
        'sample:\n  api_key: ${OPENAI_API_KEY}\n'
      );

      const userConfig = loadYamlConfig(path.join(userDir, 'config.yaml'));
      const projectConfig = loadYamlConfig(path.join(projectDir, 'config.yaml'));
      const merged = deepMerge(userConfig, projectConfig);

      expect(merged.sample.api_key).toBe('${OPENAI_API_KEY}');
    });
  });
});
