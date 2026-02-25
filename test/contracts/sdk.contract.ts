/**
 * SDK Contract Test Factory.
 *
 * Per R-TEST-008: Parameterized test factory runs against both fake and real.
 * Per Constitution P2: Tests using fake before real adapter.
 *
 * Tests cover all three SDK subsystems:
 * - ICommandRegistry: register/execute/list/isAvailable
 * - ISDKSettings: contribute/get/set/reset/onChange
 * - IContextKeyService: set/get/evaluate
 *
 * DYK-01: Includes duplicate-ID test.
 * DYK-02: Includes referential-stability test for get().
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { IUSDK } from '@chainglass/shared/sdk';
import type { SDKCommand, SDKSetting } from '@chainglass/shared/sdk';

// ==================== Helpers ====================

function createTestCommand(overrides: Partial<SDKCommand> = {}): SDKCommand {
  return {
    id: 'test.doSomething',
    title: 'Do Something',
    domain: 'test',
    params: z.object({ value: z.string() }),
    handler: async () => {},
    ...overrides,
  };
}

function createTestSetting(overrides: Partial<SDKSetting> = {}): SDKSetting {
  return {
    key: 'test.enabled',
    domain: 'test',
    label: 'Enabled',
    description: 'Test toggle',
    schema: z.boolean().default(false),
    ...overrides,
  };
}

// ==================== Contract Factory ====================

export function sdkCommandRegistryContractTests(
  name: string,
  createRegistry: () => IUSDK['commands'],
  createContext?: () => IUSDK['context']
) {
  describe(`${name} implements ICommandRegistry contract`, () => {
    let registry: IUSDK['commands'];

    beforeEach(() => {
      registry = createRegistry();
    });

    it('should register a command and list it', () => {
      /*
      Test Doc:
      - Why: Core registration contract
      - Contract: register() stores command, list() returns it
      - Usage Notes: Command appears in list() after registration
      - Quality Contribution: Catches broken registration
      - Worked Example: register({id:'test.cmd'}) → list() includes it
      */
      const cmd = createTestCommand();
      registry.register(cmd);

      const listed = registry.list();
      expect(listed).toHaveLength(1);
      expect(listed[0].id).toBe('test.doSomething');
    });

    it('should throw on duplicate command ID', () => {
      /*
      Test Doc:
      - Why: DYK-01 — single-owner semantics, fail-fast
      - Contract: register() throws if ID already registered
      - Usage Notes: Each command ID must be unique across all domains
      - Quality Contribution: Prevents silent overwrites between domains
      - Worked Example: register({id:'x'}) twice → throws
      */
      const cmd = createTestCommand();
      registry.register(cmd);

      expect(() => registry.register(createTestCommand())).toThrow(/already registered/);
    });

    it('should execute a command with valid params', async () => {
      /*
      Test Doc:
      - Why: Core execution contract
      - Contract: execute() calls handler with Zod-validated params
      - Usage Notes: Params are validated before handler is invoked
      - Quality Contribution: Catches broken execution pipeline
      - Worked Example: execute('test.doSomething', {value:'hello'}) → handler called
      */
      let received: unknown = null;
      const cmd = createTestCommand({
        handler: async (params) => {
          received = params;
        },
      });
      registry.register(cmd);

      await registry.execute('test.doSomething', { value: 'hello' });
      expect(received).toEqual({ value: 'hello' });
    });

    it('should throw ZodError on invalid params', async () => {
      /*
      Test Doc:
      - Why: Validation contract — bad params caught before handler
      - Contract: execute() throws ZodError for invalid params
      - Usage Notes: Handler is never called with invalid data
      - Quality Contribution: Catches missing validation
      - Worked Example: execute('test.doSomething', {value:123}) → ZodError
      */
      registry.register(createTestCommand());

      await expect(registry.execute('test.doSomething', { value: 123 })).rejects.toThrow();
    });

    it('should throw for unregistered command ID', async () => {
      /*
      Test Doc:
      - Why: Error handling contract
      - Contract: execute() throws for unknown command ID
      - Usage Notes: Caller gets clear error message
      - Quality Contribution: Catches silent failures
      - Worked Example: execute('nope') → throws
      */
      await expect(registry.execute('nope')).rejects.toThrow(/not registered/);
    });

    it('should list commands filtered by domain', () => {
      /*
      Test Doc:
      - Why: Palette needs per-domain filtering
      - Contract: list({domain}) returns only matching commands
      - Usage Notes: list() with no filter returns all
      - Quality Contribution: Catches broken filter logic
      - Worked Example: 2 domains, filter by one → 1 result
      */
      registry.register(createTestCommand({ id: 'a.cmd', domain: 'a' }));
      registry.register(createTestCommand({ id: 'b.cmd', domain: 'b' }));

      expect(registry.list({ domain: 'a' })).toHaveLength(1);
      expect(registry.list({ domain: 'a' })[0].id).toBe('a.cmd');
      expect(registry.list()).toHaveLength(2);
    });

    it('should dispose a command registration', () => {
      /*
      Test Doc:
      - Why: Cleanup contract
      - Contract: dispose() removes command from registry
      - Usage Notes: Used for dynamic registration cleanup
      - Quality Contribution: Catches memory leaks
      - Worked Example: register → dispose → list() empty
      */
      const { dispose } = registry.register(createTestCommand());
      expect(registry.list()).toHaveLength(1);

      dispose();
      expect(registry.list()).toHaveLength(0);
    });

    it('should report availability via isAvailable', () => {
      /*
      Test Doc:
      - Why: Command palette needs to check availability
      - Contract: isAvailable() returns true for registered commands
      - Usage Notes: Returns false for unregistered
      - Quality Contribution: Catches broken availability check
      - Worked Example: register → isAvailable(id) → true
      */
      registry.register(createTestCommand());
      expect(registry.isAvailable('test.doSomething')).toBe(true);
      expect(registry.isAvailable('nope')).toBe(false);
    });

    if (createContext) {
      it('should respect when-clause in isAvailable', () => {
        /*
        Test Doc:
        - Why: F002 — isAvailable must evaluate when-clauses via context keys
        - Contract: isAvailable() returns false when when-clause evaluates false
        - Usage Notes: Requires paired context key service
        - Quality Contribution: Catches parity gap between fake and real
        - Worked Example: register(when:'ctx.key') → isAvailable false → set key → true
        */
        const ctx = createContext();
        const cmd = createTestCommand({ when: 'file.hasOpen' });
        registry.register(cmd);

        // Context key not set → command not available
        expect(registry.isAvailable('test.doSomething')).toBe(false);

        // Set context key → command available
        ctx.set('file.hasOpen', true);
        expect(registry.isAvailable('test.doSomething')).toBe(true);

        // Clear context key → command not available
        ctx.set('file.hasOpen', false);
        expect(registry.isAvailable('test.doSomething')).toBe(false);
      });
    }
  });
}

