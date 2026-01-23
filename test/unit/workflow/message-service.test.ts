import { FakeFileSystem } from '@chainglass/shared';
import {
  FakeSchemaValidator,
  type IMessageService,
  MessageErrorCodes,
  type MessageContent,
  type WfPhaseState,
  MESSAGE_SCHEMA,
  MessageService,
} from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Tests for MessageService.
 *
 * Per Subtask 001: Message CLI Commands - Full TDD approach.
 * These tests define the expected behavior of MessageService methods.
 *
 * Test fixture: Uses FakeFileSystem, FakeSchemaValidator
 * to simulate run directories without disk I/O.
 */

// Sample wf-phase.json (status log)
const createWfPhaseState = (
  phaseName: string,
  statusEntries: WfPhaseState['status'] = []
): WfPhaseState => ({
  phase: phaseName,
  state: 'active',
  facilitator: 'agent',
  status: statusEntries,
});

describe('MessageService', () => {
  let fs: FakeFileSystem;
  let schemaValidator: FakeSchemaValidator;
  let service: IMessageService;

  const runDir = '/runs/run-test-001';
  const phase = 'process';
  const messagesDir = `${runDir}/phases/${phase}/run/messages`;
  const wfDataDir = `${runDir}/phases/${phase}/run/wf-data`;

  // Helper to set up a phase with messages directory
  function setupPhase(existingMessages: string[] = []): void {
    fs.setDir(messagesDir);
    fs.setDir(wfDataDir);

    // Create wf-phase.json with initial status
    const wfPhaseState = createWfPhaseState(phase, [
      { timestamp: '2026-01-21T10:00:00Z', from: 'orchestrator', action: 'handover' },
      { timestamp: '2026-01-21T10:00:01Z', from: 'agent', action: 'accept' },
    ]);
    fs.setFile(`${wfDataDir}/wf-phase.json`, JSON.stringify(wfPhaseState, null, 2));

    // Add existing messages
    for (const msgId of existingMessages) {
      fs.setFile(
        `${messagesDir}/m-${msgId}.json`,
        JSON.stringify({
          id: msgId,
          created_at: '2026-01-21T10:00:00Z',
          from: 'agent',
          type: 'free_text',
          subject: `Test message ${msgId}`,
          body: 'Test body',
        })
      );
    }
  }

  beforeEach(() => {
    fs = new FakeFileSystem();
    schemaValidator = new FakeSchemaValidator();

    // Configure schema validator to pass by default
    schemaValidator.setDefaultResult({ valid: true, errors: [] });

    // Instantiate MessageService
    service = new MessageService(fs, schemaValidator);
  });

  describe('create()', () => {
    describe('happy path', () => {
      it('should create message and return MessageCreateResult with ID 001', async () => {
        /*
        Test Doc:
        - Why: Basic create workflow must work for agent to ask questions
        - Contract: create() assigns sequential ID, writes m-{id}.json, returns result
        - Usage Notes: First message gets ID '001'
        - Quality Contribution: Ensures basic create functionality works
        - Worked Example: create('process', runDir, 'multi_choice', content) → { messageId: '001' }
        */
        setupPhase();

        const content: MessageContent = {
          subject: 'Output format selection',
          body: 'How should I structure the output?',
          options: [
            { key: 'A', label: 'Summary only' },
            { key: 'B', label: 'Detailed only' },
            { key: 'C', label: 'Both' },
          ],
        };

        const result = await service.create(phase, runDir, 'multi_choice', content);
        expect(result.errors).toEqual([]);
        expect(result.messageId).toBe('001');
        expect(result.phase).toBe(phase);
        expect(result.filePath).toContain('m-001.json');

        // Verify file was created
        expect(await fs.exists(`${messagesDir}/m-001.json`)).toBe(true);

        // Verify status log was updated with question action
        const wfPhaseContent = await fs.readFile(`${wfDataDir}/wf-phase.json`);
        const wfPhase = JSON.parse(wfPhaseContent);
        const lastStatus = wfPhase.status[wfPhase.status.length - 1];
        expect(lastStatus.action).toBe('question');
        expect(lastStatus.message_id).toBe('001');
      });

      it('should assign sequential message IDs (001, 002, 003)', async () => {
        /*
        Test Doc:
        - Why: Multiple messages in same phase need unique IDs
        - Contract: IDs are 3-digit sequential starting at 001
        - Usage Notes: Reads existing m-*.json to find max ID
        - Quality Contribution: Ensures ID collision prevention
        - Worked Example: With m-001, m-002 existing → next ID is '003'
        */
        setupPhase(['001', '002']);

        const content: MessageContent = {
          subject: 'Another question',
          body: 'Need more info',
        };

        const result = await service.create(phase, runDir, 'free_text', content);
        expect(result.errors).toEqual([]);
        expect(result.messageId).toBe('003');
      });

      it('should create message with from="agent" by default', async () => {
        /*
        Test Doc:
        - Why: Per DYK Insight #4, default from is 'agent' for create
        - Contract: from field defaults to 'agent' when not specified
        */
        setupPhase();

        const content: MessageContent = {
          subject: 'Test',
          body: 'Body',
        };

        const result = await service.create(phase, runDir, 'free_text', content);
        expect(result.errors).toEqual([]);

        const messageContent = await fs.readFile(`${messagesDir}/m-001.json`);
        const messageFile = JSON.parse(messageContent);
        expect(messageFile.from).toBe('agent');
      });

      it('should allow from="orchestrator" when specified', async () => {
        /*
        Test Doc:
        - Why: Per DYK Insight #4, orchestrator can also create messages
        - Contract: from field can be overridden via parameter
        */
        setupPhase();

        const content: MessageContent = {
          subject: 'Directive',
          body: 'Please do this',
        };

        const result = await service.create(phase, runDir, 'free_text', content, 'orchestrator');
        expect(result.errors).toEqual([]);

        const messageContent = await fs.readFile(`${messagesDir}/m-001.json`);
        const messageFile = JSON.parse(messageContent);
        expect(messageFile.from).toBe('orchestrator');
      });
    });

    describe('message types', () => {
      it('should create single_choice message with options', async () => {
        /*
        Test Doc:
        - Why: single_choice is one of 4 supported types
        - Contract: Creates valid message with options array
        */
        setupPhase();

        const content: MessageContent = {
          subject: 'Pick one',
          body: 'Choose an option',
          options: [
            { key: 'A', label: 'Option A' },
            { key: 'B', label: 'Option B' },
          ],
        };

        const result = await service.create(phase, runDir, 'single_choice', content);
        expect(result.errors).toEqual([]);

        const msgContent = await fs.readFile(`${messagesDir}/m-001.json`);
        const msg = JSON.parse(msgContent);
        expect(msg.type).toBe('single_choice');
        expect(msg.options).toHaveLength(2);
      });

      it('should create multi_choice message with options', async () => {
        setupPhase();

        const content: MessageContent = {
          subject: 'Pick multiple',
          body: 'Select options',
          options: [
            { key: 'A', label: 'A' },
            { key: 'B', label: 'B' },
            { key: 'C', label: 'C' },
          ],
        };

        const result = await service.create(phase, runDir, 'multi_choice', content);
        expect(result.errors).toEqual([]);
      });

      it('should create free_text message without options', async () => {
        setupPhase();

        const content: MessageContent = {
          subject: 'Need input',
          body: 'Please provide details',
        };

        const result = await service.create(phase, runDir, 'free_text', content);
        expect(result.errors).toEqual([]);

        const msgContent = await fs.readFile(`${messagesDir}/m-001.json`);
        const msg = JSON.parse(msgContent);
        expect(msg.type).toBe('free_text');
        expect(msg.options).toBeUndefined();
      });

      it('should create confirm message without options', async () => {
        setupPhase();

        const content: MessageContent = {
          subject: 'Confirm action',
          body: 'Do you want to proceed?',
        };

        const result = await service.create(phase, runDir, 'confirm', content);
        expect(result.errors).toEqual([]);
      });
    });

    describe('validation errors', () => {
      it('should return E064 for invalid content structure', async () => {
        /*
        Test Doc:
        - Why: Content must be validated against message.schema.json
        - Contract: Returns E064 with actionable error for invalid content
        - Quality Contribution: Agents get clear feedback on malformed content
        */
        setupPhase();

        // Schema validator returns error
        schemaValidator.setDefaultResult({
          valid: false,
          errors: [
            {
              code: 'VALIDATION_ERROR',
              path: '/subject',
              message: 'Required property missing',
            },
          ],
        });

        const invalidContent = {
          // Missing required 'subject'
          body: 'Some body',
        } as MessageContent;

        const result = await service.create(phase, runDir, 'free_text', invalidContent);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe(MessageErrorCodes.MESSAGE_VALIDATION_FAILED);
        expect(result.errors[0].action).toBeDefined(); // Actionable error
      });

      it('should return E064 for choice type without options', async () => {
        /*
        Test Doc:
        - Why: single_choice and multi_choice require options array
        - Contract: Returns E064 when options missing for choice types
        */
        setupPhase();

        schemaValidator.setDefaultResult({
          valid: false,
          errors: [
            {
              code: 'VALIDATION_ERROR',
              path: '/options',
              message: 'Required for single_choice type',
            },
          ],
        });

        const content: MessageContent = {
          subject: 'Choose',
          body: 'Pick one',
          // Missing options for single_choice!
        };

        const result = await service.create(phase, runDir, 'single_choice', content);
        expect(result.errors[0].code).toBe(MessageErrorCodes.MESSAGE_VALIDATION_FAILED);
      });
    });

    describe('status log integration', () => {
      it('should append question action to wf-phase.json status', async () => {
        /*
        Test Doc:
        - Why: Per DYK Insight #2, creates signpost in status log
        - Contract: Adds { action: 'question', message_id: '001' } entry
        - Quality Contribution: Enables audit trail and orchestrator discovery
        */
        setupPhase();

        const content: MessageContent = {
          subject: 'Test',
          body: 'Body',
        };

        await service.create(phase, runDir, 'free_text', content);

        const wfPhaseContent = await fs.readFile(`${wfDataDir}/wf-phase.json`);
        const wfPhase = JSON.parse(wfPhaseContent);
        const questionEntry = wfPhase.status.find((s: { action: string }) => s.action === 'question');
        expect(questionEntry).toBeDefined();
        expect(questionEntry.message_id).toBe('001');
        expect(questionEntry.from).toBe('agent');
        expect(questionEntry.timestamp).toBeDefined();
      });
    });
  });
});
