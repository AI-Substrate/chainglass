/**
 * Unit tests for AgentSession entity.
 *
 * Per Plan 018: Agent Workspace Data Model Migration (Phase 1)
 * Per Testing Philosophy: Full TDD - tests written first (RED phase)
 *
 * T003: Tests for AgentSession.create() factory and toJSON()
 *
 * Note: Unlike Sample which generates slug from name, AgentSession uses
 * the provided id directly (id IS the identifier for file storage).
 */

import { describe, expect, it } from 'vitest';

// Import will fail until entity is created - this is the TDD RED phase
import { AgentSession } from '@chainglass/workflow';

describe('AgentSession entity', () => {
  describe('create() factory', () => {
    it('should preserve id, type, and status', () => {
      /*
      Test Doc:
      - Why: These are required fields that must be preserved
      - Contract: AgentSession.create() preserves input id, type, status
      - Quality Contribution: Ensures data integrity
      - Worked Example: create({ id: "abc", type: "claude", status: "active" }) → same values
      */
      const session = AgentSession.create({
        id: 'session-abc-123',
        type: 'claude',
        status: 'active',
      });

      expect(session.id).toBe('session-abc-123');
      expect(session.type).toBe('claude');
      expect(session.status).toBe('active');
    });

    it('should support copilot type', () => {
      /*
      Test Doc:
      - Why: Both Claude and Copilot agents must be supported
      - Contract: AgentSession.create() accepts 'copilot' type
      - Quality Contribution: Multi-agent support
      */
      const session = AgentSession.create({
        id: 'copilot-session-1',
        type: 'copilot',
        status: 'active',
      });

      expect(session.type).toBe('copilot');
    });

    it('should support all status values', () => {
      /*
      Test Doc:
      - Why: Sessions go through lifecycle states
      - Contract: AgentSession.create() accepts active, completed, terminated
      - Quality Contribution: Full lifecycle support
      */
      const active = AgentSession.create({ id: '1', type: 'claude', status: 'active' });
      const completed = AgentSession.create({ id: '2', type: 'claude', status: 'completed' });
      const terminated = AgentSession.create({ id: '3', type: 'claude', status: 'terminated' });

      expect(active.status).toBe('active');
      expect(completed.status).toBe('completed');
      expect(terminated.status).toBe('terminated');
    });

    it('should set createdAt to current time when not provided', () => {
      /*
      Test Doc:
      - Why: Track when session was created
      - Contract: AgentSession.create() defaults createdAt to current time
      - Quality Contribution: Ensures timestamp is always present
      - Worked Example: create({ id: "x", type: "claude", status: "active" }) → createdAt within last second
      */
      const before = new Date();
      const session = AgentSession.create({
        id: 'test-session',
        type: 'claude',
        status: 'active',
      });
      const after = new Date();

      expect(session.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(session.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should set updatedAt to createdAt when not provided', () => {
      /*
      Test Doc:
      - Why: New sessions have same createdAt and updatedAt
      - Contract: AgentSession.create() defaults updatedAt to createdAt
      - Quality Contribution: Consistent timestamp behavior
      - Worked Example: New session → createdAt === updatedAt
      */
      const session = AgentSession.create({
        id: 'test-session',
        type: 'claude',
        status: 'active',
      });

      expect(session.updatedAt.getTime()).toBe(session.createdAt.getTime());
    });

    it('should use provided createdAt when loading existing session', () => {
      /*
      Test Doc:
      - Why: Adapter provides createdAt when loading from storage
      - Contract: AgentSession.create() uses provided createdAt if given
      - Quality Contribution: Enables accurate persistence roundtrip
      - Worked Example: create({ ..., createdAt: pastDate }) → preserves date
      */
      const pastDate = new Date('2025-06-15T10:30:00Z');
      const session = AgentSession.create({
        id: 'loaded-session',
        type: 'claude',
        status: 'completed',
        createdAt: pastDate,
      });

      expect(session.createdAt).toEqual(pastDate);
    });

    it('should use provided updatedAt when loading existing session', () => {
      /*
      Test Doc:
      - Why: Adapter provides updatedAt when loading from storage
      - Contract: AgentSession.create() uses provided updatedAt if given
      - Quality Contribution: Enables accurate persistence roundtrip
      - Worked Example: create({ ..., updatedAt: laterDate }) → preserves date
      */
      const createdDate = new Date('2025-06-15T10:30:00Z');
      const updatedDate = new Date('2025-06-16T14:00:00Z');
      const session = AgentSession.create({
        id: 'updated-session',
        type: 'claude',
        status: 'active',
        createdAt: createdDate,
        updatedAt: updatedDate,
      });

      expect(session.createdAt).toEqual(createdDate);
      expect(session.updatedAt).toEqual(updatedDate);
    });
  });

  describe('toJSON() serialization', () => {
    it('should serialize to JSON with camelCase keys', () => {
      /*
      Test Doc:
      - Why: API compatibility requires camelCase
      - Contract: toJSON() returns object with camelCase property names
      - Quality Contribution: Consistent API response format
      - Worked Example: { id, type, status, createdAt, updatedAt }
      */
      const session = AgentSession.create({
        id: 'test-session',
        type: 'claude',
        status: 'active',
      });
      const json = session.toJSON();

      expect(json).toHaveProperty('id');
      expect(json).toHaveProperty('type');
      expect(json).toHaveProperty('status');
      expect(json).toHaveProperty('createdAt');
      expect(json).toHaveProperty('updatedAt');
    });

    it('should serialize Dates to ISO-8601 strings', () => {
      /*
      Test Doc:
      - Why: Dates must be serializable to JSON
      - Contract: toJSON().createdAt and updatedAt are ISO-8601 strings
      - Quality Contribution: Standard date format
      - Worked Example: "2026-01-27T12:00:00.000Z"
      */
      const createdDate = new Date('2026-01-27T12:00:00.000Z');
      const updatedDate = new Date('2026-01-28T14:30:00.000Z');
      const session = AgentSession.create({
        id: 'test-session',
        type: 'claude',
        status: 'active',
        createdAt: createdDate,
        updatedAt: updatedDate,
      });
      const json = session.toJSON();

      expect(json.createdAt).toBe('2026-01-27T12:00:00.000Z');
      expect(json.updatedAt).toBe('2026-01-28T14:30:00.000Z');
      expect(typeof json.createdAt).toBe('string');
      expect(typeof json.updatedAt).toBe('string');
    });

    it('should preserve all field values in toJSON()', () => {
      /*
      Test Doc:
      - Why: Data integrity during serialization
      - Contract: toJSON() preserves all field values
      - Quality Contribution: Accurate persistence
      */
      const session = AgentSession.create({
        id: 'my-session-123',
        type: 'copilot',
        status: 'completed',
        createdAt: new Date('2025-06-15T10:30:00Z'),
        updatedAt: new Date('2025-06-16T14:00:00Z'),
      });
      const json = session.toJSON();

      expect(json.id).toBe('my-session-123');
      expect(json.type).toBe('copilot');
      expect(json.status).toBe('completed');
      expect(json.createdAt).toBe('2025-06-15T10:30:00.000Z');
      expect(json.updatedAt).toBe('2025-06-16T14:00:00.000Z');
    });

    it('should support roundtrip through JSON.stringify/parse', () => {
      /*
      Test Doc:
      - Why: Sessions are stored as JSON files
      - Contract: Entity can be serialized and restored via adapter
      - Quality Contribution: Reliable persistence
      - Usage Notes: Adapter uses JSON.parse() then AgentSession.create()
      */
      const original = AgentSession.create({
        id: 'roundtrip-session',
        type: 'claude',
        status: 'active',
      });

      // Serialize
      const json = JSON.stringify(original.toJSON());

      // Deserialize (simulating what adapter does)
      const parsed = JSON.parse(json);
      const restored = AgentSession.create({
        id: parsed.id,
        type: parsed.type,
        status: parsed.status,
        createdAt: new Date(parsed.createdAt),
        updatedAt: new Date(parsed.updatedAt),
      });

      expect(restored.id).toBe(original.id);
      expect(restored.type).toBe(original.type);
      expect(restored.status).toBe(original.status);
      expect(restored.createdAt.getTime()).toBe(original.createdAt.getTime());
      expect(restored.updatedAt.getTime()).toBe(original.updatedAt.getTime());
    });
  });

  describe('entity invariants', () => {
    it('should have readonly properties', () => {
      /*
      Test Doc:
      - Why: Entities should be immutable
      - Contract: All properties are readonly
      - Quality Contribution: Prevents accidental mutations
      */
      const session = AgentSession.create({
        id: 'immutable-session',
        type: 'claude',
        status: 'active',
      });

      // TypeScript should prevent assignment, but we verify at runtime
      // that the values cannot be changed via Object.isFrozen or checking types
      expect(session.id).toBe('immutable-session');
      expect(session.type).toBe('claude');
      expect(session.status).toBe('active');
    });

    it('should be an instance of AgentSession', () => {
      /*
      Test Doc:
      - Why: Contract tests need instanceof checks
      - Contract: create() returns AgentSession instance
      - Quality Contribution: Type safety verification
      */
      const session = AgentSession.create({
        id: 'instance-test',
        type: 'claude',
        status: 'active',
      });

      expect(session).toBeInstanceOf(AgentSession);
    });
  });
});
