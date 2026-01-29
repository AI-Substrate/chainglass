/**
 * FakeWorkNodeService for testing.
 *
 * Per Discovery 08: Fakes need call capture for CLI testing.
 * This fake captures all canRun(), start(), end(), getInputData(),
 * saveOutputData() calls for test assertions and can be configured with preset results.
 * Per Plan 021: All methods accept WorkspaceContext as first parameter (ignored by fake).
 */

import type { WorkspaceContext } from '@chainglass/workflow';

import type {
  AnswerResult,
  AskResult,
  CanEndResult,
  CanRunResult,
  ClearOptions,
  ClearResult,
  EndResult,
  GetAnswerResult,
  GetInputDataResult,
  GetInputFileResult,
  GetOutputDataResult,
  IWorkNodeService,
  MarkReadyResult,
  Question,
  SaveOutputDataResult,
  SaveOutputFileResult,
  StartResult,
} from '../interfaces/index.js';

// ============================================
// Call Types (with ctx for workspace tracking)
// ============================================

export interface CanRunCall {
  ctx: WorkspaceContext;
  graphSlug: string;
  nodeId: string;
  timestamp: string;
  result: CanRunResult;
}

export interface MarkReadyCall {
  ctx: WorkspaceContext;
  graphSlug: string;
  nodeId: string;
  timestamp: string;
  result: MarkReadyResult;
}

export interface StartCall {
  ctx: WorkspaceContext;
  graphSlug: string;
  nodeId: string;
  timestamp: string;
  result: StartResult;
}

export interface EndCall {
  ctx: WorkspaceContext;
  graphSlug: string;
  nodeId: string;
  timestamp: string;
  result: EndResult;
}

export interface CanEndCall {
  ctx: WorkspaceContext;
  graphSlug: string;
  nodeId: string;
  timestamp: string;
  result: CanEndResult;
}

export interface GetInputDataCall {
  ctx: WorkspaceContext;
  graphSlug: string;
  nodeId: string;
  inputName: string;
  timestamp: string;
  result: GetInputDataResult;
}

export interface GetInputFileCall {
  ctx: WorkspaceContext;
  graphSlug: string;
  nodeId: string;
  inputName: string;
  timestamp: string;
  result: GetInputFileResult;
}

export interface GetOutputDataCall {
  ctx: WorkspaceContext;
  graphSlug: string;
  nodeId: string;
  outputName: string;
  timestamp: string;
  result: GetOutputDataResult;
}

export interface SaveOutputDataCall {
  ctx: WorkspaceContext;
  graphSlug: string;
  nodeId: string;
  outputName: string;
  value: unknown;
  timestamp: string;
  result: SaveOutputDataResult;
}

export interface SaveOutputFileCall {
  ctx: WorkspaceContext;
  graphSlug: string;
  nodeId: string;
  outputName: string;
  sourcePath: string;
  timestamp: string;
  result: SaveOutputFileResult;
}

export interface ClearCall {
  ctx: WorkspaceContext;
  graphSlug: string;
  nodeId: string;
  options: ClearOptions;
  timestamp: string;
  result: ClearResult;
}

export interface AskCall {
  ctx: WorkspaceContext;
  graphSlug: string;
  nodeId: string;
  question: Question;
  timestamp: string;
  result: AskResult;
}

export interface AnswerCall {
  ctx: WorkspaceContext;
  graphSlug: string;
  nodeId: string;
  questionId: string;
  answer: unknown;
  timestamp: string;
  result: AnswerResult;
}

export interface GetAnswerCall {
  ctx: WorkspaceContext;
  graphSlug: string;
  nodeId: string;
  questionId: string;
  timestamp: string;
  result: GetAnswerResult;
}

// ============================================
// Fake Implementation
// ============================================

/**
 * Fake WorkNode service for testing.
 * Uses composite keys (worktreePath|graphSlug:nodeId[:extra]) for workspace isolation.
 */
export class FakeWorkNodeService implements IWorkNodeService {
  private canRunCalls: CanRunCall[] = [];
  private markReadyCalls: MarkReadyCall[] = [];
  private startCalls: StartCall[] = [];
  private endCalls: EndCall[] = [];
  private canEndCalls: CanEndCall[] = [];
  private getInputDataCalls: GetInputDataCall[] = [];
  private getInputFileCalls: GetInputFileCall[] = [];
  private getOutputDataCalls: GetOutputDataCall[] = [];
  private saveOutputDataCalls: SaveOutputDataCall[] = [];
  private saveOutputFileCalls: SaveOutputFileCall[] = [];
  private clearCalls: ClearCall[] = [];
  private askCalls: AskCall[] = [];
  private answerCalls: AnswerCall[] = [];
  private getAnswerCallsArr: GetAnswerCall[] = [];

