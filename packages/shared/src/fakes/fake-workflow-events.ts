/**
 * FakeWorkflowEventsService — In-memory test double for IWorkflowEvents.
 *
 * Self-contained with its own backing stores (Finding 04: does NOT depend
 * on FakePositionalGraphService). Provides inspection methods for test
 * assertions.
 *
 * @example
 * ```ts
 * const fake = new FakeWorkflowEventsService();
 * await fake.askQuestion('graph-1', 'node-a', { type: 'confirm', text: 'OK?' });
 * expect(fake.getAskedQuestions()).toHaveLength(1);
 * expect(fake.getAskedQuestions()[0].question.text).toBe('OK?');
 * ```
 */

import type { IWorkflowEvents } from '../interfaces/workflow-events.interface.js';
import { WorkflowEventType } from '../workflow-events/constants.js';
import type {
  AnswerResult,
  ErrorInput,
  ProgressEvent,
  ProgressInput,
  QuestionAnsweredEvent,
  QuestionAskedEvent,
  QuestionInput,
  WorkflowEvent,
} from '../workflow-events/types.js';

interface StoredQuestion {
  graphSlug: string;
  nodeId: string;
  questionId: string;
  question: QuestionInput;
  askedAt: string;
}

interface StoredAnswer {
  graphSlug: string;
  nodeId: string;
  questionId: string;
  answer: unknown;
  answeredAt: string;
}

interface StoredProgress {
  graphSlug: string;
  nodeId: string;
  progress: ProgressInput;
}

interface StoredError {
  graphSlug: string;
  nodeId: string;
  error: ErrorInput;
}

type ObserverKey = 'question-asked' | 'question-answered' | 'progress' | 'event';

export class FakeWorkflowEventsService implements IWorkflowEvents {
  private readonly questions: StoredQuestion[] = [];
  private readonly answers: StoredAnswer[] = [];
  private readonly progressReports: StoredProgress[] = [];
  private readonly errors: StoredError[] = [];
  private readonly observers = new Map<string, Set<(event: unknown) => void>>();
  private questionCounter = 0;

  // ── Actions ──

  async askQuestion(
    graphSlug: string,
    nodeId: string,
    question: QuestionInput
  ): Promise<{ questionId: string }> {
    const questionId = `q-${++this.questionCounter}`;
    const askedAt = new Date().toISOString();

    this.questions.push({ graphSlug, nodeId, questionId, question, askedAt });

    const event: QuestionAskedEvent = {
      graphSlug,
      nodeId,
      questionId,
      question,
      askedAt,
      source: 'fake',
    };
    this.notifyObservers(`${graphSlug}:question-asked`, event);
    this.notifyGenericObservers(graphSlug, {
      graphSlug,
      nodeId,
      eventType: WorkflowEventType.QuestionAsk,
      payload: { question_id: questionId, ...question },
      source: 'fake',
      timestamp: askedAt,
    });

    return { questionId };
  }

  async answerQuestion(
    graphSlug: string,
    nodeId: string,
    questionId: string,
    answer: unknown
  ): Promise<void> {
    const answeredAt = new Date().toISOString();
    this.answers.push({ graphSlug, nodeId, questionId, answer, answeredAt });

    const event: QuestionAnsweredEvent = {
      graphSlug,
      nodeId,
      questionId,
      answer,
      answeredAt,
    };
    this.notifyObservers(`${graphSlug}:question-answered`, event);
    this.notifyGenericObservers(graphSlug, {
      graphSlug,
      nodeId,
      eventType: WorkflowEventType.QuestionAnswer,
      payload: { question_event_id: questionId, answer },
      source: 'fake',
      timestamp: answeredAt,
    });
  }

  async getAnswer(
    graphSlug: string,
    nodeId: string,
    questionId: string
  ): Promise<AnswerResult | null> {
    const stored = this.answers.find(
      (a) => a.graphSlug === graphSlug && a.nodeId === nodeId && a.questionId === questionId
    );
    if (!stored) return null;
    return {
      questionId: stored.questionId,
      answered: true,
      answer: stored.answer,
      answeredAt: stored.answeredAt,
    };
  }

