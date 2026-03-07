/**
 * Plan 067: Question Popper — Event Popper HTTP Client
 *
 * Typed HTTP client for CLI commands to call the event-popper API.
 * Uses native fetch() (Node 20+). Discovers server port via readServerInfo().
 *
 * Architecture:
 * - IEventPopperClient interface enables testing with FakeEventPopperClient
 * - Real client wraps fetch with error mapping and JSON parsing
 * - DYK-02: getQuestion distinguishes transient errors (connection refused)
 *   from fatal errors (404, 409) so the poll loop can retry safely
 *
 * Constitution Principle 4: FakeEventPopperClient, not vi.mock.
 */

import { readServerInfo } from '@chainglass/shared/event-popper';
import type { AlertOut, QuestionOut } from '@chainglass/shared/question-popper';

// ── Error Types ──

export class EventPopperClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = 'EventPopperClientError';
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
  get isConflict(): boolean {
    return this.status === 409;
  }
  get isTransient(): boolean {
    return this.status === 0; // Connection error
  }
}

// ── Client Interface ──

export interface AskQuestionBody {
  source: string;
  questionType: string;
  text: string;
  description?: string | null;
  options?: string[] | null;
  default?: string | boolean | null;
  timeout?: number;
  previousQuestionId?: string | null;
  meta?: Record<string, unknown>;
}

export interface SendAlertBody {
  source: string;
  text: string;
  description?: string | null;
  meta?: Record<string, unknown>;
}

export interface AnswerBody {
  answer: string | boolean | string[] | null;
  text: string | null;
}

export interface ListResult {
  items: (QuestionOut | AlertOut)[];
  total: number;
}

export interface IEventPopperClient {
  askQuestion(body: AskQuestionBody): Promise<{ questionId: string }>;
  getQuestion(id: string): Promise<QuestionOut>;
  answerQuestion(id: string, body: AnswerBody): Promise<QuestionOut>;
  sendAlert(body: SendAlertBody): Promise<{ alertId: string }>;
  listAll(params?: { status?: string; limit?: number }): Promise<ListResult>;
}

// ── Real Client ──

export function createEventPopperClient(baseUrl: string): IEventPopperClient {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      // Connection refused, DNS failure, etc. — transient
      throw new EventPopperClientError(
        `Cannot connect to server at ${baseUrl}: ${error instanceof Error ? error.message : String(error)}`,
        0
      );
    }

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text().catch(() => null);
      }
      const msg =
        errorBody && typeof errorBody === 'object' && 'message' in errorBody
          ? String((errorBody as Record<string, unknown>).message)
          : `HTTP ${response.status}`;
      throw new EventPopperClientError(msg, response.status, errorBody);
    }

    return (await response.json()) as T;
  }

  return {
    askQuestion: (body) =>
      request<{ questionId: string }>('POST', '/api/event-popper/ask-question', body),

    getQuestion: (id) => request<QuestionOut>('GET', `/api/event-popper/question/${id}`),

    answerQuestion: (id, body) =>
      request<QuestionOut>('POST', `/api/event-popper/answer-question/${id}`, body),

    sendAlert: (body) => request<{ alertId: string }>('POST', '/api/event-popper/send-alert', body),

    listAll: (params) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set('status', params.status);
      if (params?.limit) qs.set('limit', String(params.limit));
      const query = qs.toString();
      return request<ListResult>('GET', `/api/event-popper/list${query ? `?${query}` : ''}`);
    },
  };
}

// ── Server Discovery ──

export function discoverServerUrl(worktreePath?: string): string {
  const info = readServerInfo(worktreePath ?? process.cwd());
  if (!info) {
    throw new Error('Chainglass server not running. Start with: cg web');
  }
  return `http://localhost:${info.port}`;
}

// ── Fake Client (Constitution Principle 4) ──

interface CannedResponse<T> {
  data?: T;
  error?: EventPopperClientError;
}

export class FakeEventPopperClient implements IEventPopperClient {
  private questionResponses = new Map<string, CannedResponse<QuestionOut>>();
  private nextAskResult: { questionId: string } = { questionId: 'fake-q-001' };
  private nextAlertResult: { alertId: string } = { alertId: 'fake-a-001' };
  private nextListResult: ListResult = { items: [], total: 0 };
  private nextAnswerResult: QuestionOut | null = null;

  // ── Inspection ──
  public readonly calls: { method: string; args: unknown[] }[] = [];

  // ── Canned Response Setup ──

  setAskResult(result: { questionId: string }): void {
    this.nextAskResult = result;
  }

  setQuestionResponse(id: string, response: QuestionOut): void {
    this.questionResponses.set(id, { data: response });
  }

  setQuestionError(id: string, error: EventPopperClientError): void {
    this.questionResponses.set(id, { error });
  }

  setAlertResult(result: { alertId: string }): void {
    this.nextAlertResult = result;
  }

  setListResult(result: ListResult): void {
    this.nextListResult = result;
  }

  setAnswerResult(result: QuestionOut): void {
    this.nextAnswerResult = result;
  }

  // ── IEventPopperClient ──

  async askQuestion(body: AskQuestionBody): Promise<{ questionId: string }> {
    this.calls.push({ method: 'askQuestion', args: [body] });
    return this.nextAskResult;
  }

  async getQuestion(id: string): Promise<QuestionOut> {
    this.calls.push({ method: 'getQuestion', args: [id] });
    const canned = this.questionResponses.get(id);
    if (canned?.error) throw canned.error;
    if (canned?.data) return canned.data;
    throw new EventPopperClientError(`Question not found: ${id}`, 404);
  }

  async answerQuestion(id: string, body: AnswerBody): Promise<QuestionOut> {
    this.calls.push({ method: 'answerQuestion', args: [id, body] });
    if (this.nextAnswerResult) return this.nextAnswerResult;
    const canned = this.questionResponses.get(id);
    if (canned?.error) throw canned.error;
    if (canned?.data) return { ...canned.data, status: 'answered' };
    throw new EventPopperClientError(`Question not found: ${id}`, 404);
  }

  async sendAlert(body: SendAlertBody): Promise<{ alertId: string }> {
    this.calls.push({ method: 'sendAlert', args: [body] });
    return this.nextAlertResult;
  }

  async listAll(params?: { status?: string; limit?: number }): Promise<ListResult> {
    this.calls.push({ method: 'listAll', args: [params] });
    return this.nextListResult;
  }

  reset(): void {
    this.calls.length = 0;
    this.questionResponses.clear();
    this.nextAskResult = { questionId: 'fake-q-001' };
    this.nextAlertResult = { alertId: 'fake-a-001' };
    this.nextListResult = { items: [], total: 0 };
    this.nextAnswerResult = null;
  }
}
