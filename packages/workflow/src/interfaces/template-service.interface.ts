/**
 * ITemplateService — contract for workflow template management.
 *
 * Templates are created from working graph instances via saveFrom().
 * They bundle graph.yaml + nodes/\/node.yaml + units/ into a reusable
 * directory that can be instantiated multiple times.
 *
 * Per Workshop 002: Templates reuse existing positional graph format.
 * Per Constitution P2: Interface defined before implementation.
 */

import type { ResultError } from '@chainglass/shared';
import type { InstanceMetadata } from '../schemas/instance-metadata.schema.js';
import type { TemplateManifest } from '../schemas/workflow-template.schema.js';
import type { WorkspaceContext } from './workspace-context.interface.js';

/** Result of listing workflow templates */
export interface ListWorkflowsResult {
  data: TemplateManifest[];
  errors: ResultError[];
}

/** Result of showing a single workflow template */
export interface ShowWorkflowResult {
  data: TemplateManifest | null;
  errors: ResultError[];
}

/** Result of saving a graph as a template */
export interface SaveFromResult {
  data: TemplateManifest | null;
  errors: ResultError[];
}

/** Result of instantiating a template */
export interface InstantiateResult {
  data: InstanceMetadata | null;
  errors: ResultError[];
}

/** Result of listing instances */
export interface ListInstancesResult {
  data: InstanceMetadata[];
  errors: ResultError[];
}

/** Result of refreshing instance units */
export interface RefreshResult {
  data: {
    refreshedUnits: string[];
    instanceMetadata: InstanceMetadata;
  } | null;
  errors: ResultError[];
}

export interface ITemplateService {
  /**
   * Save a working graph instance as a reusable template.
   * Copies graph.yaml + nodes/\/node.yaml, bundles referenced work units.
   * Strips runtime state (state.json, outputs/, events).
   */
  saveFrom(ctx: WorkspaceContext, graphSlug: string, templateSlug: string): Promise<SaveFromResult>;

  /** List all workflow templates in the workspace */
  listWorkflows(ctx: WorkspaceContext): Promise<ListWorkflowsResult>;

  /** Show details of a single workflow template */
  showWorkflow(ctx: WorkspaceContext, templateSlug: string): Promise<ShowWorkflowResult>;

  /**
   * Create an independent instance from a template.
   * Copies graph definition + units to instance directory.
   * Initializes fresh runtime state (state.json with pending status).
   */
  instantiate(
    ctx: WorkspaceContext,
    templateSlug: string,
    instanceId: string
  ): Promise<InstantiateResult>;

  /** List all instances created from a workflow template */
  listInstances(ctx: WorkspaceContext, templateSlug: string): Promise<ListInstancesResult>;

  /**
   * Refresh all work units in an instance from its source template.
   * Full directory replacement for each unit.
   * Warns if an active run is detected.
   */
  refresh(ctx: WorkspaceContext, templateSlug: string, instanceId: string): Promise<RefreshResult>;
}
