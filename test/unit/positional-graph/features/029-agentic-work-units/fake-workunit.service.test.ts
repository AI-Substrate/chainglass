/**
 * FakeWorkUnitService Tests
 *
 * Verifies the test double works correctly for Phase 3/4 testing.
 *
 * @packageDocumentation
 */

import type { WorkspaceContext } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

import { FakeWorkUnitService } from '../../../../../packages/positional-graph/src/features/029-agentic-work-units/fake-workunit.service.js';
import { WORKUNIT_ERROR_CODES } from '../../../../../packages/positional-graph/src/features/029-agentic-work-units/workunit-errors.js';
import type {
  AgenticWorkUnitInstance,
  CodeUnitInstance,
  UserInputUnitInstance,
} from '../../../../../packages/positional-graph/src/features/029-agentic-work-units/workunit.classes.js';

describe('FakeWorkUnitService', () => {
  let fake: FakeWorkUnitService;
  let ctx: WorkspaceContext;

  beforeEach(() => {
    fake = new FakeWorkUnitService();
    ctx = {
      workspaceSlug: 'test-workspace',
      workspaceName: 'Test Workspace',
      workspacePath: '/home/user/project',
      worktreePath: '/home/user/project',
      worktreeSlug: 'main',
      worktreeName: 'main',
      isMainWorktree: true,
    };
  });

  describe('list()', () => {
    it('should return empty list when no units registered', async () => {
      const result = await fake.list(ctx);

      expect(result.units).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it('should return registered units', async () => {
      fake.addUnit({
        type: 'agent',
        slug: 'test-agent',
        version: '1.0.0',
        promptContent: 'Hello',
        agent: { prompt_template: 'prompts/main.md' },
      });

      fake.addUnit({
        type: 'code',
        slug: 'test-code',
        version: '2.0.0',
        scriptContent: '#!/bin/bash',
        code: { script: 'scripts/main.sh' },
      });

      const result = await fake.list(ctx);

      expect(result.units).toHaveLength(2);
      expect(result.units).toContainEqual({
        slug: 'test-agent',
        type: 'agent',
        version: '1.0.0',
      });
      expect(result.units).toContainEqual({
        slug: 'test-code',
        type: 'code',
        version: '2.0.0',
      });
    });

    it('should track list calls', async () => {
      await fake.list(ctx);
      await fake.list(ctx);

      const calls = fake.getListCalls();
      expect(calls).toHaveLength(2);
      expect(calls[0]).toBe(ctx);
    });
  });

  describe('load()', () => {
    it('should return E180 for unregistered unit', async () => {
      const result = await fake.load(ctx, 'nonexistent');

      expect(result.unit).toBeUndefined();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(WORKUNIT_ERROR_CODES.E180);
    });

    it('should load registered agent unit', async () => {
      fake.addUnit({
        type: 'agent',
        slug: 'test-agent',
        version: '1.0.0',
        promptContent: 'You are helpful.',
        agent: { prompt_template: 'prompts/main.md' },
      });

      const result = await fake.load(ctx, 'test-agent');

      expect(result.errors).toHaveLength(0);
      expect(result.unit).toBeDefined();
      expect(result.unit?.type).toBe('agent');
      expect(result.unit?.slug).toBe('test-agent');
    });

    it('should load registered code unit', async () => {
      fake.addUnit({
        type: 'code',
        slug: 'test-code',
        version: '1.0.0',
        scriptContent: '#!/bin/bash',
        code: { script: 'scripts/main.sh' },
      });

      const result = await fake.load(ctx, 'test-code');

      expect(result.errors).toHaveLength(0);
      expect(result.unit).toBeDefined();
      expect(result.unit?.type).toBe('code');
    });

    it('should load registered user-input unit', async () => {
      fake.addUnit({
        type: 'user-input',
        slug: 'test-input',
        version: '1.0.0',
        user_input: { question_type: 'text', prompt: 'Enter value:' },
      });

      const result = await fake.load(ctx, 'test-input');

      expect(result.errors).toHaveLength(0);
      expect(result.unit).toBeDefined();
      expect(result.unit?.type).toBe('user-input');
    });

    it('should return preset errors', async () => {
      fake.addUnit({
        type: 'agent',
        slug: 'error-unit',
        version: '1.0.0',
        promptContent: 'Will fail',
        agent: { prompt_template: 'prompts/main.md' },
      });

      fake.setErrors('error-unit', [{ code: 'E999', message: 'Custom error', action: 'Fix it' }]);

      const result = await fake.load(ctx, 'error-unit');

      expect(result.unit).toBeUndefined();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E999');
    });

    it('should track load calls', async () => {
      fake.addUnit({
        type: 'agent',
        slug: 'test-agent',
        version: '1.0.0',
        promptContent: 'Hello',
        agent: { prompt_template: 'prompts/main.md' },
      });

      await fake.load(ctx, 'test-agent');
      await fake.load(ctx, 'other');

      const calls = fake.getLoadCalls();
      expect(calls).toHaveLength(2);
      expect(calls[0]).toEqual({ ctx, slug: 'test-agent' });
      expect(calls[1]).toEqual({ ctx, slug: 'other' });
    });
  });

  describe('validate()', () => {
    it('should return valid=false for unregistered unit', async () => {
      const result = await fake.validate(ctx, 'nonexistent');

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(WORKUNIT_ERROR_CODES.E180);
    });

    it('should return valid=true for registered unit', async () => {
      fake.addUnit({
        type: 'agent',
        slug: 'test-agent',
        version: '1.0.0',
        promptContent: 'Hello',
        agent: { prompt_template: 'prompts/main.md' },
      });

      const result = await fake.validate(ctx, 'test-agent');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('AgenticWorkUnitInstance.getPrompt()', () => {
    it('should return prompt content from config', async () => {
      fake.addUnit({
        type: 'agent',
        slug: 'test-agent',
        version: '1.0.0',
        promptContent: 'You are a helpful assistant.',
        agent: { prompt_template: 'prompts/main.md' },
      });

      const result = await fake.load(ctx, 'test-agent');
      const unit = result.unit as AgenticWorkUnitInstance;

      const prompt = await unit.getPrompt(ctx);
      expect(prompt).toBe('You are a helpful assistant.');
    });

    it('should return overridden content via setTemplateContent()', async () => {
      fake.addUnit({
        type: 'agent',
        slug: 'test-agent',
        version: '1.0.0',
        promptContent: 'Original prompt',
        agent: { prompt_template: 'prompts/main.md' },
      });

      fake.setTemplateContent('test-agent', 'Overridden prompt');

      const result = await fake.load(ctx, 'test-agent');
      const unit = result.unit as AgenticWorkUnitInstance;

      const prompt = await unit.getPrompt(ctx);
      expect(prompt).toBe('Overridden prompt');
    });
  });

  describe('AgenticWorkUnitInstance.setPrompt()', () => {
    it('should update prompt content', async () => {
      fake.addUnit({
        type: 'agent',
        slug: 'test-agent',
        version: '1.0.0',
        promptContent: 'Original prompt',
        agent: { prompt_template: 'prompts/main.md' },
      });

      const result = await fake.load(ctx, 'test-agent');
      const unit = result.unit as AgenticWorkUnitInstance;

      await unit.setPrompt(ctx, 'Updated prompt');

      const newPrompt = await unit.getPrompt(ctx);
      expect(newPrompt).toBe('Updated prompt');
    });
  });

  describe('CodeUnitInstance.getScript()', () => {
    it('should return script content from config', async () => {
      fake.addUnit({
        type: 'code',
        slug: 'test-code',
        version: '1.0.0',
        scriptContent: '#!/bin/bash\necho "Hello"',
        code: { script: 'scripts/main.sh' },
      });

      const result = await fake.load(ctx, 'test-code');
      const unit = result.unit as CodeUnitInstance;

      const script = await unit.getScript(ctx);
      expect(script).toBe('#!/bin/bash\necho "Hello"');
    });

    it('should return overridden content via setTemplateContent()', async () => {
      fake.addUnit({
        type: 'code',
        slug: 'test-code',
        version: '1.0.0',
        scriptContent: 'Original script',
        code: { script: 'scripts/main.sh' },
      });

      fake.setTemplateContent('test-code', 'Overridden script');

      const result = await fake.load(ctx, 'test-code');
      const unit = result.unit as CodeUnitInstance;

      const script = await unit.getScript(ctx);
      expect(script).toBe('Overridden script');
    });
  });

  describe('CodeUnitInstance.setScript()', () => {
    it('should update script content', async () => {
      fake.addUnit({
        type: 'code',
        slug: 'test-code',
        version: '1.0.0',
        scriptContent: 'Original script',
        code: { script: 'scripts/main.sh' },
      });

      const result = await fake.load(ctx, 'test-code');
      const unit = result.unit as CodeUnitInstance;

      await unit.setScript(ctx, 'Updated script');

      const newScript = await unit.getScript(ctx);
      expect(newScript).toBe('Updated script');
    });
  });

  describe('UserInputUnitInstance', () => {
    it('should not have getPrompt or getScript methods', async () => {
      fake.addUnit({
        type: 'user-input',
        slug: 'test-input',
        version: '1.0.0',
        user_input: { question_type: 'text', prompt: 'Enter value:' },
      });

      const result = await fake.load(ctx, 'test-input');
      const unit = result.unit as UserInputUnitInstance;

      expect('getPrompt' in unit).toBe(false);
      expect('getScript' in unit).toBe(false);
    });
  });

  describe('reset()', () => {
    it('should clear all state', async () => {
      fake.addUnit({
        type: 'agent',
        slug: 'test-agent',
        version: '1.0.0',
        promptContent: 'Hello',
        agent: { prompt_template: 'prompts/main.md' },
      });
      await fake.load(ctx, 'test-agent');

      fake.reset();

      const result = await fake.list(ctx);
      expect(result.units).toHaveLength(0);
      expect(fake.getLoadCalls()).toHaveLength(0);
    });
  });

  describe('removeUnit()', () => {
    it('should remove a unit', async () => {
      fake.addUnit({
        type: 'agent',
        slug: 'test-agent',
        version: '1.0.0',
        promptContent: 'Hello',
        agent: { prompt_template: 'prompts/main.md' },
      });

      fake.removeUnit('test-agent');

      const result = await fake.load(ctx, 'test-agent');
      expect(result.errors[0].code).toBe(WORKUNIT_ERROR_CODES.E180);
    });
  });
});