export function sdkSettingsStoreContractTests(name: string, createStore: () => IUSDK['settings']) {
  describe(`${name} implements ISDKSettings contract`, () => {
    let store: IUSDK['settings'];

    beforeEach(() => {
      store = createStore();
    });

    it('should return schema default after contribute', () => {
      /*
      Test Doc:
      - Why: Core contribute/get contract
      - Contract: contribute() registers setting, get() returns schema default
      - Usage Notes: Default comes from Zod schema .default()
      - Quality Contribution: Catches missing default resolution
      - Worked Example: contribute(z.boolean().default(false)) → get() → false
      */
      store.contribute(createTestSetting());
      expect(store.get('test.enabled')).toBe(false);
    });

    it('should apply persisted override after hydrate + contribute', () => {
      /*
      Test Doc:
      - Why: Persistence roundtrip contract
      - Contract: hydrate() seeds persisted values, contribute() applies them
      - Usage Notes: hydrate() must be called before contribute()
      - Quality Contribution: Catches broken hydration
      - Worked Example: hydrate({key:true}) → contribute(default:false) → get() → true
      */
      store.hydrate({ 'test.enabled': true });
      store.contribute(createTestSetting());
      expect(store.get('test.enabled')).toBe(true);
    });

    it('should fire onChange when set is called', () => {
      /*
      Test Doc:
      - Why: Reactivity contract
      - Contract: set() fires onChange listeners with new value
      - Usage Notes: Listener receives validated value
      - Quality Contribution: Catches broken change notification
      - Worked Example: onChange → set(true) → callback receives true
      */
      store.contribute(createTestSetting());

      let received: unknown = null;
      store.onChange('test.enabled', (v) => {
        received = v;
      });

      store.set('test.enabled', true);
      expect(received).toBe(true);
    });

    it('should throw on invalid value in set', () => {
      /*
      Test Doc:
      - Why: Validation contract
      - Contract: set() throws ZodError for invalid value
      - Usage Notes: Value must match contributed schema
      - Quality Contribution: Catches missing validation
      - Worked Example: set('test.enabled', 'not-a-bool') → throws
      */
      store.contribute(createTestSetting());
      expect(() => store.set('test.enabled', 'not-a-bool')).toThrow();
    });

    it('should reset to default and fire onChange', () => {
      /*
      Test Doc:
      - Why: Reset contract
      - Contract: reset() reverts to schema default, fires onChange
      - Usage Notes: isOverridden becomes false
      - Quality Contribution: Catches broken reset
      - Worked Example: set(true) → reset() → get() → false
      */
      store.contribute(createTestSetting());
      store.set('test.enabled', true);
      expect(store.get('test.enabled')).toBe(true);

      let received: unknown = null;
      store.onChange('test.enabled', (v) => {
        received = v;
      });

      store.reset('test.enabled');
      expect(store.get('test.enabled')).toBe(false);
      expect(received).toBe(false);
    });

    it('should return stable references from get()', () => {
      /*
      Test Doc:
      - Why: DYK-02 — useSyncExternalStore requires referential stability
      - Contract: Consecutive get() calls with no set() return Object.is-equal
      - Usage Notes: Callers must not mutate returned value
      - Quality Contribution: Catches infinite re-render bug
      - Worked Example: get() === get() when no set() between calls
      */
      store.contribute(createTestSetting());
      const first = store.get('test.enabled');
      const second = store.get('test.enabled');
      expect(Object.is(first, second)).toBe(true);
    });

    it('should only include overrides in toPersistedRecord', () => {
      /*
      Test Doc:
      - Why: Persistence efficiency
      - Contract: toPersistedRecord() omits defaults, includes only overrides
      - Usage Notes: Used for atomic write to workspaces.json
      - Quality Contribution: Catches persisted bloat from defaults
      - Worked Example: contribute default → toPersistedRecord() → {} (empty)
      */
      store.contribute(createTestSetting());
      expect(store.toPersistedRecord()).toEqual({});

      store.set('test.enabled', true);
      expect(store.toPersistedRecord()).toEqual({ 'test.enabled': true });
    });

    it('should list all contributed settings', () => {
      /*
      Test Doc:
      - Why: Settings page needs full list
      - Contract: list() returns all contributed definitions
      - Usage Notes: Definitions include schema, label, description
      - Quality Contribution: Catches missing list implementation
      - Worked Example: contribute 2 settings → list() returns 2
      */
      store.contribute(createTestSetting());
      store.contribute(
        createTestSetting({
          key: 'test.count',
          label: 'Count',
          description: 'A number',
          schema: z.number().default(0),
        })
      );
      expect(store.list()).toHaveLength(2);
    });

    it('should dispose onChange subscription', () => {
      /*
      Test Doc:
      - Why: Cleanup contract
      - Contract: dispose() stops receiving notifications
      - Usage Notes: Used in useEffect cleanup
      - Quality Contribution: Catches memory leaks
      - Worked Example: onChange → dispose → set → callback NOT called
      */
      store.contribute(createTestSetting());
      let callCount = 0;
      const { dispose } = store.onChange('test.enabled', () => {
        callCount++;
      });

      store.set('test.enabled', true);
      expect(callCount).toBe(1);

      dispose();
      store.set('test.enabled', false);
      expect(callCount).toBe(1);
    });
  });
}

