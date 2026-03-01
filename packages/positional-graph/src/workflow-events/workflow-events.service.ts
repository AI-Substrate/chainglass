/**
 * WorkflowEventsService — Intent-based API for workflow event interactions.
 *
 * Wraps IPositionalGraphService.raiseNodeEvent() for event raising and uses
 * loadGraphState/persistGraphState for state.questions[] management.
 * Does NOT delegate to the deprecated askQuestion/answerQuestion/getAnswer
 * methods on PGService — those will be deleted in Phase 3.
 *
 * Lives in packages/positional-graph (same package as PGService it wraps).
 */

import type { IWorkflowEvents } from '@chainglass/shared';
import type {
  AnswerResult,
  ErrorInput,
  ProgressEvent,
  ProgressInput,
  QuestionAnsweredEvent,
  QuestionAskedEvent,
  QuestionInput,
  WorkflowEvent,
} from '@chainglass/shared/workflow-events';
import { WorkflowEventError, WorkflowEventType } from '@chainglass/shared/workflow-events';

import type { WorkspaceContext } from '@chainglass/workflow';
import type { IPositionalGraphService } from '../interfaces/positional-graph-service.interface.js';
import type { WorkflowEventObserverRegistry } from './observer-registry.js';

export type WorkspaceContextResolver = (graphSlug: string) => WorkspaceContext;

export class WorkflowEventsService implements IWorkflowEvents {
  constructor(
    private readonly pgService: IPositionalGraphService,
    private readonly contextResolver: WorkspaceContextResolver,
    private readonly observers: WorkflowEventObserverRegistry
  ) {}

  // ── Actions ──

  async askQuestion(
    graphSlug: string,
    nodeId: string,
    question: QuestionInput
  ): Promise<{ questionId: string }> {
    const ctx = this.contextResolver(graphSlug);
    const questionId = this.generateQuestionId();

    // Build payload matching Zod question:ask schema (.strict())
    const payload: Record<string, unknown> = {
      question_id: questionId,
      type: question.type,
      text: question.text,
    };
    if (question.options) payload.options = question.options;
    if (question.default !== undefined) payload.default = question.default;

    // Raise event via PGService (handles event + handlers + persist)
    const result = await this.pgService.raiseNodeEvent(
      ctx,
      graphSlug,
      nodeId,
      WorkflowEventType.QuestionAsk,
      payload,
      'agent'
    );
    if (result.errors && result.errors.length > 0) {
      throw new WorkflowEventError(
        `Failed to ask question: ${result.errors.map((e) => e.message).join(', ')}`,
        result.errors
      );
    }

    // Write to state.questions[] for backward compat
    const state = await this.pgService.loadGraphState(ctx, graphSlug);
    const askedAt = new Date().toISOString();
    if (!state.questions) {
      (state as Record<string, unknown>).questions = [];
    }
    state.questions?.push({
      question_id: questionId,
      node_id: nodeId,
      type: question.type,
      text: question.text,
      asked_at: askedAt,
      ...(question.options ? { options: question.options } : {}),
      ...(question.default !== undefined ? { default: question.default } : {}),
    });
    await this.pgService.persistGraphState(ctx, graphSlug, state);

    // Notify observers (reuse same timestamp for consistency — F008)
    const event: QuestionAskedEvent = {
      graphSlug,
      nodeId,
      questionId,
      question,
      askedAt,
      source: 'agent',
    };
    this.observers.notify(graphSlug, 'question-asked', event);
    this.notifyGenericObservers(graphSlug, nodeId, WorkflowEventType.QuestionAsk, payload, 'agent');

    return { questionId };
  }

  async answerQuestion(
    graphSlug: string,
    nodeId: string,
    questionId: string,
    answer: unknown
  ): Promise<void> {
    const ctx = this.contextResolver(graphSlug);

    // Find the original ask event to get its event_id for the answer payload
    const state = await this.pgService.loadGraphState(ctx, graphSlug);
    const nodeEvents = (state.nodes?.[nodeId] as Record<string, unknown>)?.events;
    const events = Array.isArray(nodeEvents) ? nodeEvents : [];
    const askEvent = events.find(
      (e: Record<string, unknown>) =>
        e.event_type === WorkflowEventType.QuestionAsk &&
        (e.payload as Record<string, unknown>)?.question_id === questionId
    );

    if (!askEvent) {
      throw new WorkflowEventError(`Question ${questionId} not found in node ${nodeId} events`, [
        {
          code: 'E173',
          message: `Question ${questionId} not found`,
          action: 'Use a valid questionId from question:ask event',
        },
      ]);
    }

    // Step 1: Raise question:answer event
    const answerResult = await this.pgService.raiseNodeEvent(
      ctx,
      graphSlug,
      nodeId,
      WorkflowEventType.QuestionAnswer,
      {
        question_event_id: (askEvent as Record<string, unknown>).event_id,
        answer,
      },
      'human'
    );
    if (answerResult.errors && answerResult.errors.length > 0) {
      throw new WorkflowEventError(
        `Failed to answer question: ${answerResult.errors.map((e) => e.message).join(', ')}`,
        answerResult.errors
      );
    }

    // Update state.questions[] with the answer (backward compat)
    const answeredAt = new Date().toISOString();
    const updatedState = await this.pgService.loadGraphState(ctx, graphSlug);
    const questions = updatedState.questions ?? [];
    const qIdx = questions.findIndex((q) => q.question_id === questionId);
    if (qIdx !== -1) {
      questions[qIdx].answer = answer;
      questions[qIdx].answered_at = answeredAt;
    }
    await this.pgService.persistGraphState(ctx, graphSlug, updatedState);

    // Notify observers after answer is recorded (DYK-P2-04)
    const answeredEvent: QuestionAnsweredEvent = {
      graphSlug,
      nodeId,
      questionId,
      answer,
      answeredAt,
    };
    this.observers.notify(graphSlug, 'question-answered', answeredEvent);
    this.notifyGenericObservers(
      graphSlug,
      nodeId,
      WorkflowEventType.QuestionAnswer,
      { question_event_id: (askEvent as Record<string, unknown>).event_id, answer },
      'human'
    );

    // Step 2: Raise node:restart (3-event handshake) — DYK-P2-04
    try {
      const restartResult = await this.pgService.raiseNodeEvent(
        ctx,
        graphSlug,
        nodeId,
        WorkflowEventType.NodeRestart,
        { reason: 'question-answered' },
        'human'
      );
      if (restartResult.errors && restartResult.errors.length > 0) {
        throw new WorkflowEventError(
          `Answer recorded but node restart failed: ${restartResult.errors.map((e) => e.message).join(', ')}`,
          restartResult.errors
        );
      }
    } catch (restartError) {
      if (restartError instanceof WorkflowEventError) throw restartError;
      // Answer was recorded but restart threw unexpectedly — partial failure
      throw new WorkflowEventError(
        `Answer recorded but node restart failed: ${restartError instanceof Error ? restartError.message : String(restartError)}`,
        [
          {
            code: 'E_RESTART',
            message: restartError instanceof Error ? restartError.message : String(restartError),
          },
        ]
      );
    }
  }