  private presetCanRunResults = new Map<string, CanRunResult>();
  private presetMarkReadyResults = new Map<string, MarkReadyResult>();
  private presetStartResults = new Map<string, StartResult>();
  private presetEndResults = new Map<string, EndResult>();
  private presetCanEndResults = new Map<string, CanEndResult>();
  private presetGetInputDataResults = new Map<string, GetInputDataResult>();
  private presetGetInputFileResults = new Map<string, GetInputFileResult>();
  private presetGetOutputDataResults = new Map<string, GetOutputDataResult>();
  private presetSaveOutputDataResults = new Map<string, SaveOutputDataResult>();
  private presetSaveOutputFileResults = new Map<string, SaveOutputFileResult>();
  private presetClearResults = new Map<string, ClearResult>();
  private presetAskResults = new Map<string, AskResult>();
  private presetAnswerResults = new Map<string, AnswerResult>();
  private presetGetAnswerResults = new Map<string, GetAnswerResult>();

  // ==================== Key Helper ====================

  private getKey(ctx: WorkspaceContext, ...parts: string[]): string {
    if (!ctx?.worktreePath) {
      throw new Error('FakeWorkNodeService: ctx.worktreePath is required for key generation');
    }
    return `${ctx.worktreePath}|${parts.filter(Boolean).join(':')}`;
  }

  // ==================== CanRun ====================

  getCanRunCalls(): CanRunCall[] {
    return [...this.canRunCalls];
  }

  getLastCanRunCall(): CanRunCall | null {
    return this.canRunCalls.length > 0 ? this.canRunCalls[this.canRunCalls.length - 1] : null;
  }

  setPresetCanRunResult(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    result: CanRunResult
  ): void {
    this.presetCanRunResults.set(this.getKey(ctx, graphSlug, nodeId), result);
  }

  async canRun(ctx: WorkspaceContext, graphSlug: string, nodeId: string): Promise<CanRunResult> {
    const key = this.getKey(ctx, graphSlug, nodeId);
    const result = this.presetCanRunResults.get(key) ?? {
      canRun: true,
      errors: [],
    };

    this.canRunCalls.push({
      ctx,
      graphSlug,
      nodeId,
      timestamp: new Date().toISOString(),
      result,
    });

    return result;
  }

  // ==================== MarkReady ====================

  getMarkReadyCalls(): MarkReadyCall[] {
    return [...this.markReadyCalls];
  }

  getLastMarkReadyCall(): MarkReadyCall | null {
    return this.markReadyCalls.length > 0
      ? this.markReadyCalls[this.markReadyCalls.length - 1]
      : null;
  }

  setPresetMarkReadyResult(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    result: MarkReadyResult
  ): void {
    this.presetMarkReadyResults.set(this.getKey(ctx, graphSlug, nodeId), result);
  }

  async markReady(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string
  ): Promise<MarkReadyResult> {
    const key = this.getKey(ctx, graphSlug, nodeId);
    const result = this.presetMarkReadyResults.get(key) ?? {
      nodeId,
      status: 'ready',
      readyAt: new Date().toISOString(),
      errors: [],
    };

    this.markReadyCalls.push({
      ctx,
      graphSlug,
      nodeId,
      timestamp: new Date().toISOString(),
      result,
    });

    return result;
  }

  // ==================== Start ====================

  getStartCalls(): StartCall[] {
    return [...this.startCalls];
  }

  getLastStartCall(): StartCall | null {
    return this.startCalls.length > 0 ? this.startCalls[this.startCalls.length - 1] : null;
  }

  setPresetStartResult(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    result: StartResult
  ): void {
    this.presetStartResults.set(this.getKey(ctx, graphSlug, nodeId), result);
  }

  async start(ctx: WorkspaceContext, graphSlug: string, nodeId: string): Promise<StartResult> {
    const key = this.getKey(ctx, graphSlug, nodeId);
    const result = this.presetStartResults.get(key) ?? {
      nodeId,
      status: 'running',
      startedAt: new Date().toISOString(),
      errors: [],
    };

    this.startCalls.push({
      ctx,
      graphSlug,
      nodeId,
      timestamp: new Date().toISOString(),
      result,
    });

    return result;
  }

  // ==================== End ====================

  getEndCalls(): EndCall[] {
    return [...this.endCalls];
  }

