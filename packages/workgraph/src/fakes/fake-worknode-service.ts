/**
 * FakeWorkNodeService for testing.
 *
 * Per Discovery 08: Fakes need call capture for CLI testing.
 * This fake captures all canRun(), start(), end(), getInputData(),
 * saveOutputData() calls for test assertions and can be configured with preset results.
 */

import type {
  CanRunResult,
  EndResult,
  GetInputDataResult,
  IWorkNodeService,
  SaveOutputDataResult,
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

export interface GetInputDataCall {
  graphSlug: string;
  nodeId: string;
  inputName: string;
  timestamp: string;
  result: GetInputDataResult;
}

export interface SaveOutputDataCall {
  graphSlug: string;
  nodeId: string;
  outputName: string;
  value: unknown;
  timestamp: string;
  result: SaveOutputDataResult;
}

// ============================================
// Fake Implementation
// ============================================

/**
 * Fake WorkNode service for testing.
 */
export class FakeWorkNodeService implements IWorkNodeService {
  private canRunCalls: CanRunCall[] = [];
  private startCalls: StartCall[] = [];
  private endCalls: EndCall[] = [];
  private getInputDataCalls: GetInputDataCall[] = [];
  private saveOutputDataCalls: SaveOutputDataCall[] = [];

  private presetCanRunResults = new Map<string, CanRunResult>();
  private presetStartResults = new Map<string, StartResult>();
  private presetEndResults = new Map<string, EndResult>();
  private presetGetInputDataResults = new Map<string, GetInputDataResult>();
  private presetSaveOutputDataResults = new Map<string, SaveOutputDataResult>();

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

  // ==================== Reset ====================

  reset(): void {
    this.canRunCalls = [];
    this.startCalls = [];
    this.endCalls = [];
    this.getInputDataCalls = [];
    this.saveOutputDataCalls = [];
    this.presetCanRunResults.clear();
    this.presetStartResults.clear();
    this.presetEndResults.clear();
    this.presetGetInputDataResults.clear();
    this.presetSaveOutputDataResults.clear();
  }
}