export function sdkContextKeyContractTests(name: string, createContext: () => IUSDK['context']) {
  describe(`${name} implements IContextKeyService contract`, () => {
    let ctx: IUSDK['context'];

    beforeEach(() => {
      ctx = createContext();
    });

    it('should set and get a context key', () => {
      /*
      Test Doc:
      - Why: Core set/get contract
      - Contract: set() stores value, get() returns it
      - Usage Notes: Returns undefined for unset keys
      - Quality Contribution: Catches broken storage
      - Worked Example: set('k', true) → get('k') → true
      */
      ctx.set('file.hasOpen', true);
      expect(ctx.get('file.hasOpen')).toBe(true);
      expect(ctx.get('nope')).toBeUndefined();
    });

    it('should evaluate simple truthy expression', () => {
      /*
      Test Doc:
      - Why: When-clause truthy check
      - Contract: evaluate('key') → true when key is set and truthy
      - Usage Notes: Falsy values (0, '', false, null) → false
      - Quality Contribution: Catches broken truthy evaluation
      - Worked Example: set('k', true) → evaluate('k') → true
      */
      ctx.set('file.hasOpen', true);
      expect(ctx.evaluate('file.hasOpen')).toBe(true);
      expect(ctx.evaluate('file.notSet')).toBe(false);
    });

    it('should evaluate negation expression', () => {
      /*
      Test Doc:
      - Why: When-clause negation
      - Contract: evaluate('!key') → true when key is not set or falsy
      - Usage Notes: '!' prefix triggers negation logic
      - Quality Contribution: Catches broken negation
      - Worked Example: evaluate('!key') → true when key not set
      */
      expect(ctx.evaluate('!file.hasOpen')).toBe(true);
      ctx.set('file.hasOpen', true);
      expect(ctx.evaluate('!file.hasOpen')).toBe(false);
    });

    it('should evaluate equality expression', () => {
      /*
      Test Doc:
      - Why: When-clause equality
      - Contract: evaluate('key == value') → true when key equals value
      - Usage Notes: Compares string representation
      - Quality Contribution: Catches broken equality evaluation
      - Worked Example: set('mode', 'edit') → evaluate('mode == edit') → true
      */
      ctx.set('mode', 'edit');
      expect(ctx.evaluate('mode == edit')).toBe(true);
      expect(ctx.evaluate('mode == view')).toBe(false);
    });

    it('should return false for equality on unset key (not match "undefined")', () => {
      /*
      Test Doc:
      - Why: F003 — String(undefined)==="undefined" bug
      - Contract: evaluate('key == undefined') returns false when key not set
      - Usage Notes: Unset keys must not match the literal string "undefined"
      - Quality Contribution: Catches String coercion bug on Map.get() returning undefined
      - Worked Example: evaluate('notSet == undefined') → false
      */
      expect(ctx.evaluate('notSet == undefined')).toBe(false);
      expect(ctx.evaluate('notSet == anything')).toBe(false);
    });

    it('should return true for empty/undefined expression', () => {
      /*
      Test Doc:
      - Why: No condition = always available
      - Contract: evaluate(undefined) and evaluate('') return true
      - Usage Notes: Commands with no when-clause are always available
      - Quality Contribution: Catches over-restrictive evaluation
      - Worked Example: evaluate(undefined) → true
      */
      expect(ctx.evaluate(undefined)).toBe(true);
      expect(ctx.evaluate('')).toBe(true);
    });

    it('should fire onChange when context key changes', () => {
      /*
      Test Doc:
      - Why: Reactivity contract
      - Contract: set() fires onChange listeners
      - Usage Notes: Listener receives key and new value
      - Quality Contribution: Catches broken change notification
      - Worked Example: onChange → set('k', true) → callback called with ('k', true)
      */
      let lastKey: string | null = null;
      let lastValue: unknown = null;
      ctx.onChange((k, v) => {
        lastKey = k;
        lastValue = v;
      });

      ctx.set('test.key', 42);
      expect(lastKey).toBe('test.key');
      expect(lastValue).toBe(42);
    });
  });
}