  async reportProgress(graphSlug: string, nodeId: string, progress: ProgressInput): Promise<void> {
    this.progressReports.push({ graphSlug, nodeId, progress });

    const event: ProgressEvent = {
      graphSlug,
      nodeId,
      message: progress.message,
      percent: progress.percent,
    };
    this.notifyObservers(`${graphSlug}:progress`, event);
    this.notifyGenericObservers(graphSlug, {
      graphSlug,
      nodeId,
      eventType: WorkflowEventType.ProgressUpdate,
      payload: { message: progress.message, percent: progress.percent },
      source: 'fake',
      timestamp: new Date().toISOString(),
    });
  }

  async reportError(graphSlug: string, nodeId: string, error: ErrorInput): Promise<void> {
    this.errors.push({ graphSlug, nodeId, error });

    this.notifyGenericObservers(graphSlug, {
      graphSlug,
      nodeId,
      eventType: WorkflowEventType.NodeError,
      payload: { ...error },
      source: 'fake',
      timestamp: new Date().toISOString(),
    });
  }

  // ── Observers ──

  onQuestionAsked(graphSlug: string, handler: (event: QuestionAskedEvent) => void): () => void {
    return this.addObserver(`${graphSlug}:question-asked`, handler);
  }

  onQuestionAnswered(
    graphSlug: string,
    handler: (event: QuestionAnsweredEvent) => void
  ): () => void {
    return this.addObserver(`${graphSlug}:question-answered`, handler);
  }

  onProgress(graphSlug: string, handler: (event: ProgressEvent) => void): () => void {
    return this.addObserver(`${graphSlug}:progress`, handler);
  }

  onEvent(graphSlug: string, handler: (event: WorkflowEvent) => void): () => void {
    return this.addObserver(`${graphSlug}:event`, handler);
  }

  // ── Inspection Methods (test-only) ──

  /** Get all questions asked through this fake */
  getAskedQuestions(): readonly StoredQuestion[] {
    return this.questions;
  }

  /** Get all answers provided through this fake */
  getAnswers(): readonly StoredAnswer[] {
    return this.answers;
  }

  /** Get all progress reports through this fake */
  getProgressReports(): readonly StoredProgress[] {
    return this.progressReports;
  }

  /** Get all errors reported through this fake */
  getErrors(): readonly StoredError[] {
    return this.errors;
  }

  /** Get total observer count across all keys */
  getObserverCount(): number {
    let count = 0;
    for (const set of this.observers.values()) {
      count += set.size;
    }
    return count;
  }

  /** Get observer count for a specific graph and event type */
  getObserverCountFor(graphSlug: string, type: ObserverKey): number {
    return this.observers.get(`${graphSlug}:${type}`)?.size ?? 0;
  }

  /** Reset all stored data and observers */
  reset(): void {
    this.questions.length = 0;
    this.answers.length = 0;
    this.progressReports.length = 0;
    this.errors.length = 0;
    this.observers.clear();
    this.questionCounter = 0;
  }

  // ── Private ──

  private addObserver(key: string, handler: (event: never) => void): () => void {
    if (!this.observers.has(key)) {
      this.observers.set(key, new Set());
    }
    const set = this.observers.get(key);
    if (!set) return () => {};
    set.add(handler as (event: unknown) => void);
    return () => {
      set.delete(handler as (event: unknown) => void);
    };
  }

  private notifyObservers(key: string, event: unknown): void {
    const handlers = this.observers.get(key);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(event);
      } catch {
        // Per-handler error isolation (consistent with ServerEventRoute F003)
      }
    }
  }

  private notifyGenericObservers(graphSlug: string, event: WorkflowEvent): void {
    this.notifyObservers(`${graphSlug}:event`, event);
  }
}
