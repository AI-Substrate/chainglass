/*
Test Doc:
- Why: Verify NodeEventRegistry CRUD and validation contract before implementation
- Contract: register adds a type; get returns it; list enumerates; listByDomain filters; validatePayload validates; duplicate registration throws
- Usage Notes: Tests written RED-first (T005) to define the contract. Implementation follows in T006.
- Quality Contribution: Catches any change to the registry's public API behavior
- Worked Example: register({type:'node:accepted',...}) → get('node:accepted') returns the registration; validatePayload('node:accepted',{}) → {ok:true}
*/

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { registerCoreEventTypes } from '../../../../../packages/positional-graph/src/features/032-node-event-system/core-event-types.js';
import type { EventTypeRegistration } from '../../../../../packages/positional-graph/src/features/032-node-event-system/event-type-registration.interface.js';
import { FakeNodeEventRegistry } from '../../../../../packages/positional-graph/src/features/032-node-event-system/fake-node-event-registry.js';
import type { INodeEventRegistry } from '../../../../../packages/positional-graph/src/features/032-node-event-system/node-event-registry.interface.js';
import { NodeEventRegistry } from '../../../../../packages/positional-graph/src/features/032-node-event-system/node-event-registry.js';

function makeRegistration(overrides: Partial<EventTypeRegistration> = {}): EventTypeRegistration {
  return {
    type: 'test:event',
    displayName: 'Test Event',
    description: 'A test event',
    payloadSchema: z.object({ value: z.string() }).strict(),
    allowedSources: ['agent'],
    stopsExecution: false,
    domain: 'test',
    ...overrides,
  };
}

