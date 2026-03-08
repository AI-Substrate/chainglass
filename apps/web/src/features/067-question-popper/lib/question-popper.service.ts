/**
 * Plan 067: Question Popper — Real Service Implementation
 *
 * Server-side service that manages question and alert lifecycle.
 * Persists to `.chainglass/data/event-popper/{eventId}/in.json` and `out.json`.
 * Emits SSE events via ICentralEventNotifier on every lifecycle transition.
 * Tracks outstanding count in memory. Rehydrates from disk on construction.
 *
 * Architecture note (F003): Uses direct node:fs/node:path imports.
 * Server-side only (lives in apps/web), never bundled for client.
 * Same pattern as WorkUnitStateService (Plan 059).
 *
 * DYK-01: No IStateService dependency — outstanding count emitted via SSE.
 * DYK-02: Atomic rename (tmp→final) for out.json — first-write-wins.
 * DYK-03: Per-entry try/catch during rehydration — malformed entries skipped.
 * DYK-05: Rehydration filters on type discriminator — skips unknown types.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { generateEventId } from '@chainglass/shared/event-popper';
import type { ICentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events';
import { WorkspaceDomain } from '@chainglass/shared/features/027-central-notify-events';
import type { IQuestionPopperService } from '@chainglass/shared/interfaces';
import type { AnswerPayload } from '@chainglass/shared/question-popper';
import type {
  AlertIn,
  QuestionIn,
  QuestionStatus,
  StoredAlert,
  StoredEvent,
  StoredQuestion,
} from '@chainglass/shared/question-popper';

const DATA_DIR = 'event-popper';
const IN_FILE = 'in.json';
const OUT_FILE = 'out.json';

export class QuestionPopperService implements IQuestionPopperService {
  private outstandingCount = 0;
  private readonly dataDir: string;

  constructor(
    private readonly worktreePath: string,
    private readonly notifier: ICentralEventNotifier
  ) {
    this.dataDir = path.join(worktreePath, '.chainglass', 'data', DATA_DIR);
    this.rehydrate();
  }

  // ── Questions ──

  async askQuestion(input: QuestionIn): Promise<{ questionId: string }> {
    const questionId = generateEventId();
    const eventDir = path.join(this.dataDir, questionId);
    fs.mkdirSync(eventDir, { recursive: true });

    const request = {
      version: 1 as const,
      type: 'question',
      createdAt: new Date().toISOString(),
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
    };

    fs.writeFileSync(path.join(eventDir, IN_FILE), JSON.stringify(request, null, 2));
    this.outstandingCount++;
    this.emit('question-asked', { questionId, outstandingCount: this.outstandingCount });
    return { questionId };
  }

  async getQuestion(id: string): Promise<StoredQuestion | null> {
    return this.readStoredQuestion(id);
  }

  async answerQuestion(id: string, answer: AnswerPayload): Promise<void> {
    const stored = this.readStoredQuestion(id);
    if (!stored) throw new Error(`Question not found: ${id}`);
    if (stored.status !== 'pending')
      throw new Error(`Question already resolved: ${id} (${stored.status})`);

    const response = {
      version: 1 as const,
      status: 'answered',
      respondedAt: new Date().toISOString(),
      respondedBy: 'web-ui',
      payload: { answer: answer.answer, text: answer.text },
    };

    this.atomicWriteOut(id, response);
    this.outstandingCount = Math.max(0, this.outstandingCount - 1);
    this.emit('question-answered', { questionId: id, outstandingCount: this.outstandingCount });
  }

  async dismissQuestion(id: string): Promise<void> {
    const stored = this.readStoredQuestion(id);
    if (!stored) throw new Error(`Question not found: ${id}`);
    if (stored.status !== 'pending')
      throw new Error(`Question already resolved: ${id} (${stored.status})`);

    const response = {
      version: 1 as const,
      status: 'dismissed',
      respondedAt: new Date().toISOString(),
      respondedBy: 'web-ui',
      payload: {},
    };

    this.atomicWriteOut(id, response);
    this.outstandingCount = Math.max(0, this.outstandingCount - 1);
    this.emit('question-dismissed', { questionId: id, outstandingCount: this.outstandingCount });
  }

  async requestClarification(id: string, text: string): Promise<void> {
    const stored = this.readStoredQuestion(id);
    if (!stored) throw new Error(`Question not found: ${id}`);
    if (stored.status !== 'pending')
      throw new Error(`Question already resolved: ${id} (${stored.status})`);

    const response = {
      version: 1 as const,
      status: 'needs-clarification',
      respondedAt: new Date().toISOString(),
      respondedBy: 'web-ui',
      payload: { text },
    };

    this.atomicWriteOut(id, response);
    this.outstandingCount = Math.max(0, this.outstandingCount - 1);
    this.emit('question-clarification', {
      questionId: id,
      outstandingCount: this.outstandingCount,
    });
  }

  async listQuestions(filter?: { status?: QuestionStatus }): Promise<StoredQuestion[]> {
    const all = this.readAllEvents().filter((e): e is StoredQuestion => e.type === 'question');
    if (filter?.status) return all.filter((q) => q.status === filter.status);
    return all;
  }

  // ── Alerts ──

  async sendAlert(input: AlertIn): Promise<{ alertId: string }> {
    const alertId = generateEventId();
    const eventDir = path.join(this.dataDir, alertId);
    fs.mkdirSync(eventDir, { recursive: true });

    const request = {
      version: 1 as const,
      type: 'alert',
      createdAt: new Date().toISOString(),
      source: input.source,
      payload: {
        text: input.text,
        description: input.description ?? null,
      },
      ...(input.meta ? { meta: input.meta } : {}),
    };

    fs.writeFileSync(path.join(eventDir, IN_FILE), JSON.stringify(request, null, 2));
    this.outstandingCount++;
    this.emit('alert-sent', { alertId, outstandingCount: this.outstandingCount });
    return { alertId };
  }

  async getAlert(id: string): Promise<StoredAlert | null> {
    return this.readStoredAlert(id);
  }

  async acknowledgeAlert(id: string): Promise<void> {
    const stored = this.readStoredAlert(id);
    if (!stored) throw new Error(`Alert not found: ${id}`);
    if (stored.status !== 'unread') throw new Error(`Alert already acknowledged: ${id}`);

    const response = {
      version: 1 as const,
      status: 'acknowledged',
      respondedAt: new Date().toISOString(),
      respondedBy: 'web-ui',
      payload: {},
    };

    this.atomicWriteOut(id, response);
    this.outstandingCount = Math.max(0, this.outstandingCount - 1);
    this.emit('alert-acknowledged', { alertId: id, outstandingCount: this.outstandingCount });
  }

  // ── Queries ──

  async listAll(): Promise<StoredEvent[]> {
    return this.readAllEvents().sort(
      (a, b) => b.request.createdAt.localeCompare(a.request.createdAt) || b.id.localeCompare(a.id)
    );
  }

  getOutstandingCount(): number {
    return this.outstandingCount;
  }

  // ── Internal: Disk I/O ──

  private readStoredQuestion(id: string): StoredQuestion | null {
    const eventDir = path.join(this.dataDir, id);
    const inPath = path.join(eventDir, IN_FILE);

    if (!fs.existsSync(inPath)) return null;

    try {
      const request = JSON.parse(fs.readFileSync(inPath, 'utf-8'));
      if (request.type !== 'question') return null;

      const outPath = path.join(eventDir, OUT_FILE);
      const response = fs.existsSync(outPath)
        ? JSON.parse(fs.readFileSync(outPath, 'utf-8'))
        : null;

      const status: QuestionStatus = response ? (response.status as QuestionStatus) : 'pending';

      return { id, type: 'question', request, response, status };
    } catch {
      console.warn(`[QuestionPopperService] Failed to read question ${id}, skipping`);
      return null;
    }
  }

  private readStoredAlert(id: string): StoredAlert | null {
    const eventDir = path.join(this.dataDir, id);
    const inPath = path.join(eventDir, IN_FILE);

    if (!fs.existsSync(inPath)) return null;

    try {
      const request = JSON.parse(fs.readFileSync(inPath, 'utf-8'));
      if (request.type !== 'alert') return null;

      const outPath = path.join(eventDir, OUT_FILE);
      const response = fs.existsSync(outPath)
        ? JSON.parse(fs.readFileSync(outPath, 'utf-8'))
        : null;

      const status = response ? ('acknowledged' as const) : ('unread' as const);

      return { id, type: 'alert', request, response, status };
    } catch {
      console.warn(`[QuestionPopperService] Failed to read alert ${id}, skipping`);
      return null;
    }
  }

  private readAllEvents(): StoredEvent[] {
    if (!fs.existsSync(this.dataDir)) return [];

    const events: StoredEvent[] = [];
    const entries = fs.readdirSync(this.dataDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      try {
        const inPath = path.join(this.dataDir, entry.name, IN_FILE);
        if (!fs.existsSync(inPath)) continue;

        const request = JSON.parse(fs.readFileSync(inPath, 'utf-8'));

        // DYK-05: Filter on type discriminator — skip unknown types
        if (request.type === 'question') {
          const q = this.readStoredQuestion(entry.name);
          if (q) events.push(q);
        } else if (request.type === 'alert') {
          const a = this.readStoredAlert(entry.name);
          if (a) events.push(a);
        }
        // Unknown types silently skipped
      } catch {
        // DYK-03: Per-entry try/catch — skip malformed entries
        console.warn(`[QuestionPopperService] Skipping malformed entry: ${entry.name}`);
      }
    }

    return events;
  }

  /** DYK-02: First-write-wins via exclusive create flag ('wx'). */
  private atomicWriteOut(id: string, response: Record<string, unknown>): void {
    const eventDir = path.join(this.dataDir, id);
    const outPath = path.join(eventDir, OUT_FILE);

    try {
      // 'wx' = write + exclusive — fails with EEXIST if file already exists
      fs.writeFileSync(outPath, JSON.stringify(response, null, 2), { flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error(`Response already written for event ${id} (race)`);
      }
      throw error;
    }
  }

  /** Rehydrate outstanding count from disk on construction. DYK-03, DYK-05. */
  private rehydrate(): void {
    if (!fs.existsSync(this.dataDir)) return;

    let count = 0;
    const entries = fs.readdirSync(this.dataDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      try {
        const inPath = path.join(this.dataDir, entry.name, IN_FILE);
        if (!fs.existsSync(inPath)) continue;

        const request = JSON.parse(fs.readFileSync(inPath, 'utf-8'));

        // DYK-05: Only count known types
        if (request.type !== 'question' && request.type !== 'alert') continue;

        const outPath = path.join(this.dataDir, entry.name, OUT_FILE);
        if (!fs.existsSync(outPath)) {
          count++;
        }
      } catch {
        // DYK-03: Skip malformed entries — don't crash
        console.warn(
          `[QuestionPopperService] Skipping malformed entry during rehydration: ${entry.name}`
        );
      }
    }

    this.outstandingCount = count;

    if (count > 0) {
      this.emit('rehydrated', { outstandingCount: count });
    }
  }

  private emit(eventType: string, data: Record<string, unknown>): void {
    this.notifier.emit(WorkspaceDomain.EventPopper, eventType, data);
  }
}