// ==================== IKeybindingService ====================

export function sdkKeybindingContractTests(
  name: string,
  createKeybindings: () => IUSDK['keybindings'],
  createContext?: () => IUSDK['context']
) {
  describe(`${name} implements IKeybindingService contract`, () => {
    let kb: IUSDK['keybindings'];

    beforeEach(() => {
      kb = createKeybindings();
    });

    it('registers a keybinding and returns it in getBindings()', () => {
      kb.register({ key: '$mod+Shift+p', command: 'sdk.openCommandPalette' });
      const bindings = kb.getBindings();
      expect(bindings).toHaveLength(1);
      expect(bindings[0].key).toBe('$mod+Shift+p');
      expect(bindings[0].command).toBe('sdk.openCommandPalette');
    });

    it('registers a chord keybinding', () => {
      kb.register({ key: '$mod+k $mod+c', command: 'editor.commentLine' });
      const bindings = kb.getBindings();
      expect(bindings).toHaveLength(1);
      expect(bindings[0].key).toBe('$mod+k $mod+c');
    });

    it('throws on duplicate key registration', () => {
      kb.register({ key: '$mod+p', command: 'file.open' });
      expect(() => {
        kb.register({ key: '$mod+p', command: 'other.command' });
      }).toThrow(/already registered/);
    });

    it('dispose removes the keybinding', () => {
      const reg = kb.register({ key: '$mod+g', command: 'file.goToLine' });
      expect(kb.getBindings()).toHaveLength(1);
      reg.dispose();
      expect(kb.getBindings()).toHaveLength(0);
    });

    it('buildTinykeysMap creates entries for each binding', () => {
      kb.register({ key: '$mod+p', command: 'file.open' });
      kb.register({ key: '$mod+Shift+p', command: 'sdk.openPalette' });
      const map = kb.buildTinykeysMap(
        async () => {},
        () => true
      );
      expect(Object.keys(map)).toHaveLength(2);
      expect(map['$mod+p']).toBeTypeOf('function');
      expect(map['$mod+Shift+p']).toBeTypeOf('function');
    });

    it('buildTinykeysMap handler skips when when-clause is false', () => {
      kb.register({ key: '$mod+p', command: 'file.open', when: 'editorFocus' });
      let executed = false;
      const map = kb.buildTinykeysMap(
        async () => {
          executed = true;
        },
        () => true
      );
      const fakeEvent = { preventDefault: () => {} } as KeyboardEvent;
      map['$mod+p'](fakeEvent);
      expect(executed).toBe(false);
    });

    it('buildTinykeysMap handler skips when command not available', () => {
      kb.register({ key: '$mod+p', command: 'file.open' });
      let executed = false;
      const map = kb.buildTinykeysMap(
        async () => {
          executed = true;
        },
        () => false
      );
      const fakeEvent = { preventDefault: () => {} } as KeyboardEvent;
      map['$mod+p'](fakeEvent);
      expect(executed).toBe(false);
    });

    it('buildTinykeysMap handler executes when conditions met', () => {
      kb.register({ key: '$mod+p', command: 'file.open' });
      let executedId = '';
      const map = kb.buildTinykeysMap(
        async (id) => {
          executedId = id;
        },
        () => true
      );
      const prevented = { called: false };
      const fakeEvent = {
        preventDefault: () => {
          prevented.called = true;
        },
      } as unknown as KeyboardEvent;
      map['$mod+p'](fakeEvent);
      expect(executedId).toBe('file.open');
      expect(prevented.called).toBe(true);
    });

    it('buildTinykeysMap handler passes args to execute', () => {
      kb.register({ key: '$mod+g', command: 'file.goToLine', args: { line: 42 } });
      let receivedArgs: Record<string, unknown> | undefined;
      const map = kb.buildTinykeysMap(
        async (_id, args) => {
          receivedArgs = args;
        },
        () => true
      );
      const fakeEvent = { preventDefault: () => {} } as KeyboardEvent;
      map['$mod+g'](fakeEvent);
      expect(receivedArgs).toEqual({ line: 42 });
    });
  });
}
