/**
 * Embedded core schemas for runtime use.
 *
 * Per DYK-01: esbuild bundles JavaScript only, not raw JSON files.
 * These schemas are embedded as TypeScript modules to ensure they're
 * available at runtime in the production CLI bundle.
 *
 * Source: packages/workflow/schemas/*.json
 */

/**
 * Workflow definition schema (wf.yaml validation).
 */
export const WF_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://chainglass.dev/schemas/wf.schema.json',
  title: 'Workflow Definition',
  description: 'Schema for workflow definition files (wf.yaml)',
  type: 'object',
  required: ['name', 'version', 'phases'],
  properties: {
    name: {
      type: 'string',
      description: 'Workflow template name (slug format)',
      pattern: '^[a-z][a-z0-9-]*$',
    },
    version: {
      type: 'string',
      description: 'Semantic version of the workflow template',
      pattern: '^\\d+\\.\\d+\\.\\d+$',
    },
    description: {
      type: 'string',
      description: 'Human-readable description of the workflow',
    },
    phases: {
      type: 'object',
      description: 'Phase definitions keyed by phase name',
      additionalProperties: {
        $ref: '#/$defs/phase',
      },
      minProperties: 1,
    },
  },
  $defs: {
    phase: {
      type: 'object',
      required: ['description', 'order', 'outputs'],
      properties: {
        description: {
          type: 'string',
          description: 'Human-readable description of this phase',
        },
        order: {
          type: 'integer',
          minimum: 1,
          description: 'Execution order (1-based)',
        },
        inputs: {
          $ref: '#/$defs/inputs',
          description: 'Inputs required for this phase',
        },
        outputs: {
          type: 'array',
          items: { $ref: '#/$defs/output' },
          minItems: 1,
          description: 'Outputs produced by this phase',
        },
        output_parameters: {
          type: 'array',
          items: { $ref: '#/$defs/outputParameter' },
          description: 'Parameters extracted from outputs for downstream phases',
        },
      },
    },
    inputs: {
      type: 'object',
      description: 'Inputs required for this phase, split by type',
      properties: {
        files: {
          type: 'array',
          items: { $ref: '#/$defs/fileInput' },
          description: 'File inputs for this phase',
        },
        parameters: {
          type: 'array',
          items: { $ref: '#/$defs/parameterInput' },
          description: 'Parameter inputs from prior phases',
        },
        messages: {
          type: 'array',
          items: { $ref: '#/$defs/messageInput' },
          description: 'Message input declarations for agent-orchestrator communication',
        },
      },
    },
    fileInput: {
      type: 'object',
      required: ['name', 'required'],
      properties: {
        name: {
          type: 'string',
          description: 'Input file name (must match source output name if from_phase is specified)',
        },
        required: {
          type: 'boolean',
          description: 'Whether this input is required',
        },
        description: {
          type: 'string',
          description: 'Human-readable description',
        },
        from_phase: {
          type: 'string',
          description: 'Source phase for cross-phase inputs',
        },
      },
    },
    parameterInput: {
      type: 'object',
      required: ['name', 'required'],
      properties: {
        name: {
          type: 'string',
          description: 'Parameter name (must match source output_parameter name)',
        },
        required: {
          type: 'boolean',
          description: 'Whether this parameter is required',
        },
        description: {
          type: 'string',
          description: 'Human-readable description',
        },
        from_phase: {
          type: 'string',
          description: 'Source phase that publishes this parameter',
        },
      },
    },
    messageInput: {
      type: 'object',
      required: ['id', 'type', 'from', 'required', 'subject'],
      properties: {
        id: {
          type: 'string',
          pattern: '^[0-9]{3}$',
          description: 'Expected message ID (without m- prefix, becomes m-{id}.json)',
        },
        type: {
          type: 'string',
          enum: ['single_choice', 'multi_choice', 'free_text', 'confirm'],
          description: 'Expected message type',
        },
        from: {
          type: 'string',
          enum: ['agent', 'orchestrator'],
          description: 'Who creates this message',
        },
        required: {
          type: 'boolean',
          description: 'Whether this message must exist',
        },
        subject: {
          type: 'string',
          description: 'Subject line for the message',
        },
        prompt: {
          type: 'string',
          description: 'Guidance text for orchestrator UI or agent',
        },
        options: {
          type: 'array',
          items: { $ref: '#/$defs/messageOption' },
          description: 'Pre-defined options for choice message types',
        },
        description: {
          type: 'string',
          description: 'Documentation for humans',
        },
      },
    },
    messageOption: {
      type: 'object',
      required: ['key', 'label'],
      properties: {
        key: {
          type: 'string',
          pattern: '^[A-Z]$',
          description: 'Single letter key (A, B, C, etc.)',
        },
        label: {
          type: 'string',
          description: 'Short label for the option',
        },
        description: {
          type: 'string',
          description: 'Longer description of the option',
        },
      },
    },
    output: {
      type: 'object',
      required: ['name', 'type', 'required'],
      properties: {
        name: {
          type: 'string',
          description: 'Output name',
        },
        type: {
          type: 'string',
          enum: ['file'],
          description: 'Output type (currently only file supported)',
        },
        required: {
          type: 'boolean',
          description: 'Whether this output is required',
        },
        schema: {
          type: 'string',
          description: 'Path to JSON Schema for validation (relative to template)',
        },
        description: {
          type: 'string',
          description: 'Human-readable description',
        },
      },
    },
    outputParameter: {
      type: 'object',
      required: ['name', 'source', 'query'],
      properties: {
        name: {
          type: 'string',
          description: 'Parameter name for downstream reference',
        },
        source: {
          type: 'string',
          description: 'Source output file name',
        },
        query: {
          type: 'string',
          description: "Dot-notation path to extract value (e.g., 'items.length')",
        },
        description: {
          type: 'string',
          description: 'Human-readable description',
        },
      },
    },
  },
} as const;

