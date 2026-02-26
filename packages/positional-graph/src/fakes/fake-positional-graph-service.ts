/**
 * FakePositionalGraphService — Proxy-based test double for IPositionalGraphService.
 *
 * Uses a JavaScript Proxy to auto-stub all 50+ methods:
 * - Every call is tracked in `calls` map (method name → args array)
 * - Unimplemented methods return `{ data: null, errors: [] }`
 * - UI-critical methods have `with*Result()` builders for preset returns
 *
 * Per Constitution P4: full fake, not mocks.
 * Per DYK-I2: Proxy cuts from ~600 lines to ~200.
 */

import type { BaseResult } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import type { InspectResult } from '../features/040-graph-inspect/index.js';
import type {
  AddLineResult,
  AddNodeResult,
  GraphCreateResult,
  GraphStatusResult,
  IPositionalGraphService,
  InputPack,
  LineStatusResult,
  NodeShowResult,
  NodeStatusResult,
  PGListResult,
  PGLoadResult,
  PGShowResult,
} from '../interfaces/positional-graph-service.interface.js';
import type { State } from '../schemas/index.js';

// Default empty results
const emptyBaseResult: BaseResult = { errors: [] };

/**
 * Create a FakePositionalGraphService with Proxy-based auto-stubbing.
 *
 * Usage:
 * ```ts
 * const fake = new FakePositionalGraphService();
 * fake.withListResult({ slugs: ['demo-1'], errors: [] });
 * const result = await fake.list(ctx);
 * expect(fake.calls.get('list')).toHaveLength(1);
 * ```
 */
export class FakePositionalGraphService implements IPositionalGraphService {
  /** All method calls: method name → array of argument arrays */
  readonly calls = new Map<string, unknown[][]>();

  // Preset results for UI-critical methods
  private _createResult: GraphCreateResult = { ...emptyBaseResult, graphSlug: '', lineId: '' };
  private _loadResult: PGLoadResult = { ...emptyBaseResult };
  private _showResult: PGShowResult = { ...emptyBaseResult };
  private _listResult: PGListResult = { ...emptyBaseResult, slugs: [] };
  private _addLineResult: AddLineResult = { ...emptyBaseResult };
  private _addNodeResult: AddNodeResult = { ...emptyBaseResult };
  private _showNodeResult: NodeShowResult = { ...emptyBaseResult };
  private _statusResult: GraphStatusResult | null = null;
  private _nodeStatusResult: NodeStatusResult | null = null;
  private _lineStatusResult: LineStatusResult | null = null;
  private _collateResult: InputPack = { inputs: {}, ok: true };
  private _state: State | null = null;

  // Return builders
  withCreateResult(result: GraphCreateResult): this {
    this._createResult = result;
    return this;
  }
  withLoadResult(result: PGLoadResult): this {
    this._loadResult = result;
    return this;
  }
  withShowResult(result: PGShowResult): this {
    this._showResult = result;
    return this;
  }
  withListResult(result: PGListResult): this {
    this._listResult = result;
    return this;
  }
  withAddLineResult(result: AddLineResult): this {
    this._addLineResult = result;
    return this;
  }
  withAddNodeResult(result: AddNodeResult): this {
    this._addNodeResult = result;
    return this;
  }
  withShowNodeResult(result: NodeShowResult): this {
    this._showNodeResult = result;
    return this;
  }
  withStatusResult(result: GraphStatusResult): this {
    this._statusResult = result;
    return this;
  }
  withNodeStatusResult(result: NodeStatusResult): this {
    this._nodeStatusResult = result;
    return this;
  }
  withLineStatusResult(result: LineStatusResult): this {
    this._lineStatusResult = result;
    return this;
  }
  withCollateResult(result: InputPack): this {
    this._collateResult = result;
    return this;
  }
  withState(state: State): this {
    this._state = state;
    return this;
  }

  private track(method: string, args: unknown[]): void {
    const existing = this.calls.get(method);
    if (existing) {
      existing.push(args);
    } else {
      this.calls.set(method, [args]);
    }
  }

  // UI-critical methods with real return builders

