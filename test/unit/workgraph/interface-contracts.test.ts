/**
 * WorkspaceContext Interface Contract Tests.
 *
 * These tests verify that service interfaces accept WorkspaceContext as the first
 * parameter on all methods. They use type-level assertions that fail at compile
 * time if the signatures don't match.
 *
 * Per DYK#2: The TDD "RED" phase for interface changes is a compile error,
 * not a runtime test failure. If this file compiles, the interfaces are correct.
 *
 * Per Phase 1: Adding ctx: WorkspaceContext to all service method signatures.
 */

import type { WorkspaceContext } from '@chainglass/workflow';
import type {
  IWorkGraphService,
  IWorkNodeService,
  IWorkUnitService,
} from '@chainglass/workgraph/interfaces';
import { describe, expect, it } from 'vitest';

/**
 * Creates a stub WorkspaceContext for type testing.
 * All 7 required fields per WorkspaceContext interface.
 */
function createStubContext(): WorkspaceContext {
  return {
    workspaceSlug: 'test-workspace',
    workspaceName: 'Test Workspace',
    workspacePath: '/test/workspace',
    worktreePath: '/test/workspace',
    worktreeBranch: null,
    isMainWorktree: true,
    hasGit: true,
  };
}

describe('IWorkGraphService contract with WorkspaceContext', () => {
  const ctx = createStubContext();

  it('create() accepts ctx as first parameter', () => {
    // Type-level test: if this compiles, interface accepts ctx
    const service = {} as IWorkGraphService;

    // Verify method signature - this validates ctx is first param
    type CreateParams = Parameters<typeof service.create>;
    type FirstParam = CreateParams[0];

    // If this compiles, ctx is the first parameter
    const _typeCheck: FirstParam = ctx;
    expect(_typeCheck).toBeDefined();
  });

  it('load() accepts ctx as first parameter', () => {
    const service = {} as IWorkGraphService;

    type LoadParams = Parameters<typeof service.load>;
    type FirstParam = LoadParams[0];

    const _typeCheck: FirstParam = ctx;
    expect(_typeCheck).toBeDefined();
  });

  it('show() accepts ctx as first parameter', () => {
    const service = {} as IWorkGraphService;

    type ShowParams = Parameters<typeof service.show>;
    type FirstParam = ShowParams[0];

    const _typeCheck: FirstParam = ctx;
    expect(_typeCheck).toBeDefined();
  });

  it('status() accepts ctx as first parameter', () => {
    const service = {} as IWorkGraphService;

    type StatusParams = Parameters<typeof service.status>;
    type FirstParam = StatusParams[0];

    const _typeCheck: FirstParam = ctx;
    expect(_typeCheck).toBeDefined();
  });

  it('addNodeAfter() accepts ctx as first parameter', () => {
    const service = {} as IWorkGraphService;

    type AddNodeAfterParams = Parameters<typeof service.addNodeAfter>;
    type FirstParam = AddNodeAfterParams[0];

    const _typeCheck: FirstParam = ctx;
    expect(_typeCheck).toBeDefined();
  });

  it('removeNode() accepts ctx as first parameter', () => {
    const service = {} as IWorkGraphService;

    type RemoveNodeParams = Parameters<typeof service.removeNode>;
    type FirstParam = RemoveNodeParams[0];

    const _typeCheck: FirstParam = ctx;
    expect(_typeCheck).toBeDefined();
  });
});