/**
 * Phase state schema (wf-data/wf-phase.json validation).
 */
export const WF_PHASE_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://chainglass.dev/schemas/wf-phase.schema.json',
  title: 'Workflow Phase State',
  description: 'Schema for phase state tracking (wf-data/wf-phase.json)',
  type: 'object',
  required: ['phase', 'facilitator', 'state', 'status'],
  properties: {
    phase: {
      type: 'string',
      description: "Phase name (e.g., 'gather', 'process', 'report')",
    },
    facilitator: {
      type: 'string',
      enum: ['agent', 'orchestrator'],
      description: 'Current control holder',
    },
    state: {
      type: 'string',
      enum: ['pending', 'active', 'blocked', 'accepted', 'complete', 'failed'],
      description: 'Current phase state',
    },
    status: {
      type: 'array',
      items: { $ref: '#/$defs/statusEntry' },
      description: 'Append-only history of all interactions',
    },
  },
  $defs: {
    statusEntry: {
      type: 'object',
      required: ['timestamp', 'from', 'action'],
      properties: {
        timestamp: {
          type: 'string',
          format: 'date-time',
          description: 'ISO-8601 timestamp of the action',
        },
        from: {
          type: 'string',
          enum: ['agent', 'orchestrator'],
          description: 'Actor who performed the action',
        },
        action: {
          type: 'string',
          enum: [
            'prepare',
            'input',
            'handover',
            'accept',
            'preflight',
            'question',
            'error',
            'answer',
            'finalize',
          ],
          description: 'Type of action performed',
        },
        message_id: {
          type: 'string',
          pattern: '^[0-9]{3}$',
          description: 'Message ID reference (for input, question, answer actions)',
        },
        comment: {
          type: 'string',
          description: 'Human-readable description of the action',
        },
        data: {
          type: 'object',
          description: 'Optional payload data for the action',
          additionalProperties: true,
        },
      },
    },
  },
} as const;

/**
 * Message schema (agent-orchestrator communication).
 */