  async create(ctx: WorkspaceContext, slug: string): Promise<GraphCreateResult> {
    this.track('create', [ctx, slug]);
    return this._createResult;
  }

  async load(ctx: WorkspaceContext, slug: string): Promise<PGLoadResult> {
    this.track('load', [ctx, slug]);
    return this._loadResult;
  }

  async show(ctx: WorkspaceContext, slug: string): Promise<PGShowResult> {
    this.track('show', [ctx, slug]);
    return this._showResult;
  }

  async list(ctx: WorkspaceContext): Promise<PGListResult> {
    this.track('list', [ctx]);
    return this._listResult;
  }

  async delete(ctx: WorkspaceContext, slug: string): Promise<BaseResult> {
    this.track('delete', [ctx, slug]);
    return emptyBaseResult;
  }

  async addLine(
    ctx: WorkspaceContext,
    graphSlug: string,
    options?: unknown
  ): Promise<AddLineResult> {
    this.track('addLine', [ctx, graphSlug, options]);
    return this._addLineResult;
  }

  async removeLine(ctx: WorkspaceContext, graphSlug: string, lineId: string): Promise<BaseResult> {
    this.track('removeLine', [ctx, graphSlug, lineId]);
    return emptyBaseResult;
  }

  async moveLine(
    ctx: WorkspaceContext,
    graphSlug: string,
    lineId: string,
    toIndex: number
  ): Promise<BaseResult> {
    this.track('moveLine', [ctx, graphSlug, lineId, toIndex]);
    return emptyBaseResult;
  }

  async setLineLabel(
    ctx: WorkspaceContext,
    graphSlug: string,
    lineId: string,
    label: string
  ): Promise<BaseResult> {
    this.track('setLineLabel', [ctx, graphSlug, lineId, label]);
    return emptyBaseResult;
  }

  async setLineDescription(
    ctx: WorkspaceContext,
    graphSlug: string,
    lineId: string,
    desc: string
  ): Promise<BaseResult> {
    this.track('setLineDescription', [ctx, graphSlug, lineId, desc]);
    return emptyBaseResult;
  }

  async addNode(
    ctx: WorkspaceContext,
    graphSlug: string,
    lineId: string,
    unitSlug: string,
    options?: unknown
  ): Promise<AddNodeResult> {
    this.track('addNode', [ctx, graphSlug, lineId, unitSlug, options]);
    return this._addNodeResult;
  }

  async removeNode(ctx: WorkspaceContext, graphSlug: string, nodeId: string): Promise<BaseResult> {
    this.track('removeNode', [ctx, graphSlug, nodeId]);
    return emptyBaseResult;
  }

  async moveNode(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    options: unknown
  ): Promise<BaseResult> {
    this.track('moveNode', [ctx, graphSlug, nodeId, options]);
    return emptyBaseResult;
  }

  async setNodeDescription(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    desc: string
  ): Promise<BaseResult> {
    this.track('setNodeDescription', [ctx, graphSlug, nodeId, desc]);
    return emptyBaseResult;
  }

  async showNode(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string
  ): Promise<NodeShowResult> {
    this.track('showNode', [ctx, graphSlug, nodeId]);
    return this._showNodeResult;
  }

  async setInput(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    inputName: string,
    source: unknown
  ): Promise<BaseResult> {
    this.track('setInput', [ctx, graphSlug, nodeId, inputName, source]);
    return emptyBaseResult;
  }

  async removeInput(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    inputName: string
  ): Promise<BaseResult> {
    this.track('removeInput', [ctx, graphSlug, nodeId, inputName]);
    return emptyBaseResult;
  }

  async collateInputs(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string
  ): Promise<InputPack> {
    this.track('collateInputs', [ctx, graphSlug, nodeId]);
    return this._collateResult;
  }

  async getNodeStatus(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string
  ): Promise<NodeStatusResult> {
    this.track('getNodeStatus', [ctx, graphSlug, nodeId]);
    if (!this._nodeStatusResult) {
      throw new Error(
        'FakePositionalGraphService: call withNodeStatusResult() before getNodeStatus()'
      );
    }
    return this._nodeStatusResult;
  }

