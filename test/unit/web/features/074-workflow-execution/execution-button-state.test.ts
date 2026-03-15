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
    /**
     * Test Doc:
     * - Why: Prevents stale clicks during initial state load (P4-DYK #2).
     * - Contract: deriveButtonState(any, any, true) hides all buttons.
     * - Usage Notes: Hydration guard runs before SSE events arrive.
     * - Quality Contribution: Catches regressions where hydrating still shows controls.
     * - Worked Example: hydrating=true → run.visible=false, stop.visible=false, restart.visible=false.
     */
    const state = deriveButtonState('running', null, true);
    expect(state.run.visible).toBe(false);
    expect(state.stop.visible).toBe(false);
    expect(state.restart.visible).toBe(false);
  });

  // ── idle ─────────────────────────────────────────────────────────

  it('idle: Run visible+enabled, Stop hidden, Restart hidden', () => {
    /**
     * Test Doc:
     * - Why: Protects the Phase 4 toolbar state machine for idle workflows.
     * - Contract: deriveButtonState('idle', null, false) exposes only an enabled Run button.
     * - Usage Notes: Source-of-truth pure utility used by WorkflowTempBar.
     * - Quality Contribution: Catches regressions where idle workflows show wrong controls.
     * - Worked Example: status='idle' → run={visible:true,enabled:true,label:'Run'}, stop/restart hidden.
     */
    const state = deriveButtonState('idle', null, false);
    expect(state.run).toEqual({ visible: true, enabled: true, label: 'Run' });
    expect(state.stop).toEqual({ visible: false, enabled: false });
    expect(state.restart).toEqual({ visible: false, enabled: false });
  });

  it('idle + actionPending=run: Run visible but disabled', () => {
    /**
     * Test Doc:
     * - Why: Prevents double-click during action flight (DYK #3).
     * - Contract: actionPending disables the active button.
     * - Usage Notes: Action-gated button state prevents stale server calls.
     * - Quality Contribution: Catches regressions where pending actions still allow clicks.
     * - Worked Example: status='idle', actionPending='run' → run.enabled=false.
     */
    const state = deriveButtonState('idle', 'run', false);
    expect(state.run.visible).toBe(true);
    expect(state.run.enabled).toBe(false);
  });

  // ── starting ─────────────────────────────────────────────────────

  it('starting: Run visible+disabled, Stop hidden, Restart hidden', () => {
    /**
     * Test Doc:
     * - Why: Shows spinner state while drive() initializes.
     * - Contract: deriveButtonState('starting', null, false) shows disabled Run.
     * - Usage Notes: Starting is a transitional state before running.
     * - Quality Contribution: Catches regressions where starting allows action clicks.
     * - Worked Example: status='starting' → run={visible:true,enabled:false}, stop/restart hidden.
     */
    const state = deriveButtonState('starting', null, false);
    expect(state.run).toEqual({ visible: true, enabled: false, label: 'Run' });
    expect(state.stop.visible).toBe(false);
    expect(state.restart.visible).toBe(false);
  });

  // ── running ──────────────────────────────────────────────────────

  it('running: Run hidden, Stop visible+enabled, Restart hidden', () => {
    /**
     * Test Doc:
     * - Why: During active execution, only Stop should be available.
     * - Contract: deriveButtonState('running', null, false) shows only Stop.
     * - Usage Notes: Run and Restart hidden to prevent conflicting actions.
     * - Quality Contribution: Catches regressions where running shows Run/Restart.
     * - Worked Example: status='running' → stop={visible:true,enabled:true}, run/restart hidden.
     */
    const state = deriveButtonState('running', null, false);
    expect(state.run.visible).toBe(false);
    expect(state.stop).toEqual({ visible: true, enabled: true });
    expect(state.restart.visible).toBe(false);
  });

  it('running + actionPending=stop: Stop visible but disabled', () => {
    /**
     * Test Doc:
     * - Why: Prevents double-stop during abort processing.
     * - Contract: actionPending='stop' disables the Stop button.
     * - Usage Notes: Stop action awaits drive() completion — disable during flight.
     * - Quality Contribution: Catches regressions where pending stop allows re-click.
     * - Worked Example: status='running', actionPending='stop' → stop.enabled=false.
     */
    const state = deriveButtonState('running', 'stop', false);
    expect(state.stop.visible).toBe(true);
    expect(state.stop.enabled).toBe(false);
  });

  // ── stopping ─────────────────────────────────────────────────────

  it('stopping: Run hidden, Stop visible+disabled, Restart hidden', () => {
    /**
     * Test Doc:
     * - Why: Stopping is transitional — shows spinner on Stop, hides others.
     * - Contract: deriveButtonState('stopping', null, false) shows disabled Stop only.
     * - Usage Notes: All nodes locked during stopping (see isLineEditable).
     * - Quality Contribution: Catches regressions where stopping enables actions.
     * - Worked Example: status='stopping' → stop={visible:true,enabled:false}, run/restart hidden.
     */
    const state = deriveButtonState('stopping', null, false);
    expect(state.run.visible).toBe(false);
    expect(state.stop).toEqual({ visible: true, enabled: false });
    expect(state.restart.visible).toBe(false);
  });

  // ── stopped ──────────────────────────────────────────────────────

  it('stopped: Run "Resume" enabled, Stop hidden, Restart enabled', () => {
    /**
     * Test Doc:
     * - Why: Stopped workflows offer Resume (continue) and Restart (clean slate).
     * - Contract: deriveButtonState('stopped', null, false) shows Resume + Restart.
     * - Usage Notes: Run button label changes to "Resume" per Workshop 001.
     * - Quality Contribution: Catches regressions where stopped state shows wrong labels/buttons.
     * - Worked Example: status='stopped' → run={label:'Resume'}, restart={visible:true}.
     */
    const state = deriveButtonState('stopped', null, false);
    expect(state.run).toEqual({ visible: true, enabled: true, label: 'Resume' });
    expect(state.stop.visible).toBe(false);
    expect(state.restart).toEqual({ visible: true, enabled: true });
  });

  it('stopped + actionPending=run: Run visible but disabled', () => {
    /**
     * Test Doc:
     * - Why: Prevents double-resume during action flight.
     * - Contract: actionPending disables both Run and Restart when stopped.
     * - Usage Notes: All actions disabled when any action is pending.
     * - Quality Contribution: Catches regressions where pending actions don't disable all buttons.
     * - Worked Example: stopped + actionPending='run' → run.enabled=false, restart.enabled=false.
     */
    const state = deriveButtonState('stopped', 'run', false);
    expect(state.run.visible).toBe(true);
    expect(state.run.enabled).toBe(false);
    expect(state.restart.visible).toBe(true);
    expect(state.restart.enabled).toBe(false);
  });

  // ── completed ────────────────────────────────────────────────────

  it('completed: Run hidden, Stop hidden, Restart enabled', () => {
    /**
     * Test Doc:
     * - Why: Completed workflows only offer Restart (all nodes done).
     * - Contract: deriveButtonState('completed', null, false) shows only Restart.
     * - Usage Notes: Run hidden because there's nothing to resume.
     * - Quality Contribution: Catches regressions where completed shows Run/Stop.
     * - Worked Example: status='completed' → restart={visible:true,enabled:true}, run/stop hidden.
     */
    const state = deriveButtonState('completed', null, false);
    expect(state.run.visible).toBe(false);
    expect(state.stop.visible).toBe(false);
    expect(state.restart).toEqual({ visible: true, enabled: true });
  });

  // ── failed ───────────────────────────────────────────────────────

  it('failed: Run "Retry" enabled, Stop hidden, Restart enabled', () => {
    /**
     * Test Doc:
     * - Why: Failed workflows offer Retry (resume from failure) and Restart (clean slate).
     * - Contract: deriveButtonState('failed', null, false) shows Retry + Restart.
     * - Usage Notes: Run label changes to "Retry" per Workshop 001.
     * - Quality Contribution: Catches regressions where failed state shows wrong labels/buttons.
     * - Worked Example: status='failed' → run={label:'Retry'}, restart={visible:true}.
     */
    const state = deriveButtonState('failed', null, false);
    expect(state.run).toEqual({ visible: true, enabled: true, label: 'Retry' });
    expect(state.stop.visible).toBe(false);
    expect(state.restart).toEqual({ visible: true, enabled: true });
  });

  it('failed + actionPending=restart: Restart visible but disabled', () => {
    /**
     * Test Doc:
     * - Why: Prevents double-restart during action flight.
     * - Contract: actionPending disables both Run and Restart when failed.
     * - Usage Notes: All actions disabled when any action is pending.
     * - Quality Contribution: Catches regressions where pending restart doesn't disable Run.
     * - Worked Example: failed + actionPending='restart' → run.enabled=false, restart.enabled=false.
     */
    const state = deriveButtonState('failed', 'restart', false);
    expect(state.run.visible).toBe(true);
    expect(state.run.enabled).toBe(false);
    expect(state.restart.visible).toBe(true);
    expect(state.restart.enabled).toBe(false);
  });
});