export const MESSAGE_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://chainglass.dev/schemas/message.schema.json',
  title: 'Workflow Message',
  description: 'Schema for agent-orchestrator communication messages',
  type: 'object',
  required: ['id', 'created_at', 'from', 'type', 'subject', 'body'],
  properties: {
    id: {
      type: 'string',
      pattern: '^[0-9]{3}$',
      description: "Message ID (3-digit sequential, e.g., '001')",
    },
    created_at: {
      type: 'string',
      format: 'date-time',
      description: 'ISO-8601 timestamp when message was created',
    },
    from: {
      type: 'string',
      enum: ['agent', 'orchestrator'],
      description: 'Who created the message',
    },
    type: {
      type: 'string',
      enum: ['single_choice', 'multi_choice', 'free_text', 'confirm'],
      description: 'Message type determining answer format',
    },
    subject: {
      type: 'string',
      minLength: 1,
      description: 'Brief subject line for the message',
    },
    body: {
      type: 'string',
      minLength: 1,
      description: 'Full message text with context',
    },
    note: {
      type: ['string', 'null'],
      description: 'Optional creator note for audit/context',
    },
    options: {
      type: 'array',
      items: { $ref: '#/$defs/option' },
      minItems: 2,
      description: 'Available options for choice types',
    },
    answer: {
      $ref: '#/$defs/answer',
      description: 'Answer to the message (added when answered)',
    },
  },
  allOf: [
    {
      if: {
        properties: { type: { const: 'single_choice' } },
        required: ['type'],
      },
      // biome-ignore lint/suspicious/noThenProperty: JSON Schema if/then/else conditional
      then: {
        properties: {
          options: {
            type: 'array',
            items: { $ref: '#/$defs/option' },
            minItems: 2,
          },
        },
        required: ['options'],
      },
    },
    {
      if: {
        properties: { type: { const: 'multi_choice' } },
        required: ['type'],
      },
      // biome-ignore lint/suspicious/noThenProperty: JSON Schema if/then/else conditional
      then: {
        properties: {
          options: {
            type: 'array',
            items: { $ref: '#/$defs/option' },
            minItems: 2,
          },
        },
        required: ['options'],
      },
    },
  ],
  $defs: {
    option: {
      type: 'object',
      required: ['key', 'label'],
      properties: {
        key: {
          type: 'string',
          pattern: '^[A-Z]$',
          description: 'Single letter key (A, B, C, etc.)',
        },
        label: {
          type: 'string',
          minLength: 1,
          description: 'Short label for the option',
        },
        description: {
          type: 'string',
          description: 'Longer description of the option',
        },
      },
    },
    answer: {
      type: 'object',
      required: ['answered_at'],
      properties: {
        answered_at: {
          type: 'string',
          format: 'date-time',
          description: 'ISO-8601 timestamp when answer was provided',
        },
        selected: {
          type: 'array',
          items: { type: 'string', pattern: '^[A-Z]$' },
          minItems: 1,
          description: 'Selected option keys',
        },
        text: {
          type: 'string',
          description: 'Free text response (for free_text type)',
        },
        confirmed: {
          type: 'boolean',
          description: 'Confirmation result (for confirm type)',
        },
        note: {
          type: ['string', 'null'],
          description: "Optional note with answerer's rationale",
        },
      },
    },
  },
} as const;

/**
 * Run status schema (wf-run/wf-status.json validation).
 */
export const WF_STATUS_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://chainglass.dev/schemas/wf-status.schema.json',
  title: 'Workflow Run Status',
  description: 'Schema for workflow run status tracking (wf-run/wf-status.json)',
  type: 'object',
  required: ['workflow', 'run', 'phases'],
  properties: {
    workflow: {
      type: 'object',
      required: ['name', 'version', 'template_path'],
      properties: {
        name: {
          type: 'string',
          description: 'Workflow template name (slug format)',
          pattern: '^[a-z][a-z0-9-]*$',
        },
        version: {
          type: 'string',
          description: 'Semantic version of the workflow template',
          pattern: '^\\d+\\.\\d+\\.\\d+$',
        },
        template_path: {
          type: 'string',
          description: 'Relative or absolute path to the source template',
        },
      },
    },
    run: {
      type: 'object',
      required: ['id', 'created_at', 'status'],
      properties: {
        id: {
          type: 'string',
          description: "Unique run identifier (e.g., 'exemplar-run-example-001')",
        },
        created_at: {
          type: 'string',
          format: 'date-time',
          description: 'ISO-8601 timestamp when run was created',
        },
        status: {
          type: 'string',
          enum: ['pending', 'active', 'complete', 'failed'],
          description: 'Overall run status',
        },
      },
    },
    phases: {
      type: 'object',
      description: 'Phase status entries keyed by phase name',
      additionalProperties: {
        $ref: '#/$defs/phaseStatus',
      },
      minProperties: 1,
    },
  },
  $defs: {
    phaseStatus: {
      type: 'object',
      required: ['order', 'status'],
      properties: {
        order: {
          type: 'integer',
          minimum: 1,
          description: 'Execution order (1-based)',
        },
        status: {
          type: 'string',
          enum: ['pending', 'ready', 'active', 'blocked', 'accepted', 'complete', 'failed'],
          description: 'Current phase status',
        },
        started_at: {
          type: 'string',
          format: 'date-time',
          description: 'ISO-8601 timestamp when phase started',
        },
        completed_at: {
          type: 'string',
          format: 'date-time',
          description: 'ISO-8601 timestamp when phase completed',
        },
      },
    },
  },
} as const;
