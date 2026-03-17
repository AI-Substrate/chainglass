/**
 * Test-data environment commands: create units/template/workflow, clean, status, run, stop.
 *
 * Plan 074 Phase 6 T006-T010.
 *
 * P6-DYK #3: All creates are delete-first for idempotency.
 * P6-DYK #4: NO monorepo imports — harness is self-contained.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCg, type CgExecOptions, type CgExecResult } from './cg-runner.js';
import { ALL_UNIT_SLUGS, TEST_DATA, UNIT_TYPES } from './constants.js';

/** Resolve the patches directory (harness/test-data/patches/) */
function getPatchesDir(): string {
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  // harness/src/test-data/ → ../../test-data/patches/
  return path.resolve(thisDir, '..', '..', 'test-data', 'patches');
}

// ── T006: Create Units ──────────────────────────────────

export async function createUnits(options: CgExecOptions): Promise<{ ok: boolean; results: CgExecResult[] }> {
  const results: CgExecResult[] = [];
  const patchesDir = getPatchesDir();

  for (const slug of ALL_UNIT_SLUGS) {
    const unitType = UNIT_TYPES[slug];

    // P6-DYK #3: Delete first (ignore errors — may not exist)
    await runCg(['unit', 'delete', slug], options);

    // Create scaffold
    const createResult = await runCg(['unit', 'create', slug, '--type', unitType], options);
    results.push(createResult);
    if (createResult.exitCode !== 0) {
      console.error(`  ✗ Failed to create unit ${slug}`);
      continue;
    }

    // Apply patch
    const patchFile = path.join(patchesDir, `${slug}.yaml`);
    const updateResult = await runCg(['unit', 'update', slug, '--patch', patchFile], options);
    results.push(updateResult);
    if (updateResult.exitCode !== 0) {
      console.error(`  ✗ Failed to patch unit ${slug}`);
      continue;
    }

    console.error(`  ✓ ${slug} (${unitType})`);
  }

  const ok = results.every((r) => r.exitCode === 0);
  return { ok, results };
}

// ── T007: Create Template ───────────────────────────────

export async function createTemplate(options: CgExecOptions): Promise<{ ok: boolean; results: CgExecResult[] }> {
  const results: CgExecResult[] = [];
  const src = TEST_DATA.sourceGraphSlug;
  const tpl = TEST_DATA.templateSlug;

  // P6-DYK #3: Delete existing template and source graph first
  await runCg(['template', 'delete', tpl], options);
  await runCg(['wf', 'delete', src], options);

  // Create source graph
  const createResult = await runCg(['wf', 'create', src], options);
  results.push(createResult);
  if (createResult.exitCode !== 0) {
    console.error('  ✗ Failed to create source graph');
    return { ok: false, results };
  }

  // Add 3 lines (per Workshop 003 topology)
  // Line 0: user-input
  const line0 = await runCg(['wf', 'line', 'add', src, '--label', 'Input'], options);
  results.push(line0);

  // Line 1: agent
  const line1 = await runCg(['wf', 'line', 'add', src, '--label', 'Processing'], options);
  results.push(line1);

  // Line 2: code + agent parallel
  const line2 = await runCg(['wf', 'line', 'add', src, '--label', 'Output'], options);
  results.push(line2);

  // Parse line IDs from JSON responses
  const lineIds = [line0, line1, line2].map((r) => {
    try {
      const parsed = JSON.parse(r.stdout);
      return parsed.data?.lineId ?? parsed.data?.id ?? null;
    } catch {
      return null;
    }
  });

  if (lineIds.some((id) => !id)) {
    // If we can't parse line IDs, try to get them from graph show
    const showResult = await runCg(['wf', 'show', src], options);
    try {
      const parsed = JSON.parse(showResult.stdout);
      const lines = parsed.data?.lines ?? parsed.data?.graph?.lines ?? [];
      for (let i = 0; i < Math.min(lines.length, 3); i++) {
        lineIds[i] = lines[i].id ?? lines[i].lineId;
      }
    } catch {
      console.error('  ✗ Could not resolve line IDs');
      return { ok: false, results };
    }
  }

  // Add nodes to lines
  if (lineIds[0]) {
    const n0 = await runCg(['wf', 'node', 'add', src, lineIds[0], TEST_DATA.units.userInput], options);
    results.push(n0);
  }
  if (lineIds[1]) {
    const n1 = await runCg(['wf', 'node', 'add', src, lineIds[1], TEST_DATA.units.agent], options);
    results.push(n1);
  }
  if (lineIds[2]) {
    const n2a = await runCg(['wf', 'node', 'add', src, lineIds[2], TEST_DATA.units.code], options);
    results.push(n2a);
    const n2b = await runCg(['wf', 'node', 'add', src, lineIds[2], TEST_DATA.units.agent], options);
    results.push(n2b);
  }

  // Save as template
  const saveResult = await runCg(['template', 'save-from', src, '--as', tpl], options);
  results.push(saveResult);
  if (saveResult.exitCode !== 0) {
    console.error('  ✗ Failed to save template');
    return { ok: false, results };
  }

  // Delete source graph (no longer needed)
  await runCg(['wf', 'delete', src], options);

  console.error(`  ✓ Template ${tpl} created`);
  const ok = results.every((r) => r.exitCode === 0);
  return { ok, results };
}

// ── T008: Create Workflow ───────────────────────────────