  getLastEndCall(): EndCall | null {
    return this.endCalls.length > 0 ? this.endCalls[this.endCalls.length - 1] : null;
  }

  setPresetEndResult(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    result: EndResult
  ): void {
    this.presetEndResults.set(this.getKey(ctx, graphSlug, nodeId), result);
  }

  async end(ctx: WorkspaceContext, graphSlug: string, nodeId: string): Promise<EndResult> {
    const key = this.getKey(ctx, graphSlug, nodeId);
    const result = this.presetEndResults.get(key) ?? {
      nodeId,
      status: 'complete',
      completedAt: new Date().toISOString(),
      errors: [],
    };

    this.endCalls.push({
      ctx,
      graphSlug,
      nodeId,
      timestamp: new Date().toISOString(),
      result,
    });

    return result;
  }

  // ==================== CanEnd ====================

  getCanEndCalls(): CanEndCall[] {
    return [...this.canEndCalls];
  }

  getLastCanEndCall(): CanEndCall | null {
    return this.canEndCalls.length > 0 ? this.canEndCalls[this.canEndCalls.length - 1] : null;
  }

  setPresetCanEndResult(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    result: CanEndResult
  ): void {
    this.presetCanEndResults.set(this.getKey(ctx, graphSlug, nodeId), result);
  }

  async canEnd(ctx: WorkspaceContext, graphSlug: string, nodeId: string): Promise<CanEndResult> {
    const key = this.getKey(ctx, graphSlug, nodeId);
    const result = this.presetCanEndResults.get(key) ?? {
      nodeId,
      canEnd: true,
      errors: [],
    };

    this.canEndCalls.push({
      ctx,
      graphSlug,
      nodeId,
      timestamp: new Date().toISOString(),
      result,
    });

    return result;
  }

  // ==================== GetInputData ====================

  getGetInputDataCalls(): GetInputDataCall[] {
    return [...this.getInputDataCalls];
  }

  getLastGetInputDataCall(): GetInputDataCall | null {
    return this.getInputDataCalls.length > 0
      ? this.getInputDataCalls[this.getInputDataCalls.length - 1]
      : null;
  }

  setPresetGetInputDataResult(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    inputName: string,
    result: GetInputDataResult
  ): void {
    this.presetGetInputDataResults.set(this.getKey(ctx, graphSlug, nodeId, inputName), result);
  }

  async getInputData(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    inputName: string
  ): Promise<GetInputDataResult> {
    const key = this.getKey(ctx, graphSlug, nodeId, inputName);
    const result = this.presetGetInputDataResults.get(key) ?? {
      nodeId,
      inputName,
      value: undefined,
      errors: [
        {
          code: 'E117',
          message: `Input '${inputName}' not available for node '${nodeId}'`,
          action: 'Ensure upstream node has completed and produced this output',
        },
      ],
    };

    this.getInputDataCalls.push({
      ctx,
      graphSlug,
      nodeId,
      inputName,
      timestamp: new Date().toISOString(),
      result,
    });

    return result;
  }

  // ==================== GetInputFile ====================

  getGetInputFileCalls(): GetInputFileCall[] {
    return [...this.getInputFileCalls];
  }

  getLastGetInputFileCall(): GetInputFileCall | null {
    return this.getInputFileCalls.length > 0
      ? this.getInputFileCalls[this.getInputFileCalls.length - 1]
      : null;
  }

  setPresetGetInputFileResult(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    inputName: string,
    result: GetInputFileResult
  ): void {
    this.presetGetInputFileResults.set(this.getKey(ctx, graphSlug, nodeId, inputName), result);
  }

  async getInputFile(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    inputName: string
  ): Promise<GetInputFileResult> {
    const key = this.getKey(ctx, graphSlug, nodeId, inputName);
    const result = this.presetGetInputFileResults.get(key) ?? {
      nodeId,
      inputName,
      filePath: undefined,
      errors: [
        {
          code: 'E117',
          message: `Input file '${inputName}' not available for node '${nodeId}'`,
          action: 'Ensure upstream node has completed and produced this file output',
        },
      ],
    };

    this.getInputFileCalls.push({
      ctx,
      graphSlug,
      nodeId,
      inputName,
      timestamp: new Date().toISOString(),
      result,
    });

    return result;
  }

  // ==================== GetOutputData ====================

  getGetOutputDataCalls(): GetOutputDataCall[] {
    return [...this.getOutputDataCalls];
  }

