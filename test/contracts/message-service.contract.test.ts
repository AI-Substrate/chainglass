import { FakeFileSystem } from '@chainglass/shared';
import {
  FakeMessageService,
  FakeSchemaValidator,
  type IMessageService,
  MessageErrorCodes,
  MessageService,
  type WfPhaseState,
} from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Contract tests for IMessageService implementations.
 *
 * Per Critical Discovery 08: Contract tests prevent fake drift by ensuring
 * both MessageService and FakeMessageService pass the same behavioral tests.
 *
 * These tests verify the subset of behaviors that both implementations must satisfy.
 * The fake has additional test helpers that aren't part of the contract.
 */

/**
 * Test context for message service contract tests.
 */
interface MessageServiceTestContext {
  /** The message service implementation to test */
  service: IMessageService;
  /** Setup function called before each test */
  setup: () => Promise<void>;
  /** Cleanup function called after each test */
  cleanup: () => Promise<void>;
  /** Description of the implementation */
  name: string;
}

/**
 * Contract tests that run against both MessageService and FakeMessageService.
 */
function messageServiceContractTests(createContext: () => MessageServiceTestContext) {
  let ctx: MessageServiceTestContext;

  const phase = 'process';
  const runDir = '/runs/run-contract-test-001';

  beforeEach(async () => {
    ctx = createContext();
    await ctx.setup();
  });

  describe(`${createContext().name} implements IMessageService contract`, () => {
    describe('create() return type', () => {
      it('should return a MessageCreateResult object', async () => {
        /*
        Test Doc:
        - Why: Contract requires consistent return type
        - Contract: create() returns object with phase, runDir, messageId, filePath, errors
        - Usage Notes: All implementations must return this shape
        - Quality Contribution: Ensures type consistency
        */
        const result = await ctx.service.create(phase, runDir, 'free_text', {
          subject: 'Contract test',
          body: 'Test body',
        });

        // Must have all required properties
        expect(result).toHaveProperty('errors');
        expect(result).toHaveProperty('phase');
        expect(result).toHaveProperty('runDir');
        expect(result).toHaveProperty('messageId');
        expect(result).toHaveProperty('filePath');

        // Types must be correct
        expect(Array.isArray(result.errors)).toBe(true);
        expect(typeof result.phase).toBe('string');
        expect(typeof result.runDir).toBe('string');
        expect(typeof result.messageId).toBe('string');
        expect(typeof result.filePath).toBe('string');
      });

      it('should return phase name in result', async () => {
        /*
        Test Doc:
        - Why: Result must identify which phase contains the message
        - Contract: Result contains phase name
        */
        const result = await ctx.service.create(phase, runDir, 'free_text', {
          subject: 'Test',
          body: 'Body',
        });

        expect(result.phase).toBe(phase);
      });

      it('should return sequential message IDs starting at 001', async () => {
        /*
        Test Doc:
        - Why: IDs must be 3-digit sequential strings
        - Contract: First message gets ID '001'
        */
        const result = await ctx.service.create(phase, runDir, 'free_text', {
          subject: 'Test',
          body: 'Body',
        });

        expect(result.messageId).toBe('001');
      });
    });

    describe('create() success behavior', () => {
      it('should return empty errors array on success', async () => {
        /*
        Test Doc:
        - Why: Contract requires errors.length === 0 indicates success
        - Contract: Success means empty errors array
        */
        const result = await ctx.service.create(phase, runDir, 'free_text', {
          subject: 'Test',
          body: 'Body',
        });

        expect(result.errors).toEqual([]);
      });

      it('should support all four message types', async () => {
        /*
        Test Doc:
        - Why: All implementations must support all message types
        - Contract: single_choice, multi_choice, free_text, confirm all work
        */
        const types = ['single_choice', 'multi_choice', 'free_text', 'confirm'] as const;
        for (const type of types) {
          const content =
            type === 'single_choice' || type === 'multi_choice'
              ? { subject: 'Test', body: 'Body', options: [{ key: 'A', label: 'A' }] }
              : { subject: 'Test', body: 'Body' };
          const result = await ctx.service.create(phase, runDir, type, content);
          expect(result.errors).toEqual([]);
        }
      });
    });

    describe('answer() return type', () => {
      it('should return a MessageAnswerResult object', async () => {
        /*
        Test Doc:
        - Why: Contract requires consistent return type
        - Contract: answer() returns object with phase, runDir, messageId, answer, errors
        */
        // First create a message
        await ctx.service.create(phase, runDir, 'free_text', {
          subject: 'Test',
          body: 'Body',
        });

        const result = await ctx.service.answer(phase, runDir, '001', { text: 'response' });

        // Must have all required properties
        expect(result).toHaveProperty('errors');
        expect(result).toHaveProperty('phase');
        expect(result).toHaveProperty('runDir');
        expect(result).toHaveProperty('messageId');
        expect(result).toHaveProperty('answer');

        // Types must be correct
        expect(Array.isArray(result.errors)).toBe(true);
        expect(typeof result.phase).toBe('string');
        expect(typeof result.messageId).toBe('string');
      });

      it('should return answered_at timestamp on success', async () => {
        /*
        Test Doc:
        - Why: Answer must have timestamp
        - Contract: answer.answered_at is ISO timestamp string
        */
        await ctx.service.create(phase, runDir, 'free_text', {
          subject: 'Test',
          body: 'Body',
        });

        const result = await ctx.service.answer(phase, runDir, '001', { text: 'response' });

        expect(result.errors).toEqual([]);
        expect(result.answer).not.toBeNull();
        expect(result.answer?.answered_at).toBeDefined();
        expect(typeof result.answer?.answered_at).toBe('string');
      });
    });

    describe('answer() error handling', () => {
      it('should return E060 for non-existent message ID', async () => {
        /*
        Test Doc:
        - Why: Both implementations must handle missing messages
        - Contract: E060 MESSAGE_NOT_FOUND for non-existent ID
        */
        const result = await ctx.service.answer(phase, runDir, '999', { text: 'response' });

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe(MessageErrorCodes.MESSAGE_NOT_FOUND);
        expect(result.answer).toBeNull();
      });
    });

    describe('list() return type', () => {
      it('should return a MessageListResult object', async () => {
        /*
        Test Doc:
        - Why: Contract requires consistent return type
        - Contract: list() returns object with phase, runDir, messages, count, errors
        */
        const result = await ctx.service.list(phase, runDir);

        // Must have all required properties
        expect(result).toHaveProperty('errors');
        expect(result).toHaveProperty('phase');
        expect(result).toHaveProperty('runDir');
        expect(result).toHaveProperty('messages');
        expect(result).toHaveProperty('count');

        // Types must be correct
        expect(Array.isArray(result.errors)).toBe(true);
        expect(typeof result.phase).toBe('string');
        expect(Array.isArray(result.messages)).toBe(true);
        expect(typeof result.count).toBe('number');
      });

      it('should return count matching messages length', async () => {
        /*
        Test Doc:
        - Why: count field must match messages array length
        - Contract: count === messages.length
        */
        const result = await ctx.service.list(phase, runDir);

        expect(result.count).toBe(result.messages.length);
      });
    });

    describe('read() return type', () => {
      it('should return a MessageReadResult object', async () => {
        /*
        Test Doc:
        - Why: Contract requires consistent return type
        - Contract: read() returns object with phase, runDir, message, errors
        */
        // Create a message first
        await ctx.service.create(phase, runDir, 'free_text', {
          subject: 'Test',
          body: 'Body',
        });

        const result = await ctx.service.read(phase, runDir, '001');

        // Must have all required properties
        expect(result).toHaveProperty('errors');
        expect(result).toHaveProperty('phase');
        expect(result).toHaveProperty('runDir');
        expect(result).toHaveProperty('message');

        // Types must be correct
        expect(Array.isArray(result.errors)).toBe(true);
        expect(typeof result.phase).toBe('string');
      });

      it('should return full message object on success', async () => {
        /*
        Test Doc:
        - Why: Read returns full message content
        - Contract: message object has id, type, from, created_at at minimum
        - Note: Content (subject, body) verified only for real service - fake uses auto-generated
        */
        await ctx.service.create(phase, runDir, 'free_text', {
          subject: 'Test subject',
          body: 'Test body',
        });

        const result = await ctx.service.read(phase, runDir, '001');

        expect(result.errors).toEqual([]);
        expect(result.message).not.toBeNull();
        expect(result.message?.id).toBe('001');
        expect(result.message?.type).toBe('free_text');
        // Subject and body are verified only for real service
        // Fake returns auto-generated content unless preset
        expect(typeof result.message?.subject).toBe('string');
        expect(typeof result.message?.body).toBe('string');
      });
    });

    describe('read() error handling', () => {
      it('should return E060 for non-existent message ID', async () => {
        /*
        Test Doc:
        - Why: Both implementations must handle missing messages
        - Contract: E060 MESSAGE_NOT_FOUND for non-existent ID
        */
        const result = await ctx.service.read(phase, runDir, '999');

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe(MessageErrorCodes.MESSAGE_NOT_FOUND);
        expect(result.message).toBeNull();
      });
    });
  });
}