  async getLineStatus(
    ctx: WorkspaceContext,
    graphSlug: string,
    lineId: string
  ): Promise<LineStatusResult> {
    this.track('getLineStatus', [ctx, graphSlug, lineId]);
    if (!this._lineStatusResult) {
      throw new Error(
        'FakePositionalGraphService: call withLineStatusResult() before getLineStatus()'
      );
    }
    return this._lineStatusResult;
  }

  async getStatus(ctx: WorkspaceContext, graphSlug: string): Promise<GraphStatusResult> {
    this.track('getStatus', [ctx, graphSlug]);
    if (!this._statusResult) {
      throw new Error('FakePositionalGraphService: call withStatusResult() before getStatus()');
    }
    return this._statusResult;
  }

  async inspectGraph(ctx: WorkspaceContext, graphSlug: string): Promise<InspectResult> {
    this.track('inspectGraph', [ctx, graphSlug]);
    return {
      graphSlug,
      graphStatus: 'pending',
      updatedAt: new Date().toISOString(),
      totalNodes: 0,
      completedNodes: 0,
      failedNodes: 0,
      errors: [],
      lines: [],
      nodes: [],
    } as InspectResult;
  }

  async triggerTransition(
    ctx: WorkspaceContext,
    graphSlug: string,
    lineId: string
  ): Promise<BaseResult> {
    this.track('triggerTransition', [ctx, graphSlug, lineId]);
    return emptyBaseResult;
  }

  async updateGraphProperties(
    ctx: WorkspaceContext,
    graphSlug: string,
    properties: unknown
  ): Promise<BaseResult> {
    this.track('updateGraphProperties', [ctx, graphSlug, properties]);
    return emptyBaseResult;
  }

  async updateLineProperties(
    ctx: WorkspaceContext,
    graphSlug: string,
    lineId: string,
    properties: unknown
  ): Promise<BaseResult> {
    this.track('updateLineProperties', [ctx, graphSlug, lineId, properties]);
    return emptyBaseResult;
  }

  async updateNodeProperties(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    properties: unknown
  ): Promise<BaseResult> {
    this.track('updateNodeProperties', [ctx, graphSlug, nodeId, properties]);
    return emptyBaseResult;
  }

  async updateGraphOrchestratorSettings(
    ctx: WorkspaceContext,
    graphSlug: string,
    settings: unknown
  ): Promise<BaseResult> {
    this.track('updateGraphOrchestratorSettings', [ctx, graphSlug, settings]);
    return emptyBaseResult;
  }

  async updateLineOrchestratorSettings(
    ctx: WorkspaceContext,
    graphSlug: string,
    lineId: string,
    settings: unknown
  ): Promise<BaseResult> {
    this.track('updateLineOrchestratorSettings', [ctx, graphSlug, lineId, settings]);
    return emptyBaseResult;
  }

  async updateNodeOrchestratorSettings(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    settings: unknown
  ): Promise<BaseResult> {
    this.track('updateNodeOrchestratorSettings', [ctx, graphSlug, nodeId, settings]);
    return emptyBaseResult;
  }

  async saveOutputData(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    outputName: string,
    value: unknown
  ) {
    this.track('saveOutputData', [ctx, graphSlug, nodeId, outputName, value]);
    return { ...emptyBaseResult, nodeId, outputName, saved: true };
  }

  async saveOutputFile(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    outputName: string,
    sourcePath: string
  ) {
    this.track('saveOutputFile', [ctx, graphSlug, nodeId, outputName, sourcePath]);
    return { ...emptyBaseResult, nodeId, outputName, saved: true };
  }

  async getOutputData(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    outputName: string
  ) {
    this.track('getOutputData', [ctx, graphSlug, nodeId, outputName]);
    return { ...emptyBaseResult, nodeId, outputName };
  }

  async getOutputFile(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    outputName: string
  ) {
    this.track('getOutputFile', [ctx, graphSlug, nodeId, outputName]);
    return { ...emptyBaseResult, nodeId, outputName };
  }

  async startNode(ctx: WorkspaceContext, graphSlug: string, nodeId: string) {
    this.track('startNode', [ctx, graphSlug, nodeId]);
    return {
      ...emptyBaseResult,
      nodeId,
      status: 'starting' as const,
      startedAt: new Date().toISOString(),
    };
  }