  getLastGetOutputDataCall(): GetOutputDataCall | null {
    return this.getOutputDataCalls.length > 0
      ? this.getOutputDataCalls[this.getOutputDataCalls.length - 1]
      : null;
  }

  setPresetGetOutputDataResult(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    outputName: string,
    result: GetOutputDataResult
  ): void {
    this.presetGetOutputDataResults.set(this.getKey(ctx, graphSlug, nodeId, outputName), result);
  }

  async getOutputData(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    outputName: string
  ): Promise<GetOutputDataResult> {
    const key = this.getKey(ctx, graphSlug, nodeId, outputName);
    const result = this.presetGetOutputDataResults.get(key) ?? {
      nodeId,
      outputName,
      value: undefined,
      errors: [
        {
          code: 'E118',
          message: `Output '${outputName}' not found in node '${nodeId}'`,
          action: `Ensure the node has saved output '${outputName}'`,
        },
      ],
    };

    this.getOutputDataCalls.push({
      ctx,
      graphSlug,
      nodeId,
      outputName,
      timestamp: new Date().toISOString(),
      result,
    });

    return result;
  }

  // ==================== SaveOutputData ====================

  getSaveOutputDataCalls(): SaveOutputDataCall[] {
    return [...this.saveOutputDataCalls];
  }

  getLastSaveOutputDataCall(): SaveOutputDataCall | null {
    return this.saveOutputDataCalls.length > 0
      ? this.saveOutputDataCalls[this.saveOutputDataCalls.length - 1]
      : null;
  }

  setPresetSaveOutputDataResult(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    outputName: string,
    result: SaveOutputDataResult
  ): void {
    this.presetSaveOutputDataResults.set(this.getKey(ctx, graphSlug, nodeId, outputName), result);
  }

  async saveOutputData(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    outputName: string,
    value: unknown
  ): Promise<SaveOutputDataResult> {
    const key = this.getKey(ctx, graphSlug, nodeId, outputName);
    const result = this.presetSaveOutputDataResults.get(key) ?? {
      nodeId,
      outputName,
      saved: true,
      errors: [],
    };

    this.saveOutputDataCalls.push({
      ctx,
      graphSlug,
      nodeId,
      outputName,
      value,
      timestamp: new Date().toISOString(),
      result,
    });

    return result;
  }

  // ==================== SaveOutputFile ====================

  getSaveOutputFileCalls(): SaveOutputFileCall[] {
    return [...this.saveOutputFileCalls];
  }

  getLastSaveOutputFileCall(): SaveOutputFileCall | null {
    return this.saveOutputFileCalls.length > 0
      ? this.saveOutputFileCalls[this.saveOutputFileCalls.length - 1]
      : null;
  }

  setPresetSaveOutputFileResult(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    outputName: string,
    result: SaveOutputFileResult
  ): void {
    this.presetSaveOutputFileResults.set(this.getKey(ctx, graphSlug, nodeId, outputName), result);
  }

  async saveOutputFile(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    outputName: string,
    sourcePath: string
  ): Promise<SaveOutputFileResult> {
    const key = this.getKey(ctx, graphSlug, nodeId, outputName);
    const result = this.presetSaveOutputFileResults.get(key) ?? {
      nodeId,
      outputName,
      saved: true,
      savedPath: `.chainglass/data/work-graphs/${graphSlug}/nodes/${nodeId}/data/outputs/${outputName}.md`,
      errors: [],
    };

    this.saveOutputFileCalls.push({
      ctx,
      graphSlug,
      nodeId,
      outputName,
      sourcePath,
      timestamp: new Date().toISOString(),
      result,
    });

    return result;
  }

  // ==================== Clear ====================

  getClearCalls(): ClearCall[] {
    return [...this.clearCalls];
  }

  getLastClearCall(): ClearCall | null {
    return this.clearCalls.length > 0 ? this.clearCalls[this.clearCalls.length - 1] : null;
  }

  setPresetClearResult(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    result: ClearResult
  ): void {
    this.presetClearResults.set(this.getKey(ctx, graphSlug, nodeId), result);
  }

  async clear(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    options: ClearOptions
  ): Promise<ClearResult> {
    const key = this.getKey(ctx, graphSlug, nodeId);

    // Default: require force, return error without it
    const result =
      this.presetClearResults.get(key) ??
      (options.force
        ? {
            nodeId,
            status: 'pending',
            clearedOutputs: [],
            errors: [],
          }
        : {
            nodeId,
            status: '',
            clearedOutputs: [],
            errors: [
              {
                code: 'E124',
                message: `Clear requires --force flag. Node '${nodeId}' has outputs that will be permanently deleted.`,
                action: 'Run with --force to confirm clearing this node',
              },
            ],
          });

    this.clearCalls.push({
      ctx,
      graphSlug,
      nodeId,
      options,
      timestamp: new Date().toISOString(),
      result,
    });

    return result;
  }