  async getAnswer(
    graphSlug: string,
    nodeId: string,
    questionId: string
  ): Promise<AnswerResult | null> {
    const ctx = this.contextResolver(graphSlug);
    const state = await this.pgService.loadGraphState(ctx, graphSlug);
    const question = state.questions?.find((q) => q.question_id === questionId);

    if (!question) return null;
    if (question.answered_at) {
      return {
        questionId: question.question_id,
        answered: true,
        answer: question.answer,
        answeredAt: question.answered_at,
      };
    }
    return null;
  }

  async reportProgress(graphSlug: string, nodeId: string, progress: ProgressInput): Promise<void> {
    const ctx = this.contextResolver(graphSlug);

    const payload: Record<string, unknown> = {
      message: progress.message,
    };
    if (progress.percent !== undefined) payload.percent = progress.percent;

    const result = await this.pgService.raiseNodeEvent(
      ctx,
      graphSlug,
      nodeId,
      WorkflowEventType.ProgressUpdate,
      payload,
      'agent'
    );
    if (result.errors && result.errors.length > 0) {
      throw new WorkflowEventError(
        `Failed to report progress: ${result.errors.map((e) => e.message).join(', ')}`,
        result.errors
      );
    }

    const event: ProgressEvent = {
      graphSlug,
      nodeId,
      message: progress.message,
      percent: progress.percent,
    };
    this.observers.notify(graphSlug, 'progress', event);
    this.notifyGenericObservers(
      graphSlug,
      nodeId,
      WorkflowEventType.ProgressUpdate,
      payload,
      'agent'
    );
  }

  async reportError(graphSlug: string, nodeId: string, error: ErrorInput): Promise<void> {
    const ctx = this.contextResolver(graphSlug);

    const payload: Record<string, unknown> = {
      code: error.code,
      message: error.message,
    };
    if (error.details !== undefined) payload.details = error.details;
    if (error.recoverable !== undefined) payload.recoverable = error.recoverable;

    const result = await this.pgService.raiseNodeEvent(
      ctx,
      graphSlug,
      nodeId,
      WorkflowEventType.NodeError,
      payload,
      'agent'
    );
    if (result.errors && result.errors.length > 0) {
      throw new WorkflowEventError(
        `Failed to report error: ${result.errors.map((e) => e.message).join(', ')}`,
        result.errors
      );
    }

    this.notifyGenericObservers(graphSlug, nodeId, WorkflowEventType.NodeError, payload, 'agent');
  }

  // ── Observers ──

  onQuestionAsked(graphSlug: string, handler: (event: QuestionAskedEvent) => void): () => void {
    return this.observers.subscribe(graphSlug, 'question-asked', handler as (e: unknown) => void);
  }

  onQuestionAnswered(
    graphSlug: string,
    handler: (event: QuestionAnsweredEvent) => void
  ): () => void {
    return this.observers.subscribe(
      graphSlug,
      'question-answered',
      handler as (e: unknown) => void
    );
  }

  onProgress(graphSlug: string, handler: (event: ProgressEvent) => void): () => void {
    return this.observers.subscribe(graphSlug, 'progress', handler as (e: unknown) => void);
  }

  onEvent(graphSlug: string, handler: (event: WorkflowEvent) => void): () => void {
    return this.observers.subscribe(graphSlug, 'event', handler as (e: unknown) => void);
  }

  // ── Private ──

  private generateQuestionId(): string {
    const timestamp = new Date().toISOString();
    const suffix = Math.random().toString(16).slice(2, 8);
    return `${timestamp}_${suffix}`;
  }

  private notifyGenericObservers(
    graphSlug: string,
    nodeId: string,
    eventType: string,
    payload: Record<string, unknown>,
    source: string
  ): void {
    const event: WorkflowEvent = {
      graphSlug,
      nodeId,
      eventType,
      payload,
      source,
      timestamp: new Date().toISOString(),
    };
    this.observers.notify(graphSlug, 'event', event);
  }
}
