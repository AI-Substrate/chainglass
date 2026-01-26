/**
 * Tests for Phase entity class.
 *
 * Per Phase 1: Entity Interfaces & Pure Data Classes - TDD RED first.
 * Per Plan § Entity Data Models: Phase has 20+ nested properties across 7 field groups.
 * Per DYK-03: toJSON() uses camelCase keys, undefined→null, Date→ISO string, recursive.
 *
 * The Phase entity is the unified model - same structure for template and run phases.
 */

import type { PhaseRunStatus, PhaseState } from '@chainglass/workflow';
import { Phase } from '@chainglass/workflow';
import { describe, expect, it } from 'vitest';

// ==================== T010: Phase entity tests ====================

describe('Phase entity', () => {
  describe('constructor with basic fields', () => {
    it('should create a Phase with identity fields', () => {
      /*
      Test Doc:
      - Why: Phase must capture identity (name, phaseDir, runDir)
      - Contract: Phase has readonly name, phaseDir, runDir properties
      - Usage Notes: runDir is parent run directory for navigation
      - Quality Contribution: Ensures phase can be located on filesystem
      - Worked Example: Phase with name='gather', phaseDir='/path/gather'
      */
      const phase = new Phase({
        name: 'gather',
        phaseDir: '/path/to/run/gather',
        runDir: '/path/to/run',
        description: 'Gather phase',
        order: 1,
        status: 'pending',
        facilitator: 'orchestrator',
        state: 'pending',
      });

      expect(phase.name).toBe('gather');
      expect(phase.phaseDir).toBe('/path/to/run/gather');
      expect(phase.runDir).toBe('/path/to/run');
      expect(phase.description).toBe('Gather phase');
      expect(phase.order).toBe(1);
    });

    it('should have readonly status fields', () => {
      const phase = new Phase({
        name: 'process',
        phaseDir: '/path',
        runDir: '/run',
        description: 'Process',
        order: 2,
        status: 'active',
        facilitator: 'agent',
        state: 'active',
      });

      expect(phase.status).toBe('active');
      expect(phase.facilitator).toBe('agent');
      expect(phase.state).toBe('active');
    });
  });

  describe('inputFiles array', () => {
    it('should store input files with exists flag', () => {
      const phase = new Phase({
        name: 'gather',
        phaseDir: '/path',
        runDir: '/run',
        description: 'Test',
        order: 1,
        status: 'pending',
        facilitator: 'orchestrator',
        state: 'pending',
        inputFiles: [
          {
            name: 'data.json',
            required: true,
            description: 'Input data',
            exists: true,
            path: '/path/inputs/data.json',
          },
          {
            name: 'config.yaml',
            required: false,
            fromPhase: 'setup',
            exists: false,
            path: '/path/inputs/config.yaml',
          },
        ],
      });

      expect(phase.inputFiles).toHaveLength(2);
      expect(phase.inputFiles[0].name).toBe('data.json');
      expect(phase.inputFiles[0].required).toBe(true);
      expect(phase.inputFiles[0].exists).toBe(true);
      expect(phase.inputFiles[1].fromPhase).toBe('setup');
      expect(phase.inputFiles[1].exists).toBe(false);
    });
  });

  describe('inputParameters array', () => {
    it('should store input parameters with resolved values', () => {
      const phase = new Phase({
        name: 'process',
        phaseDir: '/path',
        runDir: '/run',
        description: 'Test',
        order: 2,
        status: 'pending',
        facilitator: 'orchestrator',
        state: 'pending',
        inputParameters: [
          {
            name: 'count',
            required: true,
            fromPhase: 'gather',
            value: 42,
          },
          {
            name: 'optional',
            required: false,
            value: undefined,
          },
        ],
      });

      expect(phase.inputParameters).toHaveLength(2);
      expect(phase.inputParameters[0].value).toBe(42);
      expect(phase.inputParameters[1].value).toBeUndefined();
    });
  });

  describe('inputMessages array', () => {
    it('should store input messages with exists/answered flags', () => {
      const phase = new Phase({
        name: 'gather',
        phaseDir: '/path',
        runDir: '/run',
        description: 'Test',
        order: 1,
        status: 'blocked',
        facilitator: 'agent',
        state: 'blocked',
        inputMessages: [
          {
            id: '001',
            type: 'single_choice',
            from: 'orchestrator',
            required: true,
            subject: 'Choose option',
            options: [
              { key: 'A', label: 'Option A' },
              { key: 'B', label: 'Option B' },
            ],
            exists: true,
            answered: false,
          },
        ],
      });

      expect(phase.inputMessages).toHaveLength(1);
      expect(phase.inputMessages[0].type).toBe('single_choice');
      expect(phase.inputMessages[0].exists).toBe(true);
      expect(phase.inputMessages[0].answered).toBe(false);
    });
  });

  describe('outputs array', () => {
    it('should store outputs with exists/valid flags', () => {
      const phase = new Phase({
        name: 'process',
        phaseDir: '/path',
        runDir: '/run',
        description: 'Test',
        order: 2,
        status: 'complete',
        facilitator: 'orchestrator',
        state: 'complete',
        outputs: [
          {
            name: 'result.json',
            type: 'file',
            required: true,
            schema: 'result.schema.json',
            exists: true,
            valid: true,
            path: '/path/outputs/result.json',
          },
        ],
      });

      expect(phase.outputs).toHaveLength(1);
      expect(phase.outputs[0].exists).toBe(true);
      expect(phase.outputs[0].valid).toBe(true);
    });
  });

  describe('outputParameters array', () => {
    it('should store output parameters with extracted values', () => {
      const phase = new Phase({
        name: 'process',
        phaseDir: '/path',
        runDir: '/run',
        description: 'Test',
        order: 2,
        status: 'complete',
        facilitator: 'orchestrator',
        state: 'complete',
        outputParameters: [
          {
            name: 'itemCount',
            source: 'result.json',
            query: 'items.length',
            value: 5,
          },
        ],
      });

      expect(phase.outputParameters).toHaveLength(1);
      expect(phase.outputParameters[0].value).toBe(5);
    });
  });

  describe('statusHistory array', () => {
    it('should store status history entries', () => {
      const phase = new Phase({
        name: 'gather',
        phaseDir: '/path',
        runDir: '/run',
        description: 'Test',
        order: 1,
        status: 'complete',
        facilitator: 'orchestrator',
        state: 'complete',
        statusHistory: [
          {
            timestamp: '2026-01-25T10:00:00Z',
            from: 'orchestrator',
            action: 'prepare',
            comment: 'Started preparation',
          },
          {
            timestamp: '2026-01-25T10:05:00Z',
            from: 'agent',
            action: 'finalize',
            comment: 'Completed',
          },
        ],
      });

      expect(phase.statusHistory).toHaveLength(2);
      expect(phase.statusHistory[0].action).toBe('prepare');
      expect(phase.statusHistory[1].action).toBe('finalize');
    });
  });

  describe('runtime timing fields', () => {
    it('should store startedAt and completedAt as Date objects', () => {
      const startedAt = new Date('2026-01-25T10:00:00Z');
      const completedAt = new Date('2026-01-25T10:30:00Z');
      const phase = new Phase({
        name: 'process',
        phaseDir: '/path',
        runDir: '/run',
        description: 'Test',
        order: 2,
        status: 'complete',
        facilitator: 'orchestrator',
        state: 'complete',
        startedAt,
        completedAt,
      });

      expect(phase.startedAt).toEqual(startedAt);
      expect(phase.completedAt).toEqual(completedAt);
    });
  });

  describe('computed property: duration', () => {
    it('should return duration in ms when both times are set', () => {
      const startedAt = new Date('2026-01-25T10:00:00Z');
      const completedAt = new Date('2026-01-25T10:30:00Z');
      const phase = new Phase({
        name: 'process',
        phaseDir: '/path',
        runDir: '/run',
        description: 'Test',
        order: 2,
        status: 'complete',
        facilitator: 'orchestrator',
        state: 'complete',
        startedAt,
        completedAt,
      });

      expect(phase.duration).toBe(30 * 60 * 1000); // 30 minutes in ms
    });

    it('should return undefined when times are not set', () => {
      const phase = new Phase({
        name: 'process',
        phaseDir: '/path',
        runDir: '/run',
        description: 'Test',
        order: 2,
        status: 'pending',
        facilitator: 'orchestrator',
        state: 'pending',
      });

      expect(phase.duration).toBeUndefined();
    });
  });

  describe('status helper computed properties', () => {
    const createPhaseWithStatus = (status: PhaseRunStatus) =>
      new Phase({
        name: 'test',
        phaseDir: '/path',
        runDir: '/run',
        description: 'Test',
        order: 1,
        status: status,
        facilitator: 'orchestrator',
        state: status as PhaseState,
      });

    it('should have isPending computed property', () => {
      expect(createPhaseWithStatus('pending').isPending).toBe(true);
      expect(createPhaseWithStatus('active').isPending).toBe(false);
    });

    it('should have isReady computed property', () => {
      expect(createPhaseWithStatus('ready').isReady).toBe(true);
      expect(createPhaseWithStatus('pending').isReady).toBe(false);
    });

    it('should have isActive computed property', () => {
      expect(createPhaseWithStatus('active').isActive).toBe(true);
      expect(createPhaseWithStatus('pending').isActive).toBe(false);
    });

    it('should have isBlocked computed property', () => {
      expect(createPhaseWithStatus('blocked').isBlocked).toBe(true);
      expect(createPhaseWithStatus('active').isBlocked).toBe(false);
    });

    it('should have isComplete computed property', () => {
      expect(createPhaseWithStatus('complete').isComplete).toBe(true);
      expect(createPhaseWithStatus('failed').isComplete).toBe(false);
    });

    it('should have isFailed computed property', () => {
      expect(createPhaseWithStatus('failed').isFailed).toBe(true);
      expect(createPhaseWithStatus('complete').isFailed).toBe(false);
    });

    it('should have isDone computed property (complete OR failed)', () => {
      expect(createPhaseWithStatus('complete').isDone).toBe(true);
      expect(createPhaseWithStatus('failed').isDone).toBe(true);
      expect(createPhaseWithStatus('active').isDone).toBe(false);
    });
  });

  describe('toJSON() serialization', () => {
    it('should serialize with camelCase keys', () => {
      const phase = new Phase({
        name: 'gather',
        phaseDir: '/path',
        runDir: '/run',
        description: 'Test',
        order: 1,
        status: 'pending',
        facilitator: 'orchestrator',
        state: 'pending',
      });

      const json = phase.toJSON();

      expect(json.name).toBe('gather');
      expect(json.phaseDir).toBe('/path');
      expect(json.runDir).toBe('/run');
      expect(json.description).toBe('Test');
      expect(json.order).toBe(1);
      expect(json.status).toBe('pending');
      expect(json.facilitator).toBe('orchestrator');
      expect(json.state).toBe('pending');
    });

    it('should serialize undefined as null', () => {
      const phase = new Phase({
        name: 'gather',
        phaseDir: '/path',
        runDir: '/run',
        description: 'Test',
        order: 1,
        status: 'pending',
        facilitator: 'orchestrator',
        state: 'pending',
      });

      const json = phase.toJSON();

      expect(json.startedAt).toBeNull();
      expect(json.completedAt).toBeNull();
      expect(json.duration).toBeNull();
    });

    it('should serialize Date as ISO string', () => {
      const startedAt = new Date('2026-01-25T10:00:00Z');
      const completedAt = new Date('2026-01-25T10:30:00Z');
      const phase = new Phase({
        name: 'process',
        phaseDir: '/path',
        runDir: '/run',
        description: 'Test',
        order: 2,
        status: 'complete',
        facilitator: 'orchestrator',
        state: 'complete',
        startedAt,
        completedAt,
      });

      const json = phase.toJSON();

      expect(json.startedAt).toBe('2026-01-25T10:00:00.000Z');
      expect(json.completedAt).toBe('2026-01-25T10:30:00.000Z');
    });

    it('should serialize arrays recursively', () => {
      const phase = new Phase({
        name: 'gather',
        phaseDir: '/path',
        runDir: '/run',
        description: 'Test',
        order: 1,
        status: 'pending',
        facilitator: 'orchestrator',
        state: 'pending',
        inputFiles: [
          {
            name: 'data.json',
            required: true,
            exists: false,
            path: '/path/inputs/data.json',
          },
        ],
        outputs: [
          {
            name: 'result.json',
            type: 'file',
            required: true,
            exists: false,
            valid: false,
            path: '/path/outputs/result.json',
          },
        ],
      });

      const json = phase.toJSON();

      expect(Array.isArray(json.inputFiles)).toBe(true);
      expect(json.inputFiles).toHaveLength(1);
      expect(json.inputFiles[0].name).toBe('data.json');

      expect(Array.isArray(json.outputs)).toBe(true);
      expect(json.outputs).toHaveLength(1);
      expect(json.outputs[0].name).toBe('result.json');
    });

    it('should include computed status helper flags', () => {
      const phase = new Phase({
        name: 'process',
        phaseDir: '/path',
        runDir: '/run',
        description: 'Test',
        order: 2,
        status: 'complete',
        facilitator: 'orchestrator',
        state: 'complete',
      });

      const json = phase.toJSON();

      expect(json.isPending).toBe(false);
      expect(json.isReady).toBe(false);
      expect(json.isActive).toBe(false);
      expect(json.isBlocked).toBe(false);
      expect(json.isComplete).toBe(true);
      expect(json.isFailed).toBe(false);
      expect(json.isDone).toBe(true);
    });
  });

  describe('template vs run phase (same structure)', () => {
    it('should have same structure for template phase (unpopulated)', () => {
      /*
      Test Doc:
      - Why: Per Key Invariant 2, template and run phases have same structure
      - Contract: Template phase has exists=false, values undefined, status='pending'
      - Usage Notes: Template phases come from current/ or checkpoints/
      - Quality Contribution: Ensures unified model
      - Worked Example: Template phase with unpopulated values
      */
      const templatePhase = new Phase({
        name: 'gather',
        phaseDir: '/path/current/gather',
        runDir: '/path/current',
        description: 'Gather data',
        order: 1,
        status: 'pending',
        facilitator: 'orchestrator',
        state: 'pending',
        inputFiles: [
          {
            name: 'data.json',
            required: true,
            exists: false, // Template: file doesn't exist yet
            path: '/path/inputs/data.json',
          },
        ],
        inputParameters: [
          {
            name: 'count',
            required: true,
            fromPhase: 'setup',
            value: undefined, // Template: not resolved
          },
        ],
      });

      expect(templatePhase.inputFiles[0].exists).toBe(false);
      expect(templatePhase.inputParameters[0].value).toBeUndefined();
      expect(templatePhase.status).toBe('pending');
    });

    it('should have same structure for run phase (populated)', () => {
      const runPhase = new Phase({
        name: 'gather',
        phaseDir: '/path/run-001/gather',
        runDir: '/path/run-001',
        description: 'Gather data',
        order: 1,
        status: 'complete',
        facilitator: 'orchestrator',
        state: 'complete',
        startedAt: new Date('2026-01-25T10:00:00Z'),
        completedAt: new Date('2026-01-25T10:30:00Z'),
        inputFiles: [
          {
            name: 'data.json',
            required: true,
            exists: true, // Run: file exists
            path: '/path/run-001/gather/inputs/data.json',
          },
        ],
        inputParameters: [
          {
            name: 'count',
            required: true,
            fromPhase: 'setup',
            value: 42, // Run: resolved
          },
        ],
      });

      expect(runPhase.inputFiles[0].exists).toBe(true);
      expect(runPhase.inputParameters[0].value).toBe(42);
      expect(runPhase.status).toBe('complete');
      expect(runPhase.duration).toBe(30 * 60 * 1000);
    });
  });
});
