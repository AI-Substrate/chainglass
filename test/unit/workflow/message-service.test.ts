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

  describe('answer()', () => {
    // Helper to create a single_choice message for testing answers
    function setupSingleChoiceMessage(id: string = '001'): void {
      fs.setFile(
        `${messagesDir}/m-${id}.json`,
        JSON.stringify({
          id,
          created_at: '2026-01-21T10:00:00Z',
          from: 'agent',
          type: 'single_choice',
          subject: 'Pick one option',
          body: 'Please select your preference',
          options: [
            { key: 'A', label: 'Option A' },
            { key: 'B', label: 'Option B' },
            { key: 'C', label: 'Option C' },
          ],
        })
      );
    }

    // Helper to create a multi_choice message
    function setupMultiChoiceMessage(id: string = '001'): void {
      fs.setFile(
        `${messagesDir}/m-${id}.json`,
        JSON.stringify({
          id,
          created_at: '2026-01-21T10:00:00Z',
          from: 'agent',
          type: 'multi_choice',
          subject: 'Pick multiple',
          body: 'Select all that apply',
          options: [
            { key: 'A', label: 'Option A' },
            { key: 'B', label: 'Option B' },
            { key: 'C', label: 'Option C' },
          ],
        })
      );
    }

    // Helper to create a free_text message
    function setupFreeTextMessage(id: string = '001'): void {
      fs.setFile(
        `${messagesDir}/m-${id}.json`,
        JSON.stringify({
          id,
          created_at: '2026-01-21T10:00:00Z',
          from: 'agent',
          type: 'free_text',
          subject: 'Provide details',
          body: 'Please describe your approach',
        })
      );
    }

    // Helper to create a confirm message
    function setupConfirmMessage(id: string = '001'): void {
      fs.setFile(
        `${messagesDir}/m-${id}.json`,
        JSON.stringify({
          id,
          created_at: '2026-01-21T10:00:00Z',
          from: 'agent',
          type: 'confirm',
          subject: 'Confirm action',
          body: 'Do you want to proceed?',
        })
      );
    }

    describe('happy path', () => {
      it('should answer single_choice message with one selection', async () => {
        /*
        Test Doc:
        - Why: single_choice is the most common question type
        - Contract: answer() updates message file with selected array, returns result
        - Usage Notes: Selection must contain exactly 1 key
        - Quality Contribution: Validates basic answer workflow
        - Worked Example: answer(phase, runDir, '001', { selected: ['B'] }) → success
        */
        setupPhase();
        setupSingleChoiceMessage();

        const result = await service.answer(phase, runDir, '001', { selected: ['B'] });

        expect(result.errors).toEqual([]);
        expect(result.messageId).toBe('001');
        expect(result.answer).toBeDefined();
        expect(result.answer?.answered_at).toBeDefined();

        // Verify message file was updated
        const msgContent = await fs.readFile(`${messagesDir}/m-001.json`);
        const msg = JSON.parse(msgContent);
        expect(msg.answer).toBeDefined();
        expect(msg.answer.selected).toEqual(['B']);
      });

      it('should answer multi_choice message with multiple selections', async () => {
        /*
        Test Doc:
        - Why: multi_choice allows selecting 1+ options
        - Contract: answer() accepts array with 1 or more keys
        */
        setupPhase();
        setupMultiChoiceMessage();

        const result = await service.answer(phase, runDir, '001', { selected: ['A', 'C'] });

        expect(result.errors).toEqual([]);
        const msgContent = await fs.readFile(`${messagesDir}/m-001.json`);
        const msg = JSON.parse(msgContent);
        expect(msg.answer.selected).toEqual(['A', 'C']);
      });

      it('should answer free_text message with text response', async () => {
        /*
        Test Doc:
        - Why: free_text allows open-ended responses
        - Contract: answer() requires text field, no selections
        */
        setupPhase();
        setupFreeTextMessage();

        const result = await service.answer(phase, runDir, '001', { text: 'My detailed response here' });

        expect(result.errors).toEqual([]);
        const msgContent = await fs.readFile(`${messagesDir}/m-001.json`);
        const msg = JSON.parse(msgContent);
        expect(msg.answer.text).toBe('My detailed response here');
      });

      it('should answer confirm message with confirmed=true', async () => {
        /*
        Test Doc:
        - Why: confirm is yes/no questions
        - Contract: answer() requires confirmed boolean
        */
        setupPhase();
        setupConfirmMessage();

        const result = await service.answer(phase, runDir, '001', { confirmed: true });

        expect(result.errors).toEqual([]);
        const msgContent = await fs.readFile(`${messagesDir}/m-001.json`);
        const msg = JSON.parse(msgContent);
        expect(msg.answer.confirmed).toBe(true);
      });

      it('should answer confirm message with confirmed=false', async () => {
        setupPhase();
        setupConfirmMessage();

        const result = await service.answer(phase, runDir, '001', { confirmed: false });

        expect(result.errors).toEqual([]);
        const msgContent = await fs.readFile(`${messagesDir}/m-001.json`);
        const msg = JSON.parse(msgContent);
        expect(msg.answer.confirmed).toBe(false);
      });

      it('should use from="orchestrator" by default', async () => {
        /*
        Test Doc:
        - Why: Per DYK Insight #4, default from is 'orchestrator' for answers
        - Contract: Status entry from field defaults to orchestrator
        */
        setupPhase();
        setupSingleChoiceMessage();

        await service.answer(phase, runDir, '001', { selected: ['A'] });

        const wfPhaseContent = await fs.readFile(`${wfDataDir}/wf-phase.json`);
        const wfPhase = JSON.parse(wfPhaseContent);
        const answerEntry = wfPhase.status.find((s: { action: string }) => s.action === 'answer');
        expect(answerEntry).toBeDefined();
        expect(answerEntry.from).toBe('orchestrator');
      });

      it('should allow from="agent" when specified', async () => {
        setupPhase();
        setupSingleChoiceMessage();

        await service.answer(phase, runDir, '001', { selected: ['A'] }, 'agent');

        const wfPhaseContent = await fs.readFile(`${wfDataDir}/wf-phase.json`);
        const wfPhase = JSON.parse(wfPhaseContent);
        const answerEntry = wfPhase.status.find((s: { action: string }) => s.action === 'answer');
        expect(answerEntry.from).toBe('agent');
      });

      it('should include optional note in answer', async () => {
        /*
        Test Doc:
        - Why: Notes provide context for answers
        - Contract: note field is preserved in answer object
        */
        setupPhase();
        setupSingleChoiceMessage();

        const result = await service.answer(phase, runDir, '001', {
          selected: ['B'],
          note: 'Chosen because it aligns with requirements',
        });

        expect(result.errors).toEqual([]);
        const msgContent = await fs.readFile(`${messagesDir}/m-001.json`);
        const msg = JSON.parse(msgContent);
        expect(msg.answer.note).toBe('Chosen because it aligns with requirements');
      });
    });

    describe('error cases', () => {
      it('should return E060 for non-existent message ID', async () => {
        /*
        Test Doc:
        - Why: Agents must get clear error for invalid message ID
        - Contract: Returns E060 MESSAGE_NOT_FOUND with actionable message
        - Quality Contribution: Prevents silent failures
        */
        setupPhase();

        const result = await service.answer(phase, runDir, '999', { selected: ['A'] });

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe(MessageErrorCodes.MESSAGE_NOT_FOUND);
        expect(result.errors[0].action).toBeDefined();
      });

      it('should return E063 for already answered message', async () => {
        /*
        Test Doc:
        - Why: Messages can only be answered once
        - Contract: Returns E063 MESSAGE_ALREADY_ANSWERED
        - Quality Contribution: Prevents duplicate answers
        */
        setupPhase();
        fs.setFile(
          `${messagesDir}/m-001.json`,
          JSON.stringify({
            id: '001',
            created_at: '2026-01-21T10:00:00Z',
            from: 'agent',
            type: 'single_choice',
            subject: 'Already answered',
            body: 'This was answered',
            options: [{ key: 'A', label: 'A' }],
            answer: {
              answered_at: '2026-01-21T10:01:00Z',
              selected: ['A'],
            },
          })
        );

        const result = await service.answer(phase, runDir, '001', { selected: ['A'] });

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe(MessageErrorCodes.MESSAGE_ALREADY_ANSWERED);
      });

      it('should return E061 for single_choice with no selection', async () => {
        /*
        Test Doc:
        - Why: Type mismatch must be detected with actionable error
        - Contract: Returns E061 MESSAGE_TYPE_MISMATCH
        */
        setupPhase();
        setupSingleChoiceMessage();

        const result = await service.answer(phase, runDir, '001', { selected: [] });

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe(MessageErrorCodes.MESSAGE_TYPE_MISMATCH);
        expect(result.errors[0].action).toContain('--select');
      });

      it('should return E061 for single_choice with multiple selections', async () => {
        setupPhase();
        setupSingleChoiceMessage();

        const result = await service.answer(phase, runDir, '001', { selected: ['A', 'B'] });

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe(MessageErrorCodes.MESSAGE_TYPE_MISMATCH);
        expect(result.errors[0].message).toContain('exactly one');
      });

      it('should return E061 for multi_choice with no selection', async () => {
        setupPhase();
        setupMultiChoiceMessage();

        const result = await service.answer(phase, runDir, '001', { selected: [] });

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe(MessageErrorCodes.MESSAGE_TYPE_MISMATCH);
      });

      it('should return E061 for free_text with empty text', async () => {
        setupPhase();
        setupFreeTextMessage();

        const result = await service.answer(phase, runDir, '001', { text: '' });

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe(MessageErrorCodes.MESSAGE_TYPE_MISMATCH);
        expect(result.errors[0].action).toContain('--text');
      });

      it('should return E061 for confirm with missing confirmed field', async () => {
        setupPhase();
        setupConfirmMessage();

        const result = await service.answer(phase, runDir, '001', {});

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe(MessageErrorCodes.MESSAGE_TYPE_MISMATCH);
        expect(result.errors[0].action).toContain('--confirm');
      });

      it('should return E061 for invalid option key', async () => {
        /*
        Test Doc:
        - Why: Selection must match available options
        - Contract: Returns E061 with valid keys listed in action
        */
        setupPhase();
        setupSingleChoiceMessage();

        const result = await service.answer(phase, runDir, '001', { selected: ['Z'] });

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe(MessageErrorCodes.MESSAGE_TYPE_MISMATCH);
        expect(result.errors[0].message).toContain('Invalid option key');
        expect(result.errors[0].action).toContain('A, B, C');
      });
    });

    describe('status log integration', () => {
      it('should append answer action to wf-phase.json status', async () => {
        /*
        Test Doc:
        - Why: Per DYK Insight #2, creates signpost in status log
        - Contract: Adds { action: 'answer', message_id: '001' } entry
        */
        setupPhase();
        setupSingleChoiceMessage();

        await service.answer(phase, runDir, '001', { selected: ['A'] });

        const wfPhaseContent = await fs.readFile(`${wfDataDir}/wf-phase.json`);
        const wfPhase = JSON.parse(wfPhaseContent);
        const answerEntry = wfPhase.status.find((s: { action: string }) => s.action === 'answer');
        expect(answerEntry).toBeDefined();
        expect(answerEntry.message_id).toBe('001');
        expect(answerEntry.timestamp).toBeDefined();
      });
    });
  });

  describe('list()', () => {
    describe('happy path', () => {
      it('should return empty list when no messages exist', async () => {
        /*
        Test Doc:
        - Why: Empty phase should return empty list, not error
        - Contract: Returns { messages: [], count: 0 }
        - Quality Contribution: Handles empty state gracefully
        */
        setupPhase();

        const result = await service.list(phase, runDir);

        expect(result.errors).toEqual([]);
        expect(result.messages).toEqual([]);
        expect(result.count).toBe(0);
      });

      it('should return list of messages sorted by ID', async () => {
        /*
        Test Doc:
        - Why: Messages should be returned in order of creation
        - Contract: Returns messages sorted by ID ascending
        - Worked Example: ['002', '001', '003'] → sorted to ['001', '002', '003']
        */
        setupPhase();
        // Create messages out of order (simulating filesystem order randomness)
        fs.setFile(
          `${messagesDir}/m-002.json`,
          JSON.stringify({
            id: '002',
            created_at: '2026-01-21T10:01:00Z',
            from: 'agent',
            type: 'free_text',
            subject: 'Second message',
            body: 'Body 2',
          })
        );
        fs.setFile(
          `${messagesDir}/m-001.json`,
          JSON.stringify({
            id: '001',
            created_at: '2026-01-21T10:00:00Z',
            from: 'agent',
            type: 'single_choice',
            subject: 'First message',
            body: 'Body 1',
            options: [{ key: 'A', label: 'A' }],
          })
        );
        fs.setFile(
          `${messagesDir}/m-003.json`,
          JSON.stringify({
            id: '003',
            created_at: '2026-01-21T10:02:00Z',
            from: 'orchestrator',
            type: 'confirm',
            subject: 'Third message',
            body: 'Body 3',
          })
        );

        const result = await service.list(phase, runDir);

        expect(result.errors).toEqual([]);
        expect(result.count).toBe(3);
        expect(result.messages[0].id).toBe('001');
        expect(result.messages[1].id).toBe('002');
        expect(result.messages[2].id).toBe('003');
      });

      it('should return MessageSummary fields for each message', async () => {
        /*
        Test Doc:
        - Why: List provides summary, not full content
        - Contract: Each item has id, type, subject, from, created_at, answered, answered_at
        */
        setupPhase();
        fs.setFile(
          `${messagesDir}/m-001.json`,
          JSON.stringify({
            id: '001',
            created_at: '2026-01-21T10:00:00Z',
            from: 'agent',
            type: 'multi_choice',
            subject: 'Test subject',
            body: 'Test body',
            options: [{ key: 'A', label: 'A' }],
          })
        );

        const result = await service.list(phase, runDir);

        expect(result.messages[0]).toEqual({
          id: '001',
          type: 'multi_choice',
          subject: 'Test subject',
          from: 'agent',
          created_at: '2026-01-21T10:00:00Z',
          answered: false,
          answered_at: null,
        });
      });

      it('should indicate answered status for answered messages', async () => {
        /*
        Test Doc:
        - Why: Orchestrator needs to see which messages need answers
        - Contract: answered=true and answered_at populated for answered messages
        */
        setupPhase();
        fs.setFile(
          `${messagesDir}/m-001.json`,
          JSON.stringify({
            id: '001',
            created_at: '2026-01-21T10:00:00Z',
            from: 'agent',
            type: 'confirm',
            subject: 'Answered',
            body: 'Body',
            answer: {
              answered_at: '2026-01-21T10:05:00Z',
              confirmed: true,
            },
          })
        );

        const result = await service.list(phase, runDir);

        expect(result.messages[0].answered).toBe(true);
        expect(result.messages[0].answered_at).toBe('2026-01-21T10:05:00Z');
      });

      it('should handle non-existent messages directory gracefully', async () => {
        /*
        Test Doc:
        - Why: Phase may not have messages directory yet
        - Contract: Returns empty list, not error
        */
        // Don't set up phase - messages directory doesn't exist
        fs.setDir(`${runDir}/phases/${phase}/run/wf-data`);

        const result = await service.list(phase, runDir);

        expect(result.errors).toEqual([]);
        expect(result.messages).toEqual([]);
        expect(result.count).toBe(0);
      });
    });
  });

  describe('read()', () => {
    describe('happy path', () => {
      it('should return full message content', async () => {
        /*
        Test Doc:
        - Why: Read provides full message for detailed inspection
        - Contract: Returns complete Message object including body, options, answer
        - Worked Example: read(phase, runDir, '001') → full message with all fields
        */
        setupPhase();
        const fullMessage = {
          id: '001',
          created_at: '2026-01-21T10:00:00Z',
          from: 'agent',
          type: 'multi_choice',
          subject: 'Full content test',
          body: 'This is the full body text that should be returned',
          note: 'Additional context for the message',
          options: [
            { key: 'A', label: 'Option A', description: 'Description for A' },
            { key: 'B', label: 'Option B', description: 'Description for B' },
          ],
        };
        fs.setFile(`${messagesDir}/m-001.json`, JSON.stringify(fullMessage));

        const result = await service.read(phase, runDir, '001');

        expect(result.errors).toEqual([]);
        expect(result.message).toBeDefined();
        expect(result.message?.id).toBe('001');
        expect(result.message?.body).toBe('This is the full body text that should be returned');
        expect(result.message?.note).toBe('Additional context for the message');
        expect(result.message?.options).toHaveLength(2);
      });

      it('should return message with answer if answered', async () => {
        /*
        Test Doc:
        - Why: Read should include answer data if present
        - Contract: Returns message.answer with all answer fields
        */
        setupPhase();
        const answeredMessage = {
          id: '001',
          created_at: '2026-01-21T10:00:00Z',
          from: 'agent',
          type: 'single_choice',
          subject: 'Answered message',
          body: 'Body',
          options: [
            { key: 'A', label: 'A' },
            { key: 'B', label: 'B' },
          ],
          answer: {
            answered_at: '2026-01-21T10:05:00Z',
            selected: ['B'],
            note: 'Chose B because...',
          },
        };
        fs.setFile(`${messagesDir}/m-001.json`, JSON.stringify(answeredMessage));

        const result = await service.read(phase, runDir, '001');

        expect(result.errors).toEqual([]);
        expect(result.message?.answer).toBeDefined();
        expect(result.message?.answer?.selected).toEqual(['B']);
        expect(result.message?.answer?.note).toBe('Chose B because...');
      });
    });

    describe('error cases', () => {
      it('should return E060 for non-existent message ID', async () => {
        /*
        Test Doc:
        - Why: Invalid ID should return clear error
        - Contract: Returns E060 MESSAGE_NOT_FOUND with actionable message
        */
        setupPhase();

        const result = await service.read(phase, runDir, '999');

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe(MessageErrorCodes.MESSAGE_NOT_FOUND);
        expect(result.errors[0].action).toContain("'999'");
        expect(result.message).toBeNull();
      });
    });
  });
});
