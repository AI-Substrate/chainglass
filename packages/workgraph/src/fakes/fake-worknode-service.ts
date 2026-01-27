/**
 * FakeWorkNodeService for testing.
 *
 * Per Discovery 08: Fakes need call capture for CLI testing.
 * This fake captures all canRun(), start(), end(), getInputData(),
 * saveOutputData() calls for test assertions and can be configured with preset results.
 */

import type {
  AnswerResult,
  AskResult,
  CanEndResult,
  CanRunResult,
  ClearOptions,
  ClearResult,
  EndResult,
  GetInputDataResult,
  GetInputFileResult,
  IWorkNodeService,
  MarkReadyResult,
  Question,
  SaveOutputDataResult,
  SaveOutputFileResult,
  StartResult,
} from '../interfaces/index.js';

// ============================================
// Call Types
// ============================================

export interface CanRunCall {
  graphSlug: string;
  nodeId: string;
  timestamp: string;
  result: CanRunResult;
}

export interface MarkReadyCall {
  graphSlug: string;
  nodeId: string;
  timestamp: string;
  result: MarkReadyResult;
}

export interface StartCall {
  graphSlug: string;
  nodeId: string;
  timestamp: string;
  result: StartResult;
}

export interface EndCall {
  graphSlug: string;
  nodeId: string;
  timestamp: string;
  result: EndResult;
}

export interface CanEndCall {
  graphSlug: string;
  nodeId: string;
  timestamp: string;
  result: CanEndResult;
}

export interface GetInputDataCall {
  graphSlug: string;
  nodeId: string;
  inputName: string;
  timestamp: string;
  result: GetInputDataResult;
}

export interface GetInputFileCall {
  graphSlug: string;
  nodeId: string;
  inputName: string;
  timestamp: string;
  result: GetInputFileResult;
}

export interface SaveOutputDataCall {
  graphSlug: string;
  nodeId: string;
  outputName: string;
  value: unknown;
  timestamp: string;
  result: SaveOutputDataResult;
}

export interface SaveOutputFileCall {
  graphSlug: string;
  nodeId: string;
  outputName: string;
  sourcePath: string;
  timestamp: string;
  result: SaveOutputFileResult;
}

export interface ClearCall {
  graphSlug: string;
  nodeId: string;
  options: ClearOptions;
  timestamp: string;
  result: ClearResult;
}

export interface AskCall {
  graphSlug: string;
  nodeId: string;
  question: Question;
  timestamp: string;
  result: AskResult;
}

export interface AnswerCall {
  graphSlug: string;
  nodeId: string;
  questionId: string;
  answer: unknown;
  timestamp: string;
  result: AnswerResult;
}

// ============================================
// Fake Implementation
// ============================================

/**
 * Fake WorkNode service for testing.
 */
export class FakeWorkNodeService implements IWorkNodeService {
  private canRunCalls: CanRunCall[] = [];
  private markReadyCalls: MarkReadyCall[] = [];
  private startCalls: StartCall[] = [];
  private endCalls: EndCall[] = [];
  private canEndCalls: CanEndCall[] = [];
  private getInputDataCalls: GetInputDataCall[] = [];
  private getInputFileCalls: GetInputFileCall[] = [];
  private saveOutputDataCalls: SaveOutputDataCall[] = [];
  private saveOutputFileCalls: SaveOutputFileCall[] = [];
  private clearCalls: ClearCall[] = [];
  private askCalls: AskCall[] = [];
  private answerCalls: AnswerCall[] = [];

  private presetCanRunResults = new Map<string, CanRunResult>();
  private presetMarkReadyResults = new Map<string, MarkReadyResult>();
  private presetStartResults = new Map<string, StartResult>();
  private presetEndResults = new Map<string, EndResult>();
  private presetCanEndResults = new Map<string, CanEndResult>();
  private presetGetInputDataResults = new Map<string, GetInputDataResult>();
  private presetGetInputFileResults = new Map<string, GetInputFileResult>();
  private presetSaveOutputDataResults = new Map<string, SaveOutputDataResult>();
  private presetSaveOutputFileResults = new Map<string, SaveOutputFileResult>();
  private presetClearResults = new Map<string, ClearResult>();
  private presetAskResults = new Map<string, AskResult>();
  private presetAnswerResults = new Map<string, AnswerResult>();