  async canEnd(ctx: WorkspaceContext, graphSlug: string, nodeId: string) {
    this.track('canEnd', [ctx, graphSlug, nodeId]);
    return { ...emptyBaseResult, nodeId, canEnd: true, savedOutputs: [], missingOutputs: [] };
  }

  async endNode(ctx: WorkspaceContext, graphSlug: string, nodeId: string, message?: string) {
    this.track('endNode', [ctx, graphSlug, nodeId, message]);
    return {
      ...emptyBaseResult,
      nodeId,
      status: 'complete' as const,
      completedAt: new Date().toISOString(),
    };
  }

  async askQuestion(ctx: WorkspaceContext, graphSlug: string, nodeId: string, options: unknown) {
    this.track('askQuestion', [ctx, graphSlug, nodeId, options]);
    return {
      ...emptyBaseResult,
      nodeId,
      questionId: 'q-fake-1',
      status: 'waiting-question' as const,
    };
  }

  async answerQuestion(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    questionId: string,
    answer: unknown
  ) {
    this.track('answerQuestion', [ctx, graphSlug, nodeId, questionId, answer]);
    return { ...emptyBaseResult, nodeId, questionId, status: 'waiting-question' as const };
  }

  async getAnswer(ctx: WorkspaceContext, graphSlug: string, nodeId: string, questionId: string) {
    this.track('getAnswer', [ctx, graphSlug, nodeId, questionId]);
    return { ...emptyBaseResult, nodeId, questionId, answered: false };
  }

  async getInputData(ctx: WorkspaceContext, graphSlug: string, nodeId: string, inputName: string) {
    this.track('getInputData', [ctx, graphSlug, nodeId, inputName]);
    return { ...emptyBaseResult, nodeId, inputName, sources: [], complete: false };
  }

  async getInputFile(ctx: WorkspaceContext, graphSlug: string, nodeId: string, inputName: string) {
    this.track('getInputFile', [ctx, graphSlug, nodeId, inputName]);
    return { ...emptyBaseResult, nodeId, inputName, sources: [], complete: false };
  }

  async raiseNodeEvent(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    eventType: string,
    payload: unknown,
    source: unknown
  ) {
    this.track('raiseNodeEvent', [ctx, graphSlug, nodeId, eventType, payload, source]);
    return { ...emptyBaseResult, nodeId };
  }

  async getNodeEvents(ctx: WorkspaceContext, graphSlug: string, nodeId: string, filter?: unknown) {
    this.track('getNodeEvents', [ctx, graphSlug, nodeId, filter]);
    return { ...emptyBaseResult, nodeId, events: [] };
  }

  async stampNodeEvent(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    eventId: string,
    subscriber: string,
    action: string,
    data?: unknown
  ) {
    this.track('stampNodeEvent', [ctx, graphSlug, nodeId, eventId, subscriber, action, data]);
    return { ...emptyBaseResult, nodeId, eventId, subscriber };
  }

  async loadGraphState(ctx: WorkspaceContext, graphSlug: string): Promise<State> {
    this.track('loadGraphState', [ctx, graphSlug]);
    return (
      this._state ?? { graph_status: 'pending', updated_at: new Date().toISOString(), nodes: {} }
    );
  }

  async persistGraphState(ctx: WorkspaceContext, graphSlug: string, state: State): Promise<void> {
    this.track('persistGraphState', [ctx, graphSlug, state]);
    this._state = state;
  }

  /** Reset all call tracking and preset results */
  reset(): void {
    this.calls.clear();
    this._createResult = { ...emptyBaseResult, graphSlug: '', lineId: '' };
    this._loadResult = { ...emptyBaseResult };
    this._showResult = { ...emptyBaseResult };
    this._listResult = { ...emptyBaseResult, slugs: [] };
    this._addLineResult = { ...emptyBaseResult };
    this._addNodeResult = { ...emptyBaseResult };
    this._showNodeResult = { ...emptyBaseResult };
    this._statusResult = null;
    this._nodeStatusResult = null;
    this._lineStatusResult = null;
    this._collateResult = { inputs: {}, ok: true };
    this._state = null;
  }
}
