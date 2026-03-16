/**
 * FakeTemplateService — test double for ITemplateService.
 *
 * Provides call tracking arrays and return builders for all methods.
 * Per Constitution P4: full fake implementation, not mocks.
 * Follows FakeWorkflowService pattern.
 */

import type {
  DeleteTemplateResult,
  ITemplateService,
  InstantiateResult,
  ListInstancesResult,
  ListWorkflowsResult,
  RefreshResult,
  SaveFromResult,
  ShowWorkflowResult,
} from '../interfaces/template-service.interface.js';
import type { WorkspaceContext } from '../interfaces/workspace-context.interface.js';
import type { InstanceMetadata } from '../schemas/instance-metadata.schema.js';
import type { TemplateManifest } from '../schemas/workflow-template.schema.js';

export interface SaveFromCall {
  ctx: WorkspaceContext;
  graphSlug: string;
  templateSlug: string;
}

export interface InstantiateCall {
  ctx: WorkspaceContext;
  templateSlug: string;
  instanceId: string;
}

export interface RefreshCall {
  ctx: WorkspaceContext;
  templateSlug: string;
  instanceId: string;
}

export class FakeTemplateService implements ITemplateService {
  // Call tracking
  readonly saveFromCalls: SaveFromCall[] = [];
  readonly listWorkflowsCalls: WorkspaceContext[] = [];
  readonly showWorkflowCalls: Array<{ ctx: WorkspaceContext; slug: string }> = [];
  readonly instantiateCalls: InstantiateCall[] = [];
  readonly listInstancesCalls: Array<{ ctx: WorkspaceContext; slug: string }> = [];
  readonly refreshCalls: RefreshCall[] = [];

  // Preset results
  private workflows: TemplateManifest[] = [];
  private instances: Map<string, InstanceMetadata[]> = new Map();
  private saveFromResult: SaveFromResult = { data: null, errors: [] };
  private instantiateResult: InstantiateResult = { data: null, errors: [] };
  private refreshResult: RefreshResult = { data: null, errors: [] };

  // Return builders
  withWorkflows(workflows: TemplateManifest[]): this {
    this.workflows = workflows;
    return this;
  }

  withInstances(templateSlug: string, instances: InstanceMetadata[]): this {
    this.instances.set(templateSlug, instances);
    return this;
  }

  withSaveFromResult(result: SaveFromResult): this {
    this.saveFromResult = result;
    return this;
  }

  withInstantiateResult(result: InstantiateResult): this {
    this.instantiateResult = result;
    return this;
  }

  withRefreshResult(result: RefreshResult): this {
    this.refreshResult = result;
    return this;
  }

  // ITemplateService implementation
  async saveFrom(
    ctx: WorkspaceContext,
    graphSlug: string,
    templateSlug: string
  ): Promise<SaveFromResult> {
    this.saveFromCalls.push({ ctx, graphSlug, templateSlug });
    return this.saveFromResult;
  }

  async listWorkflows(ctx: WorkspaceContext): Promise<ListWorkflowsResult> {
    this.listWorkflowsCalls.push(ctx);
    return { data: this.workflows, errors: [] };
  }

  async showWorkflow(ctx: WorkspaceContext, templateSlug: string): Promise<ShowWorkflowResult> {
    this.showWorkflowCalls.push({ ctx, slug: templateSlug });
    const found = this.workflows.find((w) => w.slug === templateSlug) ?? null;
    return { data: found, errors: [] };
  }

  async instantiate(
    ctx: WorkspaceContext,
    templateSlug: string,
    instanceId: string
  ): Promise<InstantiateResult> {
    this.instantiateCalls.push({ ctx, templateSlug, instanceId });
    return this.instantiateResult;
  }

  async listInstances(ctx: WorkspaceContext, templateSlug: string): Promise<ListInstancesResult> {
    this.listInstancesCalls.push({ ctx, slug: templateSlug });
    return { data: this.instances.get(templateSlug) ?? [], errors: [] };
  }

  async refresh(
    ctx: WorkspaceContext,
    templateSlug: string,
    instanceId: string
  ): Promise<RefreshResult> {
    this.refreshCalls.push({ ctx, templateSlug, instanceId });
    return this.refreshResult;
  }

  readonly deleteCalls: Array<{ ctx: WorkspaceContext; templateSlug: string }> = [];
  private deleteResult: DeleteTemplateResult = { deleted: true, errors: [] };

  async delete(ctx: WorkspaceContext, templateSlug: string): Promise<DeleteTemplateResult> {
    this.deleteCalls.push({ ctx, templateSlug });
    return this.deleteResult;
  }

  withDeleteResult(result: DeleteTemplateResult): this {
    this.deleteResult = result;
    return this;
  }

  // Test helpers
  reset(): void {
    this.saveFromCalls.length = 0;
    this.listWorkflowsCalls.length = 0;
    this.showWorkflowCalls.length = 0;
    this.instantiateCalls.length = 0;
    this.listInstancesCalls.length = 0;
    this.refreshCalls.length = 0;
    this.deleteCalls.length = 0;
    this.workflows = [];
    this.instances.clear();
    this.saveFromResult = { data: null, errors: [] };
    this.instantiateResult = { data: null, errors: [] };
    this.refreshResult = { data: null, errors: [] };
  }
}