  // ==================== CanRun ====================

  getCanRunCalls(): CanRunCall[] {
    return [...this.canRunCalls];
  }

  getLastCanRunCall(): CanRunCall | null {
    return this.canRunCalls.length > 0 ? this.canRunCalls[this.canRunCalls.length - 1] : null;
  }

  setPresetCanRunResult(graphSlug: string, nodeId: string, result: CanRunResult): void {
    this.presetCanRunResults.set(`${graphSlug}:${nodeId}`, result);
  }

  async canRun(graphSlug: string, nodeId: string): Promise<CanRunResult> {
    const key = `${graphSlug}:${nodeId}`;
    const result = this.presetCanRunResults.get(key) ?? {
      canRun: true,
      errors: [],
    };

    this.canRunCalls.push({
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

  setPresetMarkReadyResult(graphSlug: string, nodeId: string, result: MarkReadyResult): void {
    this.presetMarkReadyResults.set(`${graphSlug}:${nodeId}`, result);
  }

  async markReady(graphSlug: string, nodeId: string): Promise<MarkReadyResult> {
    const key = `${graphSlug}:${nodeId}`;
    const result = this.presetMarkReadyResults.get(key) ?? {
      nodeId,
      status: 'ready',
      readyAt: new Date().toISOString(),
      errors: [],
    };

    this.markReadyCalls.push({
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

  setPresetStartResult(graphSlug: string, nodeId: string, result: StartResult): void {
    this.presetStartResults.set(`${graphSlug}:${nodeId}`, result);
  }

  async start(graphSlug: string, nodeId: string): Promise<StartResult> {
    const key = `${graphSlug}:${nodeId}`;
    const result = this.presetStartResults.get(key) ?? {
      nodeId,
      status: 'running',
      startedAt: new Date().toISOString(),
      errors: [],
    };

    this.startCalls.push({
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

  setPresetEndResult(graphSlug: string, nodeId: string, result: EndResult): void {
    this.presetEndResults.set(`${graphSlug}:${nodeId}`, result);
  }

  async end(graphSlug: string, nodeId: string): Promise<EndResult> {
    const key = `${graphSlug}:${nodeId}`;
    const result = this.presetEndResults.get(key) ?? {
      nodeId,
      status: 'complete',
      completedAt: new Date().toISOString(),
      errors: [],
    };

    this.endCalls.push({
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

  setCanEndResult(graphSlug: string, nodeId: string, result: CanEndResult): void {
    this.presetCanEndResults.set(`${graphSlug}:${nodeId}`, result);
  }

  async canEnd(graphSlug: string, nodeId: string): Promise<CanEndResult> {
    const key = `${graphSlug}:${nodeId}`;
    const result = this.presetCanEndResults.get(key) ?? {
      nodeId,
      canEnd: true,
      errors: [],
    };

    this.canEndCalls.push({
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
    graphSlug: string,
    nodeId: string,
    inputName: string,
    result: GetInputDataResult
  ): void {
    this.presetGetInputDataResults.set(`${graphSlug}:${nodeId}:${inputName}`, result);
  }

  async getInputData(
    graphSlug: string,
    nodeId: string,
    inputName: string
  ): Promise<GetInputDataResult> {
    const key = `${graphSlug}:${nodeId}:${inputName}`;
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
    graphSlug: string,
    nodeId: string,
    inputName: string,
    result: GetInputFileResult
  ): void {
    this.presetGetInputFileResults.set(`${graphSlug}:${nodeId}:${inputName}`, result);
  }

  async getInputFile(
    graphSlug: string,
    nodeId: string,
    inputName: string
  ): Promise<GetInputFileResult> {
    const key = `${graphSlug}:${nodeId}:${inputName}`;
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
      graphSlug,
      nodeId,
      inputName,
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
    graphSlug: string,
    nodeId: string,
    outputName: string,
    result: SaveOutputDataResult
  ): void {
    this.presetSaveOutputDataResults.set(`${graphSlug}:${nodeId}:${outputName}`, result);
  }

  async saveOutputData(
    graphSlug: string,
    nodeId: string,
    outputName: string,
    value: unknown
  ): Promise<SaveOutputDataResult> {
    const key = `${graphSlug}:${nodeId}:${outputName}`;
    const result = this.presetSaveOutputDataResults.get(key) ?? {
      nodeId,
      outputName,
      saved: true,
      errors: [],
    };

    this.saveOutputDataCalls.push({
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
    graphSlug: string,
    nodeId: string,
    outputName: string,
    result: SaveOutputFileResult
  ): void {
    this.presetSaveOutputFileResults.set(`${graphSlug}:${nodeId}:${outputName}`, result);
  }

  async saveOutputFile(
    graphSlug: string,
    nodeId: string,
    outputName: string,
    sourcePath: string
  ): Promise<SaveOutputFileResult> {
    const key = `${graphSlug}:${nodeId}:${outputName}`;
    const result = this.presetSaveOutputFileResults.get(key) ?? {
      nodeId,
      outputName,
      saved: true,
      savedPath: `.chainglass/work-graphs/${graphSlug}/nodes/${nodeId}/data/outputs/${outputName}.md`,
      errors: [],
    };

    this.saveOutputFileCalls.push({
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

  setPresetClearResult(graphSlug: string, nodeId: string, result: ClearResult): void {
    this.presetClearResults.set(`${graphSlug}:${nodeId}`, result);
  }

  async clear(graphSlug: string, nodeId: string, options: ClearOptions): Promise<ClearResult> {
    const key = `${graphSlug}:${nodeId}`;

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

  setPresetAskResult(graphSlug: string, nodeId: string, result: AskResult): void {
    this.presetAskResults.set(`${graphSlug}:${nodeId}`, result);
  }

  async ask(graphSlug: string, nodeId: string, question: Question): Promise<AskResult> {
    const key = `${graphSlug}:${nodeId}`;
    const questionId = `q-${Date.now()}`;
    const result = this.presetAskResults.get(key) ?? {
      nodeId,
      status: 'waiting-question',
      questionId,
      question,
      errors: [],
    };

    this.askCalls.push({
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
    graphSlug: string,
    nodeId: string,
    questionId: string,
    result: AnswerResult
  ): void {
    this.presetAnswerResults.set(`${graphSlug}:${nodeId}:${questionId}`, result);
  }

  async answer(
    graphSlug: string,
    nodeId: string,
    questionId: string,
    answerValue: unknown
  ): Promise<AnswerResult> {
    const key = `${graphSlug}:${nodeId}:${questionId}`;
    const result = this.presetAnswerResults.get(key) ?? {
      nodeId,
      status: 'running',
      questionId,
      answer: answerValue,
      errors: [],
    };

    this.answerCalls.push({
      graphSlug,
      nodeId,
      questionId,
      answer: answerValue,
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
    this.getInputDataCalls = [];
    this.getInputFileCalls = [];
    this.saveOutputDataCalls = [];
    this.saveOutputFileCalls = [];
    this.clearCalls = [];
    this.askCalls = [];
    this.answerCalls = [];
    this.presetCanRunResults.clear();
    this.presetMarkReadyResults.clear();
    this.presetStartResults.clear();
    this.presetEndResults.clear();
    this.presetGetInputDataResults.clear();
    this.presetGetInputFileResults.clear();
    this.presetSaveOutputDataResults.clear();
    this.presetSaveOutputFileResults.clear();
    this.presetClearResults.clear();
    this.presetAskResults.clear();
    this.presetAnswerResults.clear();
  }
}