  // ==================== Ask ====================

  getAskCalls(): AskCall[] {
    return [...this.askCalls];
  }

  getLastAskCall(): AskCall | null {
    return this.askCalls.length > 0 ? this.askCalls[this.askCalls.length - 1] : null;
  }

  setPresetAskResult(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    result: AskResult
  ): void {
    this.presetAskResults.set(this.getKey(ctx, graphSlug, nodeId), result);
  }

  async ask(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    question: Question
  ): Promise<AskResult> {
    const key = this.getKey(ctx, graphSlug, nodeId);
    const questionId = `q-${Date.now()}`;
    const result = this.presetAskResults.get(key) ?? {
      nodeId,
      status: 'waiting-question',
      questionId,
      question,
      errors: [],
    };

    this.askCalls.push({
      ctx,
      graphSlug,
      nodeId,
      question,
      timestamp: new Date().toISOString(),
      result,
    });

    return result;
  }

  // ==================== Answer ====================

  getAnswerCalls(): AnswerCall[] {
    return [...this.answerCalls];
  }

  getLastAnswerCall(): AnswerCall | null {
    return this.answerCalls.length > 0 ? this.answerCalls[this.answerCalls.length - 1] : null;
  }

  setPresetAnswerResult(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    questionId: string,
    result: AnswerResult
  ): void {
    this.presetAnswerResults.set(this.getKey(ctx, graphSlug, nodeId, questionId), result);
  }

  async answer(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    questionId: string,
    answerValue: unknown
  ): Promise<AnswerResult> {
    const key = this.getKey(ctx, graphSlug, nodeId, questionId);
    const result = this.presetAnswerResults.get(key) ?? {
      nodeId,
      status: 'running',
      questionId,
      answer: answerValue,
      errors: [],
    };

    this.answerCalls.push({
      ctx,
      graphSlug,
      nodeId,
      questionId,
      answer: answerValue,
      timestamp: new Date().toISOString(),
      result,
    });

    return result;
  }

  // ==================== GetAnswer ====================

  getGetAnswerCalls(): GetAnswerCall[] {
    return [...this.getAnswerCallsArr];
  }

  getLastGetAnswerCall(): GetAnswerCall | null {
    return this.getAnswerCallsArr.length > 0
      ? this.getAnswerCallsArr[this.getAnswerCallsArr.length - 1]
      : null;
  }

  setPresetGetAnswerResult(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    questionId: string,
    result: GetAnswerResult
  ): void {
    this.presetGetAnswerResults.set(this.getKey(ctx, graphSlug, nodeId, questionId), result);
  }

  async getAnswer(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    questionId: string
  ): Promise<GetAnswerResult> {
    const key = this.getKey(ctx, graphSlug, nodeId, questionId);
    // Return preset or default "not answered" result
    const result = this.presetGetAnswerResults.get(key) ?? {
      nodeId,
      questionId,
      answered: false,
      errors: [],
    };

    this.getAnswerCallsArr.push({
      ctx,
      graphSlug,
      nodeId,
      questionId,
      timestamp: new Date().toISOString(),
      result,
    });

    return result;
  }

  // ==================== Reset ====================

  reset(): void {
    this.canRunCalls = [];
    this.markReadyCalls = [];
    this.startCalls = [];
    this.endCalls = [];
    this.canEndCalls = [];
    this.getInputDataCalls = [];
    this.getInputFileCalls = [];
    this.getOutputDataCalls = [];
    this.saveOutputDataCalls = [];
    this.saveOutputFileCalls = [];
    this.clearCalls = [];
    this.askCalls = [];
    this.answerCalls = [];
    this.getAnswerCallsArr = [];
    this.presetCanRunResults.clear();
    this.presetMarkReadyResults.clear();
    this.presetStartResults.clear();
    this.presetEndResults.clear();
    this.presetCanEndResults.clear();
    this.presetGetInputDataResults.clear();
    this.presetGetInputFileResults.clear();
    this.presetGetOutputDataResults.clear();
    this.presetSaveOutputDataResults.clear();
    this.presetSaveOutputFileResults.clear();
    this.presetClearResults.clear();
    this.presetAskResults.clear();
    this.presetAnswerResults.clear();
    this.presetGetAnswerResults.clear();
  }
}