// ==================== MessageService Context ====================

function createMessageServiceContext(): MessageServiceTestContext {
  const fs = new FakeFileSystem();
  const schemaValidator = new FakeSchemaValidator();
  const service = new MessageService(fs, schemaValidator);

  const phase = 'process';
  const runDir = '/runs/run-contract-test-001';
  const messagesDir = `${runDir}/phases/${phase}/run/messages`;
  const wfDataDir = `${runDir}/phases/${phase}/run/wf-data`;

  return {
    name: 'MessageService',
    service,
    setup: async () => {
      // Reset fakes
      fs.reset();
      schemaValidator.reset();

      // Set up phase directories
      fs.setDir(messagesDir);
      fs.setDir(wfDataDir);

      // Create wf-phase.json with initial status
      const wfPhaseState: WfPhaseState = {
        phase,
        state: 'active',
        facilitator: 'agent',
        status: [{ timestamp: '2026-01-21T10:00:00Z', from: 'orchestrator', action: 'handover' }],
      };
      fs.setFile(`${wfDataDir}/wf-phase.json`, JSON.stringify(wfPhaseState, null, 2));

      // Configure schema validator to pass
      schemaValidator.setDefaultResult({ valid: true, errors: [] });
    },
    cleanup: async () => {
      fs.reset();
    },
  };
}

// ==================== FakeMessageService Context ====================

function createFakeMessageServiceContext(): MessageServiceTestContext {
  const service = new FakeMessageService();

  const phase = 'process';
  const runDir = '/runs/run-contract-test-001';

  return {
    name: 'FakeMessageService',
    service,
    setup: async () => {
      service.reset();

      // Configure fake to return E060 for non-existent message IDs
      service.setAnswerResult(
        phase,
        '999',
        FakeMessageService.answerErrorResult(
          phase,
          runDir,
          '999',
          MessageErrorCodes.MESSAGE_NOT_FOUND,
          'Message not found: 999',
          "Verify message ID '999' exists"
        )
      );

      service.setReadResult(
        phase,
        '999',
        FakeMessageService.readErrorResult(
          phase,
          runDir,
          MessageErrorCodes.MESSAGE_NOT_FOUND,
          'Message not found: 999',
          "Verify message ID '999' exists"
        )
      );
    },
    cleanup: async () => {
      service.reset();
    },
  };
}

// ==================== Run Contract Tests ====================

describe('MessageService Contract Tests', () => {
  messageServiceContractTests(createMessageServiceContext);
});

describe('FakeMessageService Contract Tests', () => {
  messageServiceContractTests(createFakeMessageServiceContext);
});
