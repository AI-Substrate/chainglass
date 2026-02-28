/**
 * FakeInstanceService — test double for IInstanceService.
 *
 * Provides call tracking and preset results for status queries.
 * Per Constitution P4: full fake implementation, not mocks.
 */

import type {
  GetStatusResult,
  IInstanceService,
  InstanceStatus,
} from '../interfaces/instance-service.interface.js';
import type { WorkspaceContext } from '../interfaces/workspace-context.interface.js';

export interface GetStatusCall {
  ctx: WorkspaceContext;
  templateSlug: string;
  instanceId: string;
}

export class FakeInstanceService implements IInstanceService {
  // Call tracking
  readonly getStatusCalls: GetStatusCall[] = [];

  // Preset results
  private statuses: Map<string, InstanceStatus> = new Map();

  // Return builders
  withStatus(templateSlug: string, instanceId: string, status: InstanceStatus): this {
    this.statuses.set(`${templateSlug}/${instanceId}`, status);
    return this;
  }

  // IInstanceService implementation
  async getStatus(
    ctx: WorkspaceContext,
    templateSlug: string,
    instanceId: string
  ): Promise<GetStatusResult> {
    this.getStatusCalls.push({ ctx, templateSlug, instanceId });
    const key = `${templateSlug}/${instanceId}`;
    const status = this.statuses.get(key) ?? null;
    return { data: status, errors: [] };
  }

  // Test helpers
  reset(): void {
    this.getStatusCalls.length = 0;
    this.statuses.clear();
  }
}
