import {
  ExecutionSchema,
  GraphStatusSchema,
  InputResolutionSchema,
  LineDefinitionSchema,
  NodeConfigSchema,
  NodeExecutionStatusSchema,
  NodeStateEntryErrorSchema,
  NodeStateEntrySchema,
  PositionalGraphDefinitionSchema,
  QuestionSchema,
  QuestionTypeSchema,
  StateSchema,
  TransitionEntrySchema,
  TransitionModeSchema,
} from '@chainglass/positional-graph/schemas';
import { describe, expect, it } from 'vitest';

// ============================================
// TransitionModeSchema
// ============================================

describe('TransitionModeSchema', () => {
  it('accepts "auto"', () => {
    expect(TransitionModeSchema.parse('auto')).toBe('auto');
  });

  it('accepts "manual"', () => {
    expect(TransitionModeSchema.parse('manual')).toBe('manual');
  });

  it('rejects invalid values', () => {
    const result = TransitionModeSchema.safeParse('conditional');
    expect(result.success).toBe(false);
  });
});

// ============================================
// ExecutionSchema
// ============================================

describe('ExecutionSchema', () => {
  it('accepts "serial"', () => {
    expect(ExecutionSchema.parse('serial')).toBe('serial');
  });

  it('accepts "parallel"', () => {
    expect(ExecutionSchema.parse('parallel')).toBe('parallel');
  });

  it('rejects invalid values', () => {
    const result = ExecutionSchema.safeParse('concurrent');
    expect(result.success).toBe(false);
  });
});

// ============================================
// LineDefinitionSchema
// ============================================

describe('LineDefinitionSchema', () => {
  it('parses a minimal line with defaults', () => {
    const line = LineDefinitionSchema.parse({
      id: 'line-a4f',
      nodes: [],
    });
    expect(line.id).toBe('line-a4f');
    expect(line.orchestratorSettings.transition).toBe('auto'); // default
    expect(line.label).toBeUndefined();
    expect(line.description).toBeUndefined();
    expect(line.nodes).toEqual([]);
  });

  it('parses a full line definition', () => {
    const line = LineDefinitionSchema.parse({
      id: 'line-b7e',
      label: 'Processing',
      description: 'Main processing step',
      orchestratorSettings: { transition: 'manual' },
      nodes: ['sample-coder-c4d', 'sample-reviewer-d9a'],
    });
    expect(line.label).toBe('Processing');
    expect(line.orchestratorSettings.transition).toBe('manual');
    expect(line.nodes).toHaveLength(2);
  });

  it('rejects missing id', () => {
    const result = LineDefinitionSchema.safeParse({ nodes: [] });
    expect(result.success).toBe(false);
  });

  it('rejects empty id string', () => {
    const result = LineDefinitionSchema.safeParse({ id: '', nodes: [] });
    expect(result.success).toBe(false);
  });
});

// ============================================
// PositionalGraphDefinitionSchema
// ============================================

