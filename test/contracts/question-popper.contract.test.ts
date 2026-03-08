/**
 * Plan 067: Question Popper — Contract Test Runner
 *
 * Phase 2: Runs against FakeQuestionPopperService + real QuestionPopperService.
 * Includes B01-style companion tests for SSE emission verification.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { FakeQuestionPopperService } from '@chainglass/shared/fakes';
import { FakeCentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QuestionPopperService } from '../../apps/web/src/features/067-question-popper/lib/question-popper.service';
import { questionPopperContractTests } from './question-popper.contract.js';

// === Phase 2: FakeQuestionPopperService ===

questionPopperContractTests('FakeQuestionPopperService', () => {
  const fake = new FakeQuestionPopperService();
  fake.reset();
  return { service: fake };
});

// === Phase 2: QuestionPopperService (real) ===

let realTmpDir: string;

questionPopperContractTests('QuestionPopperService', () => {
  realTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qp-contract-'));
  const notifier = new FakeCentralEventNotifier();
  const service = new QuestionPopperService(realTmpDir, notifier);
  return { service };
});

afterEach(() => {
  if (realTmpDir && fs.existsSync(realTmpDir)) {
    fs.rmSync(realTmpDir, { recursive: true, force: true });
  }
});

// === Phase 2: Companion SSE Emission Tests (B01-style) ===

describe('QuestionPopperService — SSE Emission Assertions', () => {
  let tmpDir: string;
  let notifier: FakeCentralEventNotifier;
  let service: QuestionPopperService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qp-sse-'));
    notifier = new FakeCentralEventNotifier();
    service = new QuestionPopperService(tmpDir, notifier);
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('B01: askQuestion emits question-asked SSE with questionId and outstandingCount', async () => {
    /*
    Test Doc:
    - Why: Companion to C01 — verifies SSE emission for real service
    - Contract: askQuestion() → emit('event-popper', 'question-asked', { questionId, outstandingCount })
    - Usage Notes: Domain is 'event-popper' not 'question-popper' — matches SSE channel name
    - Quality Contribution: Catches missing or malformed SSE payloads that would break real-time UI
    - Worked Example: askQuestion('Test?') → emittedEvents[0] === { domain:'event-popper', eventType:'question-asked', data:{ questionId, outstandingCount:1 } }
    */
    const { questionId } = await service.askQuestion({
      questionType: 'text',
      text: 'Test question',
      source: 'test-agent',
    });

    const events = notifier.emittedEvents;
    expect(events).toHaveLength(1);
    expect(events[0]?.domain).toBe('event-popper');
    expect(events[0]?.eventType).toBe('question-asked');
    expect(events[0]?.data).toEqual({ questionId, outstandingCount: 1 });
  });

  it('B02: answerQuestion emits question-answered SSE and decrements count', async () => {
    /*
    Test Doc:
    - Why: Companion to C02 — verifies SSE emission on answer
    - Contract: answerQuestion() → emit('event-popper', 'question-answered', { questionId, outstandingCount })
    - Usage Notes: outstandingCount in the event reflects post-answer state (decremented)
    - Quality Contribution: Ensures UI badge decrements in real-time without needing a refetch
    - Worked Example: ask → answer → events[1] === { eventType:'question-answered', data:{ questionId, outstandingCount:0 } }
    */
    const { questionId } = await service.askQuestion({
      questionType: 'confirm',
      text: 'Deploy?',
      source: 'test',
    });

    await service.answerQuestion(questionId, { answer: true, text: null });

    const events = notifier.emittedEvents;
    expect(events).toHaveLength(2);
    expect(events[1]?.eventType).toBe('question-answered');
    expect(events[1]?.data).toEqual({ questionId, outstandingCount: 0 });
  });

  it('B03: sendAlert + acknowledgeAlert emit correct SSE sequence', async () => {
    /*
    Test Doc:
    - Why: Companion to C05/C06 — verifies SSE emission for alert lifecycle
    - Contract: sendAlert→emit alert-sent, acknowledgeAlert→emit alert-acknowledged
    - Usage Notes: Both events carry outstandingCount — alert-sent increments, alert-acknowledged decrements
    - Quality Contribution: Validates the full alert SSE sequence (2 events) in order
    - Worked Example: sendAlert → event[0]={ type:'alert-sent', count:1 }; ack → event[1]={ type:'alert-acknowledged', count:0 }
    */
    const { alertId } = await service.sendAlert({
      text: 'Build done',
      source: 'test',
    });

    await service.acknowledgeAlert(alertId);

    const events = notifier.emittedEvents;
    expect(events).toHaveLength(2);
    expect(events[0]?.eventType).toBe('alert-sent');
    expect(events[0]?.data).toEqual({ alertId, outstandingCount: 1 });
    expect(events[1]?.eventType).toBe('alert-acknowledged');
    expect(events[1]?.data).toEqual({ alertId, outstandingCount: 0 });
  });

  it('B04: rehydration restores outstanding count from disk', async () => {
    /*
    Test Doc:
    - Why: DYK-04 — verifies rehydration emits correct count after restart
    - Contract: Create questions, construct new service → outstanding count matches disk state
    - Usage Notes: Rehydration emits a single 'rehydrated' event — UI should treat it as initial state sync
    - Quality Contribution: Catches off-by-one or stale-count bugs after server restart
    - Worked Example: ask Q1 + Q2 → new service(same dir) → getOutstandingCount()=2, rehydrated event data={ outstandingCount:2 }
    */
    await service.askQuestion({ questionType: 'text', text: 'Q1', source: 'test' });
    await service.askQuestion({ questionType: 'text', text: 'Q2', source: 'test' });

    // Construct a new service instance (simulates restart)
    const notifier2 = new FakeCentralEventNotifier();
    const service2 = new QuestionPopperService(tmpDir, notifier2);

    expect(service2.getOutstandingCount()).toBe(2);

    // Should have emitted a rehydrated event
    const rehydratedEvents = notifier2.emittedEvents.filter((e) => e.eventType === 'rehydrated');
    expect(rehydratedEvents).toHaveLength(1);
    expect(rehydratedEvents[0]?.data).toEqual({ outstandingCount: 2 });
  });

  it('B05: disk persistence round-trip — data survives service restart', async () => {
    /*
    Test Doc:
    - Why: Verifies actual disk persistence, not just in-memory
    - Contract: Write via service1, read via service2 → data intact
    - Usage Notes: Tests the full round-trip: ask + answer via service1, read via fresh service2
    - Quality Contribution: Catches serialization bugs — if JSON read/write loses fields, this fails
    - Worked Example: service1: ask single ['A','B'] → answer 'A'; service2(same dir): getQuestion(id).response.payload === { answer:'A', text:'Chose A' }
    */
    const { questionId } = await service.askQuestion({
      questionType: 'single',
      text: 'Pick one',
      options: ['A', 'B'],
      source: 'test',
    });

    await service.answerQuestion(questionId, { answer: 'A', text: 'Chose A' });

    // New service reads from disk
    const notifier2 = new FakeCentralEventNotifier();
    const service2 = new QuestionPopperService(tmpDir, notifier2);

    const stored = await service2.getQuestion(questionId);
    expect(stored).not.toBeNull();
    expect(stored?.status).toBe('answered');
    expect(stored?.response?.payload).toEqual({ answer: 'A', text: 'Chose A' });
  });
});
