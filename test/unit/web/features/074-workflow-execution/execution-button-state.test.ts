/**
 * Tests for deriveButtonState() — execution button state machine.
 *
 * Covers all 7 ManagerExecutionStatus values and actionPending/hydrating combos.
 * Source of truth: Workshop 001 state machine table.
 *
 * Plan 074 Phase 4 — T008
 */

import { deriveButtonState } from '@/features/074-workflow-execution/execution-button-state';
import { describe, expect, it } from 'vitest';

describe('deriveButtonState', () => {
  // ── Hydrating ────────────────────────────────────────────────────

  it('hides all buttons while hydrating', () => {
    const state = deriveButtonState('running', null, true);
    expect(state.run.visible).toBe(false);
    expect(state.stop.visible).toBe(false);
    expect(state.restart.visible).toBe(false);
  });

  // ── idle ─────────────────────────────────────────────────────────

  it('idle: Run visible+enabled, Stop hidden, Restart hidden', () => {
    const state = deriveButtonState('idle', null, false);
    expect(state.run).toEqual({ visible: true, enabled: true, label: 'Run' });
    expect(state.stop).toEqual({ visible: false, enabled: false });
    expect(state.restart).toEqual({ visible: false, enabled: false });
  });

  it('idle + actionPending=run: Run visible but disabled', () => {
    const state = deriveButtonState('idle', 'run', false);
    expect(state.run.visible).toBe(true);
    expect(state.run.enabled).toBe(false);
  });

  // ── starting ─────────────────────────────────────────────────────

  it('starting: Run visible+disabled, Stop hidden, Restart hidden', () => {
    const state = deriveButtonState('starting', null, false);
    expect(state.run).toEqual({ visible: true, enabled: false, label: 'Run' });
    expect(state.stop.visible).toBe(false);
    expect(state.restart.visible).toBe(false);
  });

  // ── running ──────────────────────────────────────────────────────

  it('running: Run hidden, Stop visible+enabled, Restart hidden', () => {
    const state = deriveButtonState('running', null, false);
    expect(state.run.visible).toBe(false);
    expect(state.stop).toEqual({ visible: true, enabled: true });
    expect(state.restart.visible).toBe(false);
  });

  it('running + actionPending=stop: Stop visible but disabled', () => {
    const state = deriveButtonState('running', 'stop', false);
    expect(state.stop.visible).toBe(true);
    expect(state.stop.enabled).toBe(false);
  });

  // ── stopping ─────────────────────────────────────────────────────

  it('stopping: Run hidden, Stop visible+disabled, Restart hidden', () => {
    const state = deriveButtonState('stopping', null, false);
    expect(state.run.visible).toBe(false);
    expect(state.stop).toEqual({ visible: true, enabled: false });
    expect(state.restart.visible).toBe(false);
  });

  // ── stopped ──────────────────────────────────────────────────────

  it('stopped: Run "Resume" enabled, Stop hidden, Restart enabled', () => {
    const state = deriveButtonState('stopped', null, false);
    expect(state.run).toEqual({ visible: true, enabled: true, label: 'Resume' });
    expect(state.stop.visible).toBe(false);
    expect(state.restart).toEqual({ visible: true, enabled: true });
  });

  it('stopped + actionPending=run: Run visible but disabled', () => {
    const state = deriveButtonState('stopped', 'run', false);
    expect(state.run.visible).toBe(true);
    expect(state.run.enabled).toBe(false);
    expect(state.restart.visible).toBe(true);
    expect(state.restart.enabled).toBe(false);
  });

  // ── completed ────────────────────────────────────────────────────

  it('completed: Run hidden, Stop hidden, Restart enabled', () => {
    const state = deriveButtonState('completed', null, false);
    expect(state.run.visible).toBe(false);
    expect(state.stop.visible).toBe(false);
    expect(state.restart).toEqual({ visible: true, enabled: true });
  });

  // ── failed ───────────────────────────────────────────────────────

  it('failed: Run "Retry" enabled, Stop hidden, Restart enabled', () => {
    const state = deriveButtonState('failed', null, false);
    expect(state.run).toEqual({ visible: true, enabled: true, label: 'Retry' });
    expect(state.stop.visible).toBe(false);
    expect(state.restart).toEqual({ visible: true, enabled: true });
  });

  it('failed + actionPending=restart: Restart visible but disabled', () => {
    const state = deriveButtonState('failed', 'restart', false);
    expect(state.run.visible).toBe(true);
    expect(state.run.enabled).toBe(false);
    expect(state.restart.visible).toBe(true);
    expect(state.restart.enabled).toBe(false);
  });
});