describe('PositionalGraphDefinitionSchema', () => {
  const validGraph = {
    slug: 'my-pipeline',
    version: '1.0.0',
    created_at: '2026-02-01T00:00:00Z',
    lines: [{ id: 'line-a4f', nodes: [] }],
  };

  it('parses a valid graph definition', () => {
    const graph = PositionalGraphDefinitionSchema.parse(validGraph);
    expect(graph.slug).toBe('my-pipeline');
    expect(graph.version).toBe('1.0.0');
    expect(graph.lines).toHaveLength(1);
  });

  it('accepts optional description', () => {
    const graph = PositionalGraphDefinitionSchema.parse({
      ...validGraph,
      description: 'A test pipeline',
    });
    expect(graph.description).toBe('A test pipeline');
  });

  it('rejects invalid slug — uppercase', () => {
    const result = PositionalGraphDefinitionSchema.safeParse({
      ...validGraph,
      slug: 'MyPipeline',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid slug — special chars', () => {
    const result = PositionalGraphDefinitionSchema.safeParse({
      ...validGraph,
      slug: 'my_pipeline!',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid slug — starts with number', () => {
    const result = PositionalGraphDefinitionSchema.safeParse({
      ...validGraph,
      slug: '1-pipeline',
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero lines', () => {
    const result = PositionalGraphDefinitionSchema.safeParse({
      ...validGraph,
      lines: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid version format', () => {
    const result = PositionalGraphDefinitionSchema.safeParse({
      ...validGraph,
      version: 'v1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid datetime format', () => {
    const result = PositionalGraphDefinitionSchema.safeParse({
      ...validGraph,
      created_at: '2026-02-01',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = PositionalGraphDefinitionSchema.safeParse({
      slug: 'test',
    });
    expect(result.success).toBe(false);
  });
});

// ============================================
// InputResolutionSchema
// ============================================

describe('InputResolutionSchema', () => {
  it('parses from_unit resolution', () => {
    const input = InputResolutionSchema.parse({
      from_unit: 'research-concept',
      from_output: 'summary',
    });
    expect(input).toEqual({
      from_unit: 'research-concept',
      from_output: 'summary',
    });
  });

  it('parses from_unit with ordinal', () => {
    const input = InputResolutionSchema.parse({
      from_unit: 'research-concept:2',
      from_output: 'summary',
    });
    expect(input).toEqual({
      from_unit: 'research-concept:2',
      from_output: 'summary',
    });
  });

  it('parses from_node resolution', () => {
    const input = InputResolutionSchema.parse({
      from_node: 'sample-input-a3f',
      from_output: 'spec',
    });
    expect(input).toEqual({
      from_node: 'sample-input-a3f',
      from_output: 'spec',
    });
  });

  it('rejects empty from_unit', () => {
    const result = InputResolutionSchema.safeParse({
      from_unit: '',
      from_output: 'summary',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty from_output', () => {
    const result = InputResolutionSchema.safeParse({
      from_unit: 'test',
      from_output: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects object with neither from_unit nor from_node', () => {
    const result = InputResolutionSchema.safeParse({
      from_output: 'summary',
    });
    expect(result.success).toBe(false);
  });
});

// ============================================
// NodeConfigSchema
// ============================================

describe('NodeConfigSchema', () => {
  const validNode = {
    id: 'sample-coder-c4d',
    unit_slug: 'sample-coder',
    created_at: '2026-02-01T00:00:00Z',
  };

  it('parses minimal node with defaults', () => {
    const node = NodeConfigSchema.parse(validNode);
    expect(node.id).toBe('sample-coder-c4d');
    expect(node.unit_slug).toBe('sample-coder');
    expect(node.orchestratorSettings.execution).toBe('serial'); // default
    expect(node.description).toBeUndefined();
    expect(node.inputs).toBeUndefined();
  });

  it('parses full node with all fields', () => {
    const node = NodeConfigSchema.parse({
      ...validNode,
      orchestratorSettings: { execution: 'parallel' },
      description: 'Main coding agent',
      properties: { model: 'claude-3' },
      inputs: {
        spec: { from_unit: 'research-concept', from_output: 'summary' },
      },
    });
    expect(node.orchestratorSettings.execution).toBe('parallel');
    expect(node.description).toBe('Main coding agent');
    expect(node.properties).toEqual({ model: 'claude-3' });
    expect(node.inputs).toBeDefined();
  });

  it('rejects missing id', () => {
    const result = NodeConfigSchema.safeParse({
      unit_slug: 'test',
      created_at: '2026-02-01T00:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty unit_slug', () => {
    const result = NodeConfigSchema.safeParse({
      id: 'test-a3f',
      unit_slug: '',
      created_at: '2026-02-01T00:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('accepts inputs with from_node resolution', () => {
    const node = NodeConfigSchema.parse({
      ...validNode,
      inputs: {
        data: { from_node: 'sample-input-a3f', from_output: 'output' },
      },
    });
    expect(node.inputs?.data).toEqual({
      from_node: 'sample-input-a3f',
      from_output: 'output',
    });
  });
});

// ============================================
// GraphStatusSchema
// ============================================

describe('GraphStatusSchema', () => {
  it('accepts "pending"', () => {
    expect(GraphStatusSchema.parse('pending')).toBe('pending');
  });

  it('accepts "in_progress"', () => {
    expect(GraphStatusSchema.parse('in_progress')).toBe('in_progress');
  });

  it('accepts "complete"', () => {
    expect(GraphStatusSchema.parse('complete')).toBe('complete');
  });

  it('accepts "failed"', () => {
    expect(GraphStatusSchema.parse('failed')).toBe('failed');
  });

  it('rejects invalid values', () => {
    const result = GraphStatusSchema.safeParse('running');
    expect(result.success).toBe(false);
  });
});

// ============================================
// NodeExecutionStatusSchema
// ============================================

describe('NodeExecutionStatusSchema', () => {
  it('accepts "running"', () => {
    expect(NodeExecutionStatusSchema.parse('running')).toBe('running');
  });

  it('accepts "waiting-question"', () => {
    expect(NodeExecutionStatusSchema.parse('waiting-question')).toBe('waiting-question');
  });

  it('accepts "blocked-error"', () => {
    expect(NodeExecutionStatusSchema.parse('blocked-error')).toBe('blocked-error');
  });

  it('accepts "complete"', () => {
    expect(NodeExecutionStatusSchema.parse('complete')).toBe('complete');
  });

  it('rejects computed-only statuses', () => {
    expect(NodeExecutionStatusSchema.safeParse('pending').success).toBe(false);
    expect(NodeExecutionStatusSchema.safeParse('ready').success).toBe(false);
  });
});

// ============================================
// NodeStateEntrySchema
// ============================================

describe('NodeStateEntrySchema', () => {
  it('parses minimal entry with status only', () => {
    const entry = NodeStateEntrySchema.parse({ status: 'running' });
    expect(entry.status).toBe('running');
    expect(entry.started_at).toBeUndefined();
    expect(entry.completed_at).toBeUndefined();
  });

  it('parses complete entry with timestamps', () => {
    const entry = NodeStateEntrySchema.parse({
      status: 'complete',
      started_at: '2026-02-01T10:00:00Z',
      completed_at: '2026-02-01T10:05:00Z',
    });
    expect(entry.status).toBe('complete');
    expect(entry.started_at).toBe('2026-02-01T10:00:00Z');
    expect(entry.completed_at).toBe('2026-02-01T10:05:00Z');
  });

  it('rejects invalid status', () => {
    const result = NodeStateEntrySchema.safeParse({ status: 'pending' });
    expect(result.success).toBe(false);
  });
});

// ============================================
// TransitionEntrySchema
// ============================================

describe('TransitionEntrySchema', () => {
  it('parses untriggered transition', () => {
    const entry = TransitionEntrySchema.parse({ triggered: false });
    expect(entry.triggered).toBe(false);
    expect(entry.triggered_at).toBeUndefined();
  });

  it('parses triggered transition with timestamp', () => {
    const entry = TransitionEntrySchema.parse({
      triggered: true,
      triggered_at: '2026-02-01T10:30:00Z',
    });
    expect(entry.triggered).toBe(true);
    expect(entry.triggered_at).toBe('2026-02-01T10:30:00Z');
  });

  it('rejects missing triggered field', () => {
    const result = TransitionEntrySchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ============================================
// StateSchema
// ============================================

describe('StateSchema', () => {
  it('parses minimal state (pending graph)', () => {
    const state = StateSchema.parse({
      graph_status: 'pending',
      updated_at: '2026-02-01T00:00:00Z',
    });
    expect(state.graph_status).toBe('pending');
    expect(state.nodes).toBeUndefined();
    expect(state.transitions).toBeUndefined();
  });

  it('parses full state with nodes and transitions', () => {
    const state = StateSchema.parse({
      graph_status: 'in_progress',
      updated_at: '2026-02-01T10:30:00Z',
      nodes: {
        'sample-input-a3f': {
          status: 'complete',
          started_at: '2026-02-01T10:00:00Z',
          completed_at: '2026-02-01T10:05:00Z',
        },
        'sample-coder-c4d': {
          status: 'running',
          started_at: '2026-02-01T10:06:00Z',
        },
      },
      transitions: {
        'line-c8b': {
          triggered: false,
        },
      },
    });
    expect(state.nodes?.['sample-input-a3f']?.status).toBe('complete');
    expect(state.nodes?.['sample-coder-c4d']?.status).toBe('running');
    expect(state.transitions?.['line-c8b']?.triggered).toBe(false);
  });

  it('rejects invalid graph_status', () => {
    const result = StateSchema.safeParse({
      graph_status: 'unknown',
      updated_at: '2026-02-01T00:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid updated_at format', () => {
    const result = StateSchema.safeParse({
      graph_status: 'pending',
      updated_at: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional questions array', () => {
    /**
     * Purpose: Proves state can contain questions for Q&A protocol
     * Quality Contribution: Enables question/answer protocol in state.json
     * Acceptance Criteria: State with questions array parses successfully
     */
    const state = StateSchema.parse({
      graph_status: 'in_progress',
      updated_at: '2026-02-01T10:30:00Z',
      questions: [
        {
          question_id: '2026-02-03T10:32:00.000Z_f4e',
          node_id: 'sample-coder-c4d',
          type: 'single',
          text: 'Which language?',
          options: ['bash', 'python'],
          asked_at: '2026-02-03T10:32:00Z',
        },
      ],
    });
    expect(state.questions).toHaveLength(1);
    expect(state.questions?.[0]?.question_id).toBe('2026-02-03T10:32:00.000Z_f4e');
  });
});

// ============================================
// QuestionTypeSchema (Plan 028)
// ============================================

describe('QuestionTypeSchema', () => {
  it('accepts "text"', () => {
    expect(QuestionTypeSchema.parse('text')).toBe('text');
  });

  it('accepts "single"', () => {
    expect(QuestionTypeSchema.parse('single')).toBe('single');
  });

  it('accepts "multi"', () => {
    expect(QuestionTypeSchema.parse('multi')).toBe('multi');
  });

  it('accepts "confirm"', () => {
    expect(QuestionTypeSchema.parse('confirm')).toBe('confirm');
  });

  it('rejects invalid values', () => {
    const result = QuestionTypeSchema.safeParse('checkbox');
    expect(result.success).toBe(false);
  });
});

// ============================================
// QuestionSchema (Plan 028)
// ============================================

describe('QuestionSchema', () => {
  const validQuestion = {
    question_id: '2026-02-03T10:32:00.000Z_f4e',
    node_id: 'sample-coder-c4d',
    type: 'single',
    text: 'Which programming language should I use?',
    asked_at: '2026-02-03T10:32:00Z',
  };

  it('parses minimal question (required fields only)', () => {
    /**
     * Purpose: Proves Question can be created with required fields only
     * Quality Contribution: Ensures minimal valid question is accepted
     * Acceptance Criteria: Question with question_id, node_id, type, text, asked_at parses
     */
    const question = QuestionSchema.parse(validQuestion);
    expect(question.question_id).toBe('2026-02-03T10:32:00.000Z_f4e');
    expect(question.node_id).toBe('sample-coder-c4d');
    expect(question.type).toBe('single');
    expect(question.text).toBe('Which programming language should I use?');
    expect(question.asked_at).toBe('2026-02-03T10:32:00Z');
  });

  it('parses question with options', () => {
    const question = QuestionSchema.parse({
      ...validQuestion,
      options: ['typescript', 'javascript', 'python', 'bash'],
    });
    expect(question.options).toEqual(['typescript', 'javascript', 'python', 'bash']);
  });

  it('parses question with default value (string)', () => {
    /**
     * Purpose: Proves Question supports string default values
     * Quality Contribution: Enables pre-filled form values
     * Acceptance Criteria: default field accepts string
     */
    const question = QuestionSchema.parse({
      ...validQuestion,
      options: ['bash', 'python'],
      default: 'bash',
    });
    expect(question.default).toBe('bash');
  });

  it('parses question with default value (boolean)', () => {
    /**
     * Purpose: Proves Question supports boolean default for confirm type
     * Quality Contribution: Enables pre-filled confirm dialogs
     * Acceptance Criteria: default field accepts boolean
     */
    const question = QuestionSchema.parse({
      question_id: 'q-456',
      node_id: 'node-1',
      type: 'confirm',
      text: 'Continue?',
      asked_at: '2026-02-03T10:32:00Z',
      default: true,
    });
    expect(question.default).toBe(true);
  });

  it('parses answered question with answer and answered_at', () => {
    /**
     * Purpose: Proves answered questions store answer and timestamp
     * Quality Contribution: Enables answer retrieval in Q&A protocol
     * Acceptance Criteria: answer and answered_at fields parse
     */
    const question = QuestionSchema.parse({
      ...validQuestion,
      options: ['bash', 'python'],
      answer: 'bash',
      answered_at: '2026-02-03T10:33:00Z',
    });
    expect(question.answer).toBe('bash');
    expect(question.answered_at).toBe('2026-02-03T10:33:00Z');
  });

  it('rejects question without question_id', () => {
    const { question_id, ...noId } = validQuestion;
    const result = QuestionSchema.safeParse(noId);
    expect(result.success).toBe(false);
  });

  it('rejects question without node_id', () => {
    const { node_id, ...noNodeId } = validQuestion;
    const result = QuestionSchema.safeParse(noNodeId);
    expect(result.success).toBe(false);
  });

  it('rejects invalid question type', () => {
    /**
     * Purpose: Proves type enum is enforced
     * Quality Contribution: Prevents invalid question types
     * Acceptance Criteria: Invalid type is rejected
     */
    const result = QuestionSchema.safeParse({
      ...validQuestion,
      type: 'dropdown',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty text', () => {
    const result = QuestionSchema.safeParse({
      ...validQuestion,
      text: '',
    });
    expect(result.success).toBe(false);
  });
});

// ============================================
// NodeStateEntryErrorSchema (Plan 028)
// ============================================

describe('NodeStateEntryErrorSchema', () => {
  it('parses error with code and message', () => {
    /**
     * Purpose: Proves error schema captures structured error info
     * Quality Contribution: Enables error tracking in node state
     * Acceptance Criteria: Error with code and message parses
     */
    const error = NodeStateEntryErrorSchema.parse({
      code: 'E172',
      message: 'Invalid state transition',
    });
    expect(error.code).toBe('E172');
    expect(error.message).toBe('Invalid state transition');
  });

  it('parses error with optional details', () => {
    const error = NodeStateEntryErrorSchema.parse({
      code: 'E175',
      message: 'Missing outputs',
      details: { missing: ['script', 'language'] },
    });
    expect(error.details).toEqual({ missing: ['script', 'language'] });
  });

  it('rejects error without code', () => {
    const result = NodeStateEntryErrorSchema.safeParse({
      message: 'Something went wrong',
    });
    expect(result.success).toBe(false);
  });

  it('rejects error without message', () => {
    const result = NodeStateEntryErrorSchema.safeParse({
      code: 'E172',
    });
    expect(result.success).toBe(false);
  });
});

// ============================================
// NodeStateEntrySchema Extended (Plan 028)
// ============================================

describe('NodeStateEntrySchema extended fields', () => {
  it('accepts optional pending_question_id', () => {
    /**
     * Purpose: Proves NodeStateEntry can track pending question
     * Quality Contribution: Enables Q&A protocol state tracking
     * Acceptance Criteria: pending_question_id is optional and valid
     */
    const entry = NodeStateEntrySchema.parse({
      status: 'waiting-question',
      started_at: '2026-02-01T10:00:00Z',
      pending_question_id: '2026-02-03T10:32:00.000Z_f4e',
    });
    expect(entry.pending_question_id).toBe('2026-02-03T10:32:00.000Z_f4e');
  });

  it('accepts optional error object', () => {
    /**
     * Purpose: Proves NodeStateEntry can track error details
     * Quality Contribution: Enables error tracking in blocked-error state
     * Acceptance Criteria: error object with code, message parses
     */
    const entry = NodeStateEntrySchema.parse({
      status: 'blocked-error',
      started_at: '2026-02-01T10:00:00Z',
      error: {
        code: 'E175',
        message: 'Missing required outputs',
      },
    });
    expect(entry.error?.code).toBe('E175');
    expect(entry.error?.message).toBe('Missing required outputs');
  });

  it('accepts error with details', () => {
    const entry = NodeStateEntrySchema.parse({
      status: 'blocked-error',
      started_at: '2026-02-01T10:00:00Z',
      error: {
        code: 'E175',
        message: 'Missing required outputs',
        details: { missing: ['script'] },
      },
    });
    expect(entry.error?.details).toEqual({ missing: ['script'] });
  });

  it('backward compatible - existing state.json still parses', () => {
    /**
     * Purpose: Proves backward compatibility with existing state.json files
     * Quality Contribution: Prevents breaking changes during migration
     * Acceptance Criteria: Old NodeStateEntry without new fields parses
     */
    const entry = NodeStateEntrySchema.parse({
      status: 'complete',
      started_at: '2026-02-01T10:00:00Z',
      completed_at: '2026-02-01T10:05:00Z',
    });
    expect(entry.status).toBe('complete');
    expect(entry.pending_question_id).toBeUndefined();
    expect(entry.error).toBeUndefined();
  });
});