describe('NodeEventRegistry', () => {
  describe('register and get', () => {
    it('returns registered type by name', () => {
      /*
      Test Doc:
      - Why: Core CRUD — register then get is the primary usage path
      - Contract: After register({type:'node:accepted'}), get('node:accepted') returns the registration with matching type and displayName
      - Usage Notes: get returns the full EventTypeRegistration object
      - Quality Contribution: Catches broken Map storage or key mismatch
      - Worked Example: register({type:'node:accepted',displayName:'Test Event'}) → get('node:accepted').displayName === 'Test Event'
      */
      const registry = new NodeEventRegistry();
      const reg = makeRegistration({ type: 'node:accepted' });
      registry.register(reg);

      const result = registry.get('node:accepted');
      expect(result).toBeDefined();
      expect(result?.type).toBe('node:accepted');
      expect(result?.displayName).toBe('Test Event');
    });

    it('returns undefined for unregistered type', () => {
      /*
      Test Doc:
      - Why: Callers depend on undefined return to detect missing types
      - Contract: get('nonexistent') returns undefined on empty registry
      - Usage Notes: Does not throw — undefined signals "not found"
      - Quality Contribution: Catches accidental throw-on-missing behavior
      - Worked Example: new NodeEventRegistry().get('nonexistent') → undefined
      */
      const registry = new NodeEventRegistry();
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('throws on duplicate registration', () => {
      /*
      Test Doc:
      - Why: Duplicate types indicate a programming error — fail fast
      - Contract: Registering the same type twice throws with message containing the type name
      - Usage Notes: Error message includes the duplicate type for debugging
      - Quality Contribution: Catches silent overwrite behavior
      - Worked Example: register('node:accepted') twice → throws "Event type 'node:accepted' already registered"
      */
      const registry = new NodeEventRegistry();
      const reg = makeRegistration({ type: 'node:accepted' });
      registry.register(reg);

      expect(() => registry.register(reg)).toThrow("Event type 'node:accepted' already registered");
    });
  });

  describe('list', () => {
    it('returns all registered types', () => {
      /*
      Test Doc:
      - Why: list() is used for CLI display and discovery
      - Contract: Returns all registered types in insertion order
      - Usage Notes: Order matches registration order (Map iteration order)
      - Quality Contribution: Catches ordering bugs or missing entries
      - Worked Example: register a:one, b:one, a:two → list().map(r=>r.type) === ['a:one','b:one','a:two']
      */
      const registry = new NodeEventRegistry();
      registry.register(makeRegistration({ type: 'a:one', domain: 'a' }));
      registry.register(makeRegistration({ type: 'b:one', domain: 'b' }));
      registry.register(makeRegistration({ type: 'a:two', domain: 'a' }));

      const all = registry.list();
      expect(all).toHaveLength(3);
      expect(all.map((r) => r.type)).toEqual(['a:one', 'b:one', 'a:two']);
    });

    it('returns empty array when no types registered', () => {
      /*
      Test Doc:
      - Why: Empty state must not throw or return undefined
      - Contract: list() returns [] on fresh registry
      - Usage Notes: Callers iterate the result without null checks
      - Quality Contribution: Catches null/undefined return on empty state
      - Worked Example: new NodeEventRegistry().list() → []
      */
      const registry = new NodeEventRegistry();
      expect(registry.list()).toEqual([]);
    });
  });

  describe('listByDomain', () => {
    it('filters by domain', () => {
      /*
      Test Doc:
      - Why: CLI groups event types by domain for display
      - Contract: listByDomain('a') returns only types with domain 'a', in insertion order
      - Usage Notes: Domain is a string field on EventTypeRegistration
      - Quality Contribution: Catches broken filter predicate
      - Worked Example: register a:one(domain=a), b:one(domain=b), a:two(domain=a) → listByDomain('a') returns [a:one, a:two]
      */
      const registry = new NodeEventRegistry();
      registry.register(makeRegistration({ type: 'a:one', domain: 'a' }));
      registry.register(makeRegistration({ type: 'b:one', domain: 'b' }));
      registry.register(makeRegistration({ type: 'a:two', domain: 'a' }));

      const result = registry.listByDomain('a');
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.type)).toEqual(['a:one', 'a:two']);
    });

    it('returns empty array for unknown domain', () => {
      /*
      Test Doc:
      - Why: Unknown domain must not throw — returns empty like an empty filter
      - Contract: listByDomain('unknown') returns [] even when other domains exist
      - Usage Notes: Callers iterate the result without null checks
      - Quality Contribution: Catches throw-on-missing or null return
      - Worked Example: register a:one(domain=a) → listByDomain('unknown') → []
      */
      const registry = new NodeEventRegistry();
      registry.register(makeRegistration({ type: 'a:one', domain: 'a' }));
      expect(registry.listByDomain('unknown')).toEqual([]);
    });
  });

  describe('validatePayload', () => {
    it('returns ok for valid payload', () => {
      /*
      Test Doc:
      - Why: Valid payloads must pass validation cleanly
      - Contract: validatePayload with matching payload returns {ok:true, errors:[]}
      - Usage Notes: Uses Zod safeParse under the hood
      - Quality Contribution: Catches broken Zod integration or result format
      - Worked Example: register schema({value:string}), validatePayload({value:'hello'}) → {ok:true,errors:[]}
      */
      const registry = new NodeEventRegistry();
      registry.register(makeRegistration({ type: 'test:event' }));

      const result = registry.validatePayload('test:event', { value: 'hello' });
      expect(result.ok).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('returns errors for invalid payload', () => {
      /*
      Test Doc:
      - Why: Invalid payloads must produce E191 errors with field details
      - Contract: validatePayload with wrong type returns {ok:false, errors:[{code:'E191',...}]}
      - Usage Notes: Each Zod issue maps to one ResultError with code E191
      - Quality Contribution: Catches wrong error code or missing error details
      - Worked Example: schema expects string, pass number → {ok:false, errors:[{code:'E191'}]}
      */
      const registry = new NodeEventRegistry();
      registry.register(makeRegistration({ type: 'test:event' }));

      const result = registry.validatePayload('test:event', { value: 123 });
      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe('E191');
    });

    it('returns error for unknown type', () => {
      /*
      Test Doc:
      - Why: Unknown types must produce E190 error, not throw
      - Contract: validatePayload('nonexistent',{}) returns {ok:false, errors:[{code:'E190'}]}
      - Usage Notes: Returns error result instead of throwing — caller decides how to handle
      - Quality Contribution: Catches throw-on-unknown or wrong error code
      - Worked Example: empty registry, validatePayload('nonexistent',{}) → errors[0].code === 'E190'
      */
      const registry = new NodeEventRegistry();

      const result = registry.validatePayload('nonexistent', {});
      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E190');
    });

    it('includes available types in unknown type error', () => {
      /*
      Test Doc:
      - Why: E190 message should help users discover valid types
      - Contract: Error message for unknown type includes names of registered types
      - Usage Notes: Helps both CLI users and programmatic callers diagnose the issue
      - Quality Contribution: Catches unhelpful "unknown type" messages without alternatives
      - Worked Example: register 'node:accepted', validate 'bad:type' → message contains 'node:accepted'
      */
      const registry = new NodeEventRegistry();
      registry.register(makeRegistration({ type: 'node:accepted' }));

      const result = registry.validatePayload('bad:type', {});
      expect(result.ok).toBe(false);
      expect(result.errors[0].message).toContain('node:accepted');
    });

    it('rejects extra fields when schema uses strict', () => {
      /*
      Test Doc:
      - Why: .strict() enforcement prevents accidental data leakage through extra fields
      - Contract: Payload with extra fields fails validation even if required fields are present
      - Usage Notes: All 8 core schemas use .strict() — this tests the mechanism
      - Quality Contribution: Catches .strict() removal or passthrough mode regression
      - Worked Example: schema({value:string}).strict(), validate({value:'ok',extra:true}) → ok:false
      */
      const registry = new NodeEventRegistry();
      registry.register(makeRegistration({ type: 'test:event' }));

      const result = registry.validatePayload('test:event', { value: 'ok', extra: true });
      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

// ── Contract Tests: Fake vs Real Parity ─────────────────────
/*
Test Doc:
- Why: Prove FakeNodeEventRegistry behaves identically to NodeEventRegistry
- Contract: Given identical inputs, both implementations produce the same outputs for all INodeEventRegistry methods
- Usage Notes: Uses a parameterized factory pattern — same assertions run against both implementations
- Quality Contribution: Catches drift between real and fake implementations
- Worked Example: Both return undefined for get('nonexistent'); both throw on duplicate register; both return {ok:true} for valid payload
*/

function registryContractTests(name: string, createRegistry: () => INodeEventRegistry): void {
  describe(`${name} (contract)`, () => {
    it('get returns undefined for unregistered type', () => {
      /*
      Test Doc:
      - Why: Both implementations must agree on "not found" behavior
      - Contract: get('nonexistent') → undefined for both real and fake
      - Usage Notes: Contract test — same assertion, two implementations
      - Quality Contribution: Catches fake returning null or throwing instead
      - Worked Example: createRegistry().get('nonexistent') → undefined
      */
      const r = createRegistry();
      expect(r.get('nonexistent')).toBeUndefined();
    });

    it('register then get returns the registration', () => {
      /*
      Test Doc:
      - Why: Both implementations must store and retrieve registrations identically
      - Contract: register({type:'x:one'}) then get('x:one') returns defined with matching type
      - Usage Notes: Contract test — same assertion, two implementations
      - Quality Contribution: Catches fake with broken storage
      - Worked Example: register('x:one') → get('x:one').type === 'x:one'
      */
      const r = createRegistry();
      const reg = makeRegistration({ type: 'x:one' });
      r.register(reg);
      expect(r.get('x:one')).toBeDefined();
      expect(r.get('x:one')?.type).toBe('x:one');
    });

    it('throws on duplicate registration', () => {
      /*
      Test Doc:
      - Why: Both implementations must enforce the no-duplicate invariant
      - Contract: Registering same type twice throws for both real and fake
      - Usage Notes: Contract test — same assertion, two implementations
      - Quality Contribution: Catches fake silently accepting duplicates
      - Worked Example: register('x:one') twice → throws
      */
      const r = createRegistry();
      const reg = makeRegistration({ type: 'x:one' });
      r.register(reg);
      expect(() => r.register(reg)).toThrow();
    });

    it('list returns all registered types in insertion order', () => {
      /*
      Test Doc:
      - Why: Both implementations must preserve insertion order
      - Contract: register a:one then b:one → list().map(t=>t.type) === ['a:one','b:one']
      - Usage Notes: Contract test — same assertion, two implementations
      - Quality Contribution: Catches fake with different ordering (e.g., sorted)
      - Worked Example: register a:one, b:one → list types === ['a:one','b:one']
      */
      const r = createRegistry();
      r.register(makeRegistration({ type: 'a:one', domain: 'a' }));
      r.register(makeRegistration({ type: 'b:one', domain: 'b' }));
      expect(r.list().map((t) => t.type)).toEqual(['a:one', 'b:one']);
    });

    it('list returns empty array when empty', () => {
      /*
      Test Doc:
      - Why: Both implementations must handle empty state identically
      - Contract: list() returns [] on fresh registry for both real and fake
      - Usage Notes: Contract test — same assertion, two implementations
      - Quality Contribution: Catches fake returning undefined or null on empty
      - Worked Example: createRegistry().list() → []
      */
      const r = createRegistry();
      expect(r.list()).toEqual([]);
    });

    it('listByDomain filters correctly', () => {
      /*
      Test Doc:
      - Why: Both implementations must filter by domain identically
      - Contract: listByDomain('a') returns only domain-a types; listByDomain('unknown') returns []
      - Usage Notes: Contract test — same assertion, two implementations
      - Quality Contribution: Catches fake with broken domain filter
      - Worked Example: register a:one(a), b:one(b), a:two(a) → listByDomain('a') types === ['a:one','a:two']
      */
      const r = createRegistry();
      r.register(makeRegistration({ type: 'a:one', domain: 'a' }));
      r.register(makeRegistration({ type: 'b:one', domain: 'b' }));
      r.register(makeRegistration({ type: 'a:two', domain: 'a' }));
      expect(r.listByDomain('a').map((t) => t.type)).toEqual(['a:one', 'a:two']);
      expect(r.listByDomain('unknown')).toEqual([]);
    });

    it('validatePayload returns ok for valid payload', () => {
      /*
      Test Doc:
      - Why: Both implementations must validate payloads identically
      - Contract: Valid payload → {ok:true, errors:[]} for both real and fake
      - Usage Notes: Contract test — same assertion, two implementations
      - Quality Contribution: Catches fake with broken Zod integration
      - Worked Example: register schema({value:string}), validate({value:'hello'}) → ok:true
      */
      const r = createRegistry();
      r.register(makeRegistration({ type: 'test:event' }));
      const result = r.validatePayload('test:event', { value: 'hello' });
      expect(result.ok).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('validatePayload returns E191 for invalid payload', () => {
      /*
      Test Doc:
      - Why: Both implementations must produce E191 for invalid payloads
      - Contract: Invalid payload → {ok:false, errors:[{code:'E191'}]} for both
      - Usage Notes: Contract test — same assertion, two implementations
      - Quality Contribution: Catches fake returning different error codes
      - Worked Example: schema expects string, pass number → errors[0].code === 'E191'
      */
      const r = createRegistry();
      r.register(makeRegistration({ type: 'test:event' }));
      const result = r.validatePayload('test:event', { value: 123 });
      expect(result.ok).toBe(false);
      expect(result.errors[0].code).toBe('E191');
    });

    it('validatePayload returns E190 for unknown type', () => {
      /*
      Test Doc:
      - Why: Both implementations must produce E190 for unknown types
      - Contract: Unknown type → {ok:false, errors:[{code:'E190'}]} for both
      - Usage Notes: Contract test — same assertion, two implementations
      - Quality Contribution: Catches fake throwing instead of returning error
      - Worked Example: empty registry, validate('unknown:type',{}) → errors[0].code === 'E190'
      */
      const r = createRegistry();
      const result = r.validatePayload('unknown:type', {});
      expect(result.ok).toBe(false);
      expect(result.errors[0].code).toBe('E190');
    });
  });
}

registryContractTests('NodeEventRegistry', () => new NodeEventRegistry());
registryContractTests('FakeNodeEventRegistry', () => new FakeNodeEventRegistry());

// ── FakeNodeEventRegistry-specific test helpers ─────────────
describe('FakeNodeEventRegistry test helpers', () => {
  it('getValidationHistory records calls', () => {
    /*
    Test Doc:
    - Why: Test helper must record all validatePayload calls for assertions
    - Contract: After 2 validatePayload calls, getValidationHistory() returns 2 entries with correct ok values
    - Usage Notes: History includes type, payload, and full result for each call
    - Quality Contribution: Catches broken history recording in fake
    - Worked Example: validate valid then invalid → history[0].result.ok=true, history[1].result.ok=false
    */
    const fake = new FakeNodeEventRegistry();
    fake.register(makeRegistration({ type: 'test:event' }));
    fake.validatePayload('test:event', { value: 'a' });
    fake.validatePayload('test:event', { value: 123 });

    const history = fake.getValidationHistory();
    expect(history).toHaveLength(2);
    expect(history[0].result.ok).toBe(true);
    expect(history[1].result.ok).toBe(false);
  });

  it('reset clears registrations and history', () => {
    /*
    Test Doc:
    - Why: reset() enables test isolation without creating new instances
    - Contract: After reset(), list() and getValidationHistory() both return empty arrays
    - Usage Notes: Useful in beforeEach when reusing a single fake across tests
    - Quality Contribution: Catches partial reset (e.g., clears registrations but not history)
    - Worked Example: register + validate + reset → list()=[], getValidationHistory()=[]
    */
    const fake = new FakeNodeEventRegistry();
    fake.register(makeRegistration({ type: 'test:event' }));
    fake.validatePayload('test:event', { value: 'a' });

    fake.reset();

    expect(fake.list()).toEqual([]);
    expect(fake.getValidationHistory()).toEqual([]);
  });

  it('addEventType is an alias for register', () => {
    /*
    Test Doc:
    - Why: addEventType provides a more readable test API name
    - Contract: addEventType({type:'test:event'}) makes get('test:event') return defined
    - Usage Notes: Follows FakeXxx.addXxx() convention from constitution
    - Quality Contribution: Catches broken alias delegation
    - Worked Example: fake.addEventType({type:'test:event'}) → fake.get('test:event') defined
    */
    const fake = new FakeNodeEventRegistry();
    fake.addEventType(makeRegistration({ type: 'test:event' }));
    expect(fake.get('test:event')).toBeDefined();
  });
});

// ── registerCoreEventTypes ──────────────────────────────────
/*
Test Doc:
- Why: Verify all 8 core event types are registered with correct metadata per Workshop #01
- Contract: registerCoreEventTypes() populates exactly 8 types; each has correct displayName, allowedSources, stopsExecution, domain
- Usage Notes: Follows ADR-0008 module registration function pattern
- Quality Contribution: Catches any drift from Workshop #01 event type definitions
- Worked Example: After registerCoreEventTypes(registry), registry.list().length === 8; get('question:ask').stopsExecution === true
*/

describe('registerCoreEventTypes', () => {
  it('registers exactly 8 event types', () => {
    /*
    Test Doc:
    - Why: Workshop #01 defines exactly 8 event types — no more, no less
    - Contract: After registerCoreEventTypes(), list().length === 8
    - Usage Notes: If a 9th type is added, this test and the names test must both update
    - Quality Contribution: Catches accidental addition or removal of event types
    - Worked Example: registerCoreEventTypes(registry) → registry.list().length === 8
    */
    const registry = new NodeEventRegistry();
    registerCoreEventTypes(registry);
    expect(registry.list()).toHaveLength(8);
  });

  it('registers all expected type names', () => {
    /*
    Test Doc:
    - Why: The 8 type names are the canonical API contract for event raising
    - Contract: Sorted type names match the exact expected set
    - Usage Notes: Sorting removes insertion-order sensitivity
    - Quality Contribution: Catches renamed or missing event types
    - Worked Example: sorted types === ['node:accepted','node:completed','node:error','output:save-data','output:save-file','progress:update','question:answer','question:ask']
    */
    const registry = new NodeEventRegistry();
    registerCoreEventTypes(registry);
    const types = registry
      .list()
      .map((r) => r.type)
      .sort();
    expect(types).toEqual([
      'node:accepted',
      'node:completed',
      'node:error',
      'output:save-data',
      'output:save-file',
      'progress:update',
      'question:answer',
      'question:ask',
    ]);
  });

  it('node:accepted has correct metadata', () => {
    /*
    Test Doc:
    - Why: node:accepted metadata must match Workshop #01 exactly
    - Contract: displayName='Accept Node', allowedSources=['agent','executor'], stopsExecution=false, domain='node'
    - Usage Notes: This is the first event in the lifecycle — agent acknowledges the node
    - Quality Contribution: Catches metadata drift from spec
    - Worked Example: get('node:accepted').displayName === 'Accept Node'
    */
    const registry = new NodeEventRegistry();
    registerCoreEventTypes(registry);
    const reg = registry.get('node:accepted');
    expect(reg).toBeDefined();
    expect(reg?.displayName).toBe('Accept Node');
    expect(reg?.allowedSources).toEqual(['agent', 'executor']);
    expect(reg?.stopsExecution).toBe(false);
    expect(reg?.domain).toBe('node');
  });

  it('node:completed stops execution', () => {
    /*
    Test Doc:
    - Why: node:completed must stop execution — this is the terminal success event
    - Contract: get('node:completed').stopsExecution === true
    - Usage Notes: After completion, the orchestrator advances to the next node
    - Quality Contribution: Catches accidental stopsExecution=false on terminal event
    - Worked Example: get('node:completed').stopsExecution → true
    */
    const registry = new NodeEventRegistry();
    registerCoreEventTypes(registry);
    expect(registry.get('node:completed')?.stopsExecution).toBe(true);
  });

  it('node:error allows orchestrator source', () => {
    /*
    Test Doc:
    - Why: node:error uniquely allows orchestrator as a source (timeout, system errors)
    - Contract: allowedSources includes 'orchestrator' and stopsExecution is true
    - Usage Notes: Only node:error and question:answer allow non-agent sources
    - Quality Contribution: Catches removal of orchestrator from error source list
    - Worked Example: get('node:error').allowedSources includes 'orchestrator'
    */
    const registry = new NodeEventRegistry();
    registerCoreEventTypes(registry);
    const reg = registry.get('node:error');
    expect(reg).toBeDefined();
    expect(reg?.allowedSources).toContain('orchestrator');
    expect(reg?.stopsExecution).toBe(true);
  });

  it('question:ask stops execution', () => {
    /*
    Test Doc:
    - Why: question:ask must stop execution — agent waits for an external answer
    - Contract: get('question:ask').stopsExecution === true
    - Usage Notes: Execution resumes only after question:answer is raised
    - Quality Contribution: Catches accidental stopsExecution=false on blocking question
    - Worked Example: get('question:ask').stopsExecution → true
    */
    const registry = new NodeEventRegistry();
    registerCoreEventTypes(registry);
    expect(registry.get('question:ask')?.stopsExecution).toBe(true);
  });

  it('question:answer allows human and orchestrator', () => {
    /*
    Test Doc:
    - Why: question:answer comes from humans or orchestrator — never from agent
    - Contract: allowedSources === ['human','orchestrator']; stopsExecution === false
    - Usage Notes: Answering a question resumes execution, doesn't stop it
    - Quality Contribution: Catches agent being allowed to answer its own questions
    - Worked Example: get('question:answer').allowedSources === ['human','orchestrator']
    */
    const registry = new NodeEventRegistry();
    registerCoreEventTypes(registry);
    const reg = registry.get('question:answer');
    expect(reg).toBeDefined();
    expect(reg?.allowedSources).toEqual(['human', 'orchestrator']);
    expect(reg?.stopsExecution).toBe(false);
  });

  it('output types do not stop execution', () => {
    /*
    Test Doc:
    - Why: Output events are fire-and-forget — agent continues working
    - Contract: Both output:save-data and output:save-file have stopsExecution=false
    - Usage Notes: Agent can emit multiple outputs before completing
    - Quality Contribution: Catches accidental blocking behavior on output events
    - Worked Example: get('output:save-data').stopsExecution → false
    */
    const registry = new NodeEventRegistry();
    registerCoreEventTypes(registry);
    expect(registry.get('output:save-data')?.stopsExecution).toBe(false);
    expect(registry.get('output:save-file')?.stopsExecution).toBe(false);
  });

  it('progress:update does not stop execution', () => {
    /*
    Test Doc:
    - Why: Progress updates are informational — must not block the agent
    - Contract: get('progress:update').stopsExecution === false
    - Usage Notes: Used for CLI progress display, no state change
    - Quality Contribution: Catches accidental blocking on progress events
    - Worked Example: get('progress:update').stopsExecution → false
    */
    const registry = new NodeEventRegistry();
    registerCoreEventTypes(registry);
    expect(registry.get('progress:update')?.stopsExecution).toBe(false);
  });

  it('validates payloads for registered types', () => {
    /*
    Test Doc:
    - Why: Integration test — verify schemas work through the registry after core registration
    - Contract: All 8 types accept their valid payloads; reject known-invalid payloads
    - Usage Notes: Tests both positive (valid) and negative (invalid) cases per type
    - Quality Contribution: Catches schema-registration wiring bugs
    - Worked Example: validatePayload('node:accepted',{}).ok → true; validatePayload('node:accepted',{extra:true}).ok → false
    */
    const registry = new NodeEventRegistry();
    registerCoreEventTypes(registry);

    // Valid
    expect(registry.validatePayload('node:accepted', {}).ok).toBe(true);
    expect(registry.validatePayload('node:completed', {}).ok).toBe(true);
    expect(registry.validatePayload('node:error', { code: 'E', message: 'M' }).ok).toBe(true);
    expect(registry.validatePayload('question:ask', { type: 'text', text: 'Q?' }).ok).toBe(true);
    expect(
      registry.validatePayload('question:answer', { question_event_id: 'evt_1', answer: 'A' }).ok
    ).toBe(true);
    expect(registry.validatePayload('output:save-data', { name: 'n', value: 'v' }).ok).toBe(true);
    expect(registry.validatePayload('output:save-file', { name: 'n', source_path: '/p' }).ok).toBe(
      true
    );
    expect(registry.validatePayload('progress:update', { message: 'Working' }).ok).toBe(true);

    // Invalid
    expect(registry.validatePayload('node:accepted', { extra: true }).ok).toBe(false);
    expect(registry.validatePayload('question:ask', { type: 'bad' }).ok).toBe(false);
  });
});
