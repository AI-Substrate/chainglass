/**
 * PositionalGraphRealityView — Ergonomic lookup wrapper over PositionalGraphReality.
 *
 * Provides navigation methods for node neighbors, line lookups,
 * question retrieval, and pod session access.
 *
 * @packageDocumentation
 */

import type {
  LineReality,
  NodeReality,
  PositionalGraphReality,
  QuestionReality,
} from './reality.types.js';

export class PositionalGraphRealityView {
  constructor(private readonly reality: PositionalGraphReality) {}

  /** Get node by ID. */
  getNode(nodeId: string): NodeReality | undefined {
    return this.reality.nodes.get(nodeId);
  }

  /** Get line by ID. */
  getLine(lineId: string): LineReality | undefined {
    return this.reality.lines.find((l) => l.lineId === lineId);
  }

  /** Get line by index. */
  getLineByIndex(index: number): LineReality | undefined {
    return this.reality.lines[index];
  }

  /** Get all nodes on a line, in position order. */
  getNodesByLine(lineId: string): NodeReality[] {
    const line = this.getLine(lineId);
    if (!line) return [];
    return line.nodeIds
      .map((id) => this.reality.nodes.get(id))
      .filter((n): n is NodeReality => n !== undefined);
  }

  /** Get left neighbor (previous serial node on same line). */
  getLeftNeighbor(nodeId: string): NodeReality | undefined {
    const node = this.getNode(nodeId);
    if (!node || node.positionInLine === 0) return undefined;
    const line = this.reality.lines[node.lineIndex];
    const leftId = line.nodeIds[node.positionInLine - 1];
    return this.reality.nodes.get(leftId);
  }

  /** Get question by ID. */
  getQuestion(questionId: string): QuestionReality | undefined {
    return this.reality.questions.find((q) => q.questionId === questionId);
  }

  /** Get pod session ID for a node. */
  getPodSession(nodeId: string): string | undefined {
    return this.reality.podSessions.get(nodeId);
  }

  /** Check if node is first in its line. */
  isFirstInLine(nodeId: string): boolean {
    const node = this.getNode(nodeId);
    return node !== undefined && node.positionInLine === 0;
  }

  /** Get current line (first incomplete). */
  getCurrentLine(): LineReality | undefined {
    return this.reality.lines[this.reality.currentLineIndex];
  }

  /** Underlying snapshot data. */
  get data(): PositionalGraphReality {
    return this.reality;
  }
}