describe('IWorkNodeService contract with WorkspaceContext', () => {
  const ctx = createStubContext();

  it('canRun() accepts ctx as first parameter', () => {
    const service = {} as IWorkNodeService;

    type Params = Parameters<typeof service.canRun>;
    type FirstParam = Params[0];

    const _typeCheck: FirstParam = ctx;
    expect(_typeCheck).toBeDefined();
  });

  it('markReady() accepts ctx as first parameter', () => {
    const service = {} as IWorkNodeService;

    type Params = Parameters<typeof service.markReady>;
    type FirstParam = Params[0];

    const _typeCheck: FirstParam = ctx;
    expect(_typeCheck).toBeDefined();
  });

  it('start() accepts ctx as first parameter', () => {
    const service = {} as IWorkNodeService;

    type Params = Parameters<typeof service.start>;
    type FirstParam = Params[0];

    const _typeCheck: FirstParam = ctx;
    expect(_typeCheck).toBeDefined();
  });

  it('end() accepts ctx as first parameter', () => {
    const service = {} as IWorkNodeService;

    type Params = Parameters<typeof service.end>;
    type FirstParam = Params[0];

    const _typeCheck: FirstParam = ctx;
    expect(_typeCheck).toBeDefined();
  });

  it('canEnd() accepts ctx as first parameter', () => {
    const service = {} as IWorkNodeService;

    type Params = Parameters<typeof service.canEnd>;
    type FirstParam = Params[0];

    const _typeCheck: FirstParam = ctx;
    expect(_typeCheck).toBeDefined();
  });

  it('getInputData() accepts ctx as first parameter', () => {
    const service = {} as IWorkNodeService;

    type Params = Parameters<typeof service.getInputData>;
    type FirstParam = Params[0];

    const _typeCheck: FirstParam = ctx;
    expect(_typeCheck).toBeDefined();
  });

  it('getInputFile() accepts ctx as first parameter', () => {
    const service = {} as IWorkNodeService;

    type Params = Parameters<typeof service.getInputFile>;
    type FirstParam = Params[0];

    const _typeCheck: FirstParam = ctx;
    expect(_typeCheck).toBeDefined();
  });

  it('getOutputData() accepts ctx as first parameter', () => {
    const service = {} as IWorkNodeService;

    type Params = Parameters<typeof service.getOutputData>;
    type FirstParam = Params[0];

    const _typeCheck: FirstParam = ctx;
    expect(_typeCheck).toBeDefined();
  });

  it('saveOutputData() accepts ctx as first parameter', () => {
    const service = {} as IWorkNodeService;

    type Params = Parameters<typeof service.saveOutputData>;
    type FirstParam = Params[0];

    const _typeCheck: FirstParam = ctx;
    expect(_typeCheck).toBeDefined();
  });

  it('saveOutputFile() accepts ctx as first parameter', () => {
    const service = {} as IWorkNodeService;

    type Params = Parameters<typeof service.saveOutputFile>;
    type FirstParam = Params[0];

    const _typeCheck: FirstParam = ctx;
    expect(_typeCheck).toBeDefined();
  });

  it('clear() accepts ctx as first parameter', () => {
    const service = {} as IWorkNodeService;

    type Params = Parameters<typeof service.clear>;
    type FirstParam = Params[0];

    const _typeCheck: FirstParam = ctx;
    expect(_typeCheck).toBeDefined();
  });

  it('ask() accepts ctx as first parameter', () => {
    const service = {} as IWorkNodeService;

    type Params = Parameters<typeof service.ask>;
    type FirstParam = Params[0];

    const _typeCheck: FirstParam = ctx;
    expect(_typeCheck).toBeDefined();
  });

  it('answer() accepts ctx as first parameter', () => {
    const service = {} as IWorkNodeService;

    type Params = Parameters<typeof service.answer>;
    type FirstParam = Params[0];

    const _typeCheck: FirstParam = ctx;
    expect(_typeCheck).toBeDefined();
  });

  it('getAnswer() accepts ctx as first parameter', () => {
    const service = {} as IWorkNodeService;

    type Params = Parameters<typeof service.getAnswer>;
    type FirstParam = Params[0];

    const _typeCheck: FirstParam = ctx;
    expect(_typeCheck).toBeDefined();
  });
});

describe('IWorkUnitService contract with WorkspaceContext', () => {
  const ctx = createStubContext();

  it('list() accepts ctx as first parameter', () => {
    const service = {} as IWorkUnitService;

    type Params = Parameters<typeof service.list>;
    type FirstParam = Params[0];

    const _typeCheck: FirstParam = ctx;
    expect(_typeCheck).toBeDefined();
  });

  it('load() accepts ctx as first parameter', () => {
    const service = {} as IWorkUnitService;

    type Params = Parameters<typeof service.load>;
    type FirstParam = Params[0];

    const _typeCheck: FirstParam = ctx;
    expect(_typeCheck).toBeDefined();
  });

  it('create() accepts ctx as first parameter', () => {
    const service = {} as IWorkUnitService;

    type Params = Parameters<typeof service.create>;
    type FirstParam = Params[0];

    const _typeCheck: FirstParam = ctx;
    expect(_typeCheck).toBeDefined();
  });

  it('validate() accepts ctx as first parameter', () => {
    const service = {} as IWorkUnitService;

    type Params = Parameters<typeof service.validate>;
    type FirstParam = Params[0];

    const _typeCheck: FirstParam = ctx;
    expect(_typeCheck).toBeDefined();
  });
});