export async function createWorkflow(options: CgExecOptions): Promise<{ ok: boolean; results: CgExecResult[] }> {
  const results: CgExecResult[] = [];
  const wfId = TEST_DATA.workflowId;

  // Delete existing workflow first (idempotent)
  await runCg(['wf', 'delete', wfId], options);

  // Create graph directly (not via template instantiate — instances/ path
  // is invisible to PositionalGraphService which reads from data/workflows/)
  const createResult = await runCg(['wf', 'create', wfId], options);
  results.push(createResult);
  if (createResult.exitCode !== 0) {
    console.error('  ✗ Failed to create workflow graph');
    return { ok: false, results };
  }

  // Add 3 lines (same topology as createTemplate)
  const line0 = await runCg(['wf', 'line', 'add', wfId, '--label', 'Input'], options);
  results.push(line0);
  const line1 = await runCg(['wf', 'line', 'add', wfId, '--label', 'Processing'], options);
  results.push(line1);
  const line2 = await runCg(['wf', 'line', 'add', wfId, '--label', 'Output'], options);
  results.push(line2);

  // Parse line IDs
  const lineIds = [line0, line1, line2].map((r) => {
    try {
      const parsed = JSON.parse(r.stdout);
      return parsed.data?.lineId ?? parsed.data?.id ?? null;
    } catch {
      return null;
    }
  });

  if (lineIds.some((id) => !id)) {
    const showResult = await runCg(['wf', 'show', wfId], options);
    try {
      const parsed = JSON.parse(showResult.stdout);
      const lines = parsed.data?.lines ?? parsed.data?.graph?.lines ?? [];
      for (let i = 0; i < Math.min(lines.length, 3); i++) {
        lineIds[i] = lines[i].id ?? lines[i].lineId;
      }
    } catch {
      console.error('  ✗ Could not resolve line IDs');
      return { ok: false, results };
    }
  }

  // Add nodes: Line 0 = user-input, Line 1 = agent, Line 2 = code + agent
  if (lineIds[0]) {
    results.push(await runCg(['wf', 'node', 'add', wfId, lineIds[0], TEST_DATA.units.userInput], options));
  }
  if (lineIds[1]) {
    results.push(await runCg(['wf', 'node', 'add', wfId, lineIds[1], TEST_DATA.units.agent], options));
  }
  if (lineIds[2]) {
    results.push(await runCg(['wf', 'node', 'add', wfId, lineIds[2], TEST_DATA.units.code], options));
    results.push(await runCg(['wf', 'node', 'add', wfId, lineIds[2], TEST_DATA.units.agent], options));
  }

  const ok = results.every((r) => r.exitCode === 0);
  if (ok) {
    console.error(`  ✓ Workflow ${wfId} created with 4 nodes`);
  } else {
    console.error(`  ✗ Some workflow creation steps failed`);
  }
  return { ok, results };
}

// ── T009: Create Env (aggregate) ────────────────────────

export async function createEnv(options: CgExecOptions): Promise<{ ok: boolean; steps: Record<string, boolean> }> {
  console.error('\n[test-data] Creating test environment...\n');

  console.error('[1/3] Creating units...');
  const unitsResult = await createUnits(options);

  console.error('\n[2/3] Creating template...');
  const templateResult = await createTemplate(options);

  console.error('\n[3/3] Creating workflow instance...');
  const workflowResult = await createWorkflow(options);

  const steps = {
    units: unitsResult.ok,
    template: templateResult.ok,
    workflow: workflowResult.ok,
  };

  const ok = Object.values(steps).every(Boolean);
  console.error(`\n[test-data] ${ok ? '✓ Environment ready' : '✗ Some steps failed'}`);
  return { ok, steps };
}

// ── T010: Clean / Status / Run / Stop ───────────────────

export async function cleanTestData(options: CgExecOptions): Promise<{ ok: boolean }> {
  console.error('[test-data] Cleaning test data...');

  // Delete workflow instance
  await runCg(['wf', 'delete', TEST_DATA.workflowId], options);
  // Delete template
  await runCg(['template', 'delete', TEST_DATA.templateSlug], options);
  // Delete source graph (if leftover)
  await runCg(['wf', 'delete', TEST_DATA.sourceGraphSlug], options);
  // Delete units
  for (const slug of ALL_UNIT_SLUGS) {
    await runCg(['unit', 'delete', slug], options);
  }

  console.error('[test-data] ✓ Cleaned');
  return { ok: true };
}

export async function statusTestData(options: CgExecOptions): Promise<Record<string, string>> {
  const status: Record<string, string> = {};

  // Check units
  for (const slug of ALL_UNIT_SLUGS) {
    const result = await runCg(['unit', 'info', slug], options);
    status[`unit:${slug}`] = result.exitCode === 0 ? 'exists' : 'missing';
  }

  // Check template
  const tplResult = await runCg(['template', 'show', TEST_DATA.templateSlug], options);
  status[`template:${TEST_DATA.templateSlug}`] = tplResult.exitCode === 0 ? 'exists' : 'missing';

  // Check workflow
  const wfResult = await runCg(['wf', 'show', TEST_DATA.workflowId], options);
  status[`workflow:${TEST_DATA.workflowId}`] = wfResult.exitCode === 0 ? 'exists' : 'missing';

  return status;
}

export async function runTestWorkflow(options: CgExecOptions): Promise<CgExecResult> {
  console.error(`[test-data] Running workflow ${TEST_DATA.workflowId}...`);
  return runCg(['wf', 'run', TEST_DATA.workflowId], options);
}

export async function stopTestWorkflow(options: CgExecOptions): Promise<CgExecResult> {
  console.error(`[test-data] Stopping workflow ${TEST_DATA.workflowId}...`);
  return runCg(['wf', 'stop', TEST_DATA.workflowId], options);
}
