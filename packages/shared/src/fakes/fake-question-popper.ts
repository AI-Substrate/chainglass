/**
 * FakeQuestionPopperService — In-memory test double for IQuestionPopperService.
 *
 * Self-contained with Map-based storage. Provides inspection helpers for
 * test assertions without accessing internals.
 *
 * @example
 * ```ts
 * const fake = new FakeQuestionPopperService();
 * const { questionId } = await fake.askQuestion({ questionType: 'confirm', text: 'Deploy?', source: 'test' });
 * expect(fake.getOutstandingCount()).toBe(1);
 * await fake.answerQuestion(questionId, { answer: true, text: null });
 * expect(fake.getOutstandingCount()).toBe(0);
 * ```
 */

import type { IQuestionPopperService } from '../interfaces/question-popper.interface.js';
import type { AnswerPayload } from '../question-popper/schemas.js';
import type {
  AlertIn,
  AlertStatus,
  QuestionIn,
  QuestionStatus,
  StoredAlert,
  StoredEvent,
  StoredQuestion,
} from '../question-popper/types.js';

let fakeIdCounter = 0;

function generateFakeId(): string {
  fakeIdCounter++;
  return `fake-${fakeIdCounter.toString().padStart(4, '0')}`;
}

export class FakeQuestionPopperService implements IQuestionPopperService {
  private readonly questions = new Map<string, StoredQuestion>();
  private readonly alerts = new Map<string, StoredAlert>();

  // ── IQuestionPopperService — Questions ──

  async askQuestion(input: QuestionIn): Promise<{ questionId: string }> {
    const id = generateFakeId();
    const now = new Date().toISOString();
    const stored: StoredQuestion = {
      id,
      type: 'question',
      request: {
        version: 1 as const,
        type: 'question',
        createdAt: now,
        source: input.source,
        payload: {
          questionType: input.questionType,
          text: input.text,
          description: input.description ?? null,
          options: input.options ?? null,
          default: input.default ?? null,
          timeout: input.timeout ?? 600,
          previousQuestionId: input.previousQuestionId ?? null,
        },
        ...(input.meta ? { meta: input.meta } : {}),
      },
      response: null,
      status: 'pending',
    };
    this.questions.set(id, stored);
    return { questionId: id };
  }

  async getQuestion(id: string): Promise<StoredQuestion | null> {
    return this.questions.get(id) ?? null;
  }

  async answerQuestion(id: string, answer: AnswerPayload): Promise<void> {
    const q = this.questions.get(id);
    if (!q) throw new Error(`Question not found: ${id}`);
    if (q.status !== 'pending') throw new Error(`Question already resolved: ${id} (${q.status})`);

    const now = new Date().toISOString();
    q.status = 'answered';
    q.response = {
      version: 1 as const,
      status: 'answered',
      respondedAt: now,
      respondedBy: 'fake-user',
      payload: { answer: answer.answer, text: answer.text },
    };
  }

  async dismissQuestion(id: string): Promise<void> {
    const q = this.questions.get(id);
    if (!q) throw new Error(`Question not found: ${id}`);
    if (q.status !== 'pending') throw new Error(`Question already resolved: ${id} (${q.status})`);

    const now = new Date().toISOString();
    q.status = 'dismissed';
    q.response = {
      version: 1 as const,
      status: 'dismissed',
      respondedAt: now,
      respondedBy: 'fake-user',
      payload: {},
    };
  }

  async requestClarification(id: string, text: string): Promise<void> {
    const q = this.questions.get(id);
    if (!q) throw new Error(`Question not found: ${id}`);
    if (q.status !== 'pending') throw new Error(`Question already resolved: ${id} (${q.status})`);

    const now = new Date().toISOString();
    q.status = 'needs-clarification';
    q.response = {
      version: 1 as const,
      status: 'needs-clarification',
      respondedAt: now,
      respondedBy: 'fake-user',
      payload: { text },
    };
  }

  async listQuestions(filter?: { status?: QuestionStatus }): Promise<StoredQuestion[]> {
    const all = Array.from(this.questions.values());
    if (filter?.status) return all.filter((q) => q.status === filter.status);
    return all;
  }

  // ── IQuestionPopperService — Alerts ──

  async sendAlert(input: AlertIn): Promise<{ alertId: string }> {
    const id = generateFakeId();
    const now = new Date().toISOString();
    const stored: StoredAlert = {
      id,
      type: 'alert',
      request: {
        version: 1 as const,
        type: 'alert',
        createdAt: now,
        source: input.source,
        payload: {
          text: input.text,
          description: input.description ?? null,
        },
        ...(input.meta ? { meta: input.meta } : {}),
      },
      response: null,
      status: 'unread',
    };
    this.alerts.set(id, stored);
    return { alertId: id };
  }

  async getAlert(id: string): Promise<StoredAlert | null> {
    return this.alerts.get(id) ?? null;
  }

  async acknowledgeAlert(id: string): Promise<void> {
    const a = this.alerts.get(id);
    if (!a) throw new Error(`Alert not found: ${id}`);
    if (a.status !== 'unread') throw new Error(`Alert already acknowledged: ${id}`);

    const now = new Date().toISOString();
    a.status = 'acknowledged';
    a.response = {
      version: 1 as const,
      status: 'acknowledged',
      respondedAt: now,
      respondedBy: 'fake-user',
      payload: {},
    };
  }

  // ── IQuestionPopperService — Queries ──

  async listAll(): Promise<StoredEvent[]> {
    const questions = Array.from(this.questions.values());
    const alerts = Array.from(this.alerts.values());
    return [...questions, ...alerts].sort(
      (a, b) => b.request.createdAt.localeCompare(a.request.createdAt) || b.id.localeCompare(a.id)
    );
  }

  getOutstandingCount(): number {
    const pendingQuestions = Array.from(this.questions.values()).filter(
      (q) => q.status === 'pending'
    ).length;
    const unreadAlerts = Array.from(this.alerts.values()).filter(
      (a) => a.status === 'unread'
    ).length;
    return pendingQuestions + unreadAlerts;
  }

  // ── Inspection Helpers (test-only) ──

  getPendingQuestions(): StoredQuestion[] {
    return Array.from(this.questions.values()).filter((q) => q.status === 'pending');
  }

  getAnsweredCount(): number {
    return Array.from(this.questions.values()).filter((q) => q.status === 'answered').length;
  }

  getAlertCount(): number {
    return this.alerts.size;
  }

  simulateAnswer(id: string, answer: AnswerPayload): void {
    const q = this.questions.get(id);
    if (!q) throw new Error(`Question not found: ${id}`);
    q.status = 'answered';
    q.response = {
      version: 1 as const,
      status: 'answered',
      respondedAt: new Date().toISOString(),
      respondedBy: 'simulated-user',
      payload: { answer: answer.answer, text: answer.text },
    };
  }

  simulateAcknowledge(id: string): void {
    const a = this.alerts.get(id);
    if (!a) throw new Error(`Alert not found: ${id}`);
    a.status = 'acknowledged';
    a.response = {
      version: 1 as const,
      status: 'acknowledged',
      respondedAt: new Date().toISOString(),
      respondedBy: 'simulated-user',
      payload: {},
    };
  }

  reset(): void {
    this.questions.clear();
    this.alerts.clear();
    fakeIdCounter = 0;
  }
}
