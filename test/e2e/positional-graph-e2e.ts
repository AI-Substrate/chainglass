#!/usr/bin/env npx tsx
/**
 * Positional Graph E2E Prototype Script
 *
 * Exercises the complete positional graph lifecycle using the service API
 * with real NodeFileSystemAdapter and a real temp directory. Validates actual
 * YAML serialization round-trips, atomicWriteFile behavior, and OS-level
 * path resolution (DYK-P7-I1).
 *
 * Based on workshop pseudo-code (positional-graph-prototype.md §E2E) but
 * expanded beyond the 21 steps per DYK-P7-I3:
 * - Ordinal syntax removed (use plain from_unit slug)
 * - Combined set commands split into separate service methods
 * - Additional operations: removeInput, showNode, getLineStatus,
 *   triggerTransition, setLineLabel/Description, list
 *
 * Usage:
 *   npx tsx test/e2e/positional-graph-e2e.ts
 *
 * Exit codes:
 *   0 = all assertions passed
 *   1 = assertion failure or error
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { PositionalGraphService } from '@chainglass/positional-graph';
import { PositionalGraphAdapter } from '@chainglass/positional-graph/adapter';
import type { IWorkUnitLoader, NarrowWorkUnit } from '@chainglass/positional-graph/interfaces';
import { NodeFileSystemAdapter, PathResolverAdapter, YamlParserAdapter } from '@chainglass/shared';
import type { ResultError } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';

import {
  assert,
  cleanup,
  createStepCounter,
  createTestServiceStack,
  unwrap,
} from '../helpers/positional-graph-e2e-helpers.js';

// ============================================
// Helpers
// ============================================

const GRAPH = 'proto-test';

function createTestUnit(
  slug: string,
  inputs: Array<{ name: string; type: 'data' | 'file'; required: boolean }>,
  outputs: Array<{ name: string; type: 'data' | 'file'; required: boolean }>
): NarrowWorkUnit {
  return { slug, inputs, outputs };
}

function createFakeUnitLoader(units: NarrowWorkUnit[]): IWorkUnitLoader {
  const unitMap = new Map(units.map((u) => [u.slug, u]));
  return {
    async load(_ctx: WorkspaceContext, slug: string) {
      const unit = unitMap.get(slug);
      if (unit) return { unit, errors: [] };
      return { errors: [{ code: 'E120', message: `Unit '${slug}' not found` } as ResultError] };
    },
  };
}

// ============================================
// Unit definitions (DYK-P7-I4: outputs match from_output in wiring)
// ============================================

const sampleInput = createTestUnit(
  'sample-input',
  [],
  [
    { name: 'spec', type: 'data', required: true },
    { name: 'notes', type: 'data', required: false },
  ]
);

const sampleCoder = createTestUnit(
  'sample-coder',
  [
    { name: 'spec', type: 'data', required: true },
    { name: 'config', type: 'data', required: false },
  ],
  [{ name: 'code', type: 'data', required: true }]
);

const sampleReviewer = createTestUnit(
  'sample-reviewer',
  [{ name: 'research', type: 'data', required: false }],
  [{ name: 'review', type: 'data', required: true }]
);

const researchConcept = createTestUnit(
  'research-concept',
  [{ name: 'topic', type: 'data', required: false }],
  [{ name: 'summary', type: 'data', required: true }]
);

// ============================================
// Main
// ============================================

async function main(): Promise<void> {
  console.log('=== Positional Graph E2E Prototype ===\n');
  console.log('Using real NodeFileSystemAdapter + temp directory\n');

  const { step, count } = createStepCounter();

  // Create service stack with custom unit loader
  const loader = createFakeUnitLoader([sampleInput, sampleCoder, sampleReviewer, researchConcept]);
  const { service, ctx, workspacePath } = await createTestServiceStack('pg-e2e', loader);

  try {
    // ── 1. Create graph ──
    step('Create graph');
    const createResult = await service.create(ctx, GRAPH);
    assert(
      createResult.errors.length === 0,
      `Create failed: ${JSON.stringify(createResult.errors)}`
    );
    assert(createResult.graphSlug === GRAPH, 'Graph slug mismatch');
    const line0Id = createResult.lineId;
    assert(!!line0Id, 'No initial line ID');

    // ── 2. Verify graph in listing ──
    step('Verify graph appears in listing');
    const listResult = await service.list(ctx);
    assert(listResult.slugs.includes(GRAPH), 'Graph not in listing');

    // ── 3. Add node to line 0 ──
    step('Add sample-input node to line 0');
    const inputNode = await service.addNode(ctx, GRAPH, line0Id, 'sample-input');
    assert(inputNode.errors.length === 0, `Add node failed: ${JSON.stringify(inputNode.errors)}`);
    const inputNodeId = unwrap(inputNode.nodeId, 'inputNode.nodeId');

    // ── 4. Add line 1 ──
    step('Add line 1');
    const line1 = await service.addLine(ctx, GRAPH);
    assert(line1.errors.length === 0, `Add line failed: ${JSON.stringify(line1.errors)}`);
    const line1Id = unwrap(line1.lineId, 'line1.lineId');

    // ── 5. Add nodes to line 1 ──
    step('Add coder and reviewer to line 1');
    const coderNode = await service.addNode(ctx, GRAPH, line1Id, 'sample-coder');
    assert(coderNode.errors.length === 0, `Add coder failed: ${JSON.stringify(coderNode.errors)}`);
    const coderNodeId = unwrap(coderNode.nodeId, 'coderNode.nodeId');

    const reviewerNode = await service.addNode(ctx, GRAPH, line1Id, 'sample-reviewer');
    assert(
      reviewerNode.errors.length === 0,
      `Add reviewer failed: ${JSON.stringify(reviewerNode.errors)}`
    );
    const reviewerNodeId = unwrap(reviewerNode.nodeId, 'reviewerNode.nodeId');

    // ── 6. Insert research line between 0 and 1 ──
    step('Insert research line at index 1');
    const researchLine = await service.addLine(ctx, GRAPH, { atIndex: 1, label: 'Research' });
    assert(
      researchLine.errors.length === 0,
      `Insert line failed: ${JSON.stringify(researchLine.errors)}`
    );
    const researchLineId = unwrap(researchLine.lineId, 'researchLine.lineId');
    assert(researchLine.index === 1, `Expected index 1, got ${researchLine.index}`);

    // ── 7. Move reviewer to research line ──
    step('Move reviewer to research line');
    const moveResult = await service.moveNode(ctx, GRAPH, reviewerNodeId, {
      toLineId: researchLineId,
    });
    assert(moveResult.errors.length === 0, `Move failed: ${JSON.stringify(moveResult.errors)}`);

    // ── 8. Add research nodes ──
    step('Add research-concept nodes to research line');
    const r1 = await service.addNode(ctx, GRAPH, researchLineId, 'research-concept');
    assert(r1.errors.length === 0, `Add r1 failed: ${JSON.stringify(r1.errors)}`);
    const r1Id = unwrap(r1.nodeId, 'r1.nodeId');

    const r2 = await service.addNode(ctx, GRAPH, researchLineId, 'research-concept');
    assert(r2.errors.length === 0, `Add r2 failed: ${JSON.stringify(r2.errors)}`);
    const r2Id = unwrap(r2.nodeId, 'r2.nodeId');

    // ── 9. Reorder: move reviewer to end of research line ──
    step('Move reviewer to position 2 (end of research line)');
    const reorderResult = await service.moveNode(ctx, GRAPH, reviewerNodeId, { toPosition: 2 });
    assert(
      reorderResult.errors.length === 0,
      `Reorder failed: ${JSON.stringify(reorderResult.errors)}`
    );

    // ── 10. Set node execution mode ──
    step('Set reviewer to parallel execution');
    const execResult = await service.updateNodeOrchestratorSettings(ctx, GRAPH, reviewerNodeId, {
      execution: 'parallel',
    });
    assert(
      execResult.errors.length === 0,
      `Set execution failed: ${JSON.stringify(execResult.errors)}`
    );

    // ── 11. Show graph structure ──
    step('Show graph structure');
    const showResult = await service.show(ctx, GRAPH);
    assert(showResult.errors.length === 0, `Show failed: ${JSON.stringify(showResult.errors)}`);
    assert(
      unwrap(showResult.lines, 'showResult.lines').length === 3,
      `Expected 3 lines, got ${unwrap(showResult.lines, 'showResult.lines').length}`
    );
    console.log(
      `    Lines: ${unwrap(showResult.lines, 'showResult.lines')
        .map((l) => `${l.label || l.id}(${l.nodeCount}n)`)
        .join(' → ')}`
    );

    // ── 12. Move line (swap research and processing) ──
    step('Move processing line (line 2) to index 1');
    const lineMove = await service.moveLine(ctx, GRAPH, line1Id, 1);
    assert(lineMove.errors.length === 0, `Move line failed: ${JSON.stringify(lineMove.errors)}`);

    // Verify line order after move
    const showAfterLineMove = await service.show(ctx, GRAPH);
    assert(
      unwrap(showAfterLineMove.lines, 'showAfterLineMove.lines')[1].id === line1Id,
      'Line 1 should be processing after move'
    );

    // Move it back so research is at index 1 for clarity
    await service.moveLine(ctx, GRAPH, researchLineId, 1);

    // ── 13. Remove a research node ──
    step('Remove second research node');
    const removeR2 = await service.removeNode(ctx, GRAPH, r2Id);
    assert(removeR2.errors.length === 0, `Remove node failed: ${JSON.stringify(removeR2.errors)}`);

    // ── 14. Add and remove a temp line ──
    step('Add and remove temporary line');
    const tempLine = await service.addLine(ctx, GRAPH);
    assert(tempLine.errors.length === 0, 'Add temp line failed');
    const removeTempLine = await service.removeLine(
      ctx,
      GRAPH,
      unwrap(tempLine.lineId, 'tempLine.lineId')
    );
    assert(
      removeTempLine.errors.length === 0,
      `Remove temp line failed: ${JSON.stringify(removeTempLine.errors)}`
    );

    // ── 15. Set line label and description ──
    step('Set line label and description');
    const setLabel = await service.setLineLabel(ctx, GRAPH, researchLineId, 'Deep Research');
    assert(setLabel.errors.length === 0, 'Set label failed');
    const setDesc = await service.setLineDescription(
      ctx,
      GRAPH,
      researchLineId,
      'Research phase for knowledge gathering'
    );
    assert(setDesc.errors.length === 0, 'Set description failed');

    // Verify metadata round-trip through YAML
    const showAfterMeta = await service.show(ctx, GRAPH);
    const researchLineShow = unwrap(showAfterMeta.lines, 'showAfterMeta.lines').find(
      (l) => l.id === researchLineId
    );
    assert(
      researchLineShow?.label === 'Deep Research',
      `Label mismatch: ${researchLineShow?.label}`
    );

    // === STATUS COMPUTATION ===

    // ── 16. Check status on line 0 node (should be ready) ──
    step('Check line 0 node status (ready — no predecessors)');
    const statusInput = await service.getNodeStatus(ctx, GRAPH, inputNodeId);
    assert(statusInput.status === 'ready', `Expected ready, got ${statusInput.status}`);
    assert(statusInput.ready === true, 'Line 0 node should be ready');

    // ── 17. Check line 1+ node status (should be pending) ──
    step('Check later line node status (pending — line 0 not complete)');
    const statusCoder = await service.getNodeStatus(ctx, GRAPH, coderNodeId);
    assert(statusCoder.status === 'pending', `Expected pending, got ${statusCoder.status}`);
    assert(
      statusCoder.readyDetail.precedingLinesComplete === false,
      'Preceding lines should not be complete'
    );

    // ── 18. Set manual transition gate ──
    step('Set manual transition on line 0');
    const transResult = await service.updateLineOrchestratorSettings(ctx, GRAPH, line0Id, {
      transition: 'manual',
    });
    assert(transResult.errors.length === 0, 'Set transition failed');

    // ── 19. Show node detail ──
    step('Show node detail for coder');
    const coderShow = await service.showNode(ctx, GRAPH, coderNodeId);
    assert(coderShow.errors.length === 0, 'Show node failed');
    assert(coderShow.unitSlug === 'sample-coder', `Unit slug mismatch: ${coderShow.unitSlug}`);

    // ── 20. Graph-level status ──
    step('Get graph status');
    const graphStatus = await service.getStatus(ctx, GRAPH);
    assert(graphStatus.totalNodes > 0, `Expected nodes, got ${graphStatus.totalNodes}`);
    assert(graphStatus.readyNodes.length > 0, 'Should have ready nodes on line 0');
    console.log(
      `    Status: ${graphStatus.status}, ${graphStatus.completedNodes}/${graphStatus.totalNodes} complete, ${graphStatus.readyNodes.length} ready`
    );

    // === INPUT RESOLUTION ===

    // ── 21. Wire input by from_unit ──
    step('Wire coder input from sample-input (from_unit)');
    const wireResult = await service.setInput(ctx, GRAPH, coderNodeId, 'spec', {
      from_unit: 'sample-input',
      from_output: 'spec',
    });
    assert(
      wireResult.errors.length === 0,
      `Wire input failed: ${JSON.stringify(wireResult.errors)}`
    );

    // ── 22. Verify wiring via showNode ──
    step('Verify wiring persisted');
    const coderShowWired = await service.showNode(ctx, GRAPH, coderNodeId);
    assert(coderShowWired.inputs?.spec !== undefined, 'Input not wired on node');

    // ── 23. Wire reviewer input ──
    step('Wire reviewer input from research-concept (from_unit)');
    const wireReviewer = await service.setInput(ctx, GRAPH, reviewerNodeId, 'research', {
      from_unit: 'research-concept',
      from_output: 'summary',
    });
    assert(
      wireReviewer.errors.length === 0,
      `Wire reviewer failed: ${JSON.stringify(wireReviewer.errors)}`
    );

    // ── 24. Collate inputs (expect waiting) ──
    step('Collate coder inputs (expect waiting — producers not complete)');
    const pack1 = await service.collateInputs(ctx, GRAPH, coderNodeId);
    assert(pack1.ok === false, 'Expected ok=false (waiting)');
    assert(
      pack1.inputs.spec?.status === 'waiting',
      `Expected waiting, got ${pack1.inputs.spec?.status}`
    );

    // ── 25. Remove and re-wire input ──
    step('Remove coder input and re-wire');
    const removeInput = await service.removeInput(ctx, GRAPH, coderNodeId, 'spec');
    assert(removeInput.errors.length === 0, 'Remove input failed');

    // Verify removed
    const coderShowUnwired = await service.showNode(ctx, GRAPH, coderNodeId);
    assert(coderShowUnwired.inputs?.spec === undefined, 'Input should be removed');

    // Re-wire
    await service.setInput(ctx, GRAPH, coderNodeId, 'spec', {
      from_unit: 'sample-input',
      from_output: 'spec',
    });

    // ── 26. Simulate completion + write data ──
    step('Simulate line 0 node completion');
    const graphDir = path.join(workspacePath, '.chainglass', 'data', 'workflows', GRAPH);
    const stateContent = JSON.stringify({
      graph_status: 'in_progress',
      updated_at: new Date().toISOString(),
      nodes: {
        [inputNodeId]: { status: 'complete', completed_at: new Date().toISOString() },
      },
      transitions: {},
    });
    await fs.writeFile(path.join(graphDir, 'state.json'), stateContent);

    // Write data.json
    const dataDir = path.join(graphDir, 'nodes', inputNodeId, 'data');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(
      path.join(dataDir, 'data.json'),
      JSON.stringify({ spec: { title: 'E2E Test Spec' } })
    );

    // ── 27. Check research node — blocked by manual transition on line 0 ──
    step('Check research node blocked by manual transition gate');
    // Line 0 has manual transition → blocks line 1 (research) nodes
    const r1Status = await service.getNodeStatus(ctx, GRAPH, r1Id);
    assert(r1Status.readyDetail.precedingLinesComplete === true, 'Line 0 is complete');
    assert(
      r1Status.readyDetail.transitionOpen === false,
      'Research node blocked by manual transition'
    );

    // ── 28. Trigger transition ──
    step('Trigger manual transition on line 0');
    const trigger = await service.triggerTransition(ctx, GRAPH, line0Id);
    assert(trigger.errors.length === 0, `Trigger failed: ${JSON.stringify(trigger.errors)}`);

    // ── 29. Get line status ──
    step('Get line status for research line');
    const researchStatus = await service.getLineStatus(ctx, GRAPH, researchLineId);
    assert(researchStatus.transitionOpen === true, 'Transition should be open after trigger');

    // ── 30. Collate coder inputs (expect available after trigger) ──
    step('Collate coder inputs (expect available now)');
    const pack2 = await service.collateInputs(ctx, GRAPH, coderNodeId);
    assert(
      pack2.inputs.spec?.status === 'available',
      `Expected available, got ${pack2.inputs.spec?.status}`
    );
    if (pack2.inputs.spec?.status === 'available') {
      assert(pack2.inputs.spec.detail.sources.length === 1, 'Expected 1 source');
      const sourceData = pack2.inputs.spec.detail.sources[0].data as Record<string, unknown>;
      assert(
        (sourceData as { title: string }).title === 'E2E Test Spec',
        `Data mismatch: ${JSON.stringify(sourceData)}`
      );
    }

    // ── 31. Final status ──
    step('Get final graph status');
    const finalStatus = await service.getStatus(ctx, GRAPH);
    console.log(
      `    Final: ${finalStatus.status}, ${finalStatus.completedNodes}/${finalStatus.totalNodes} complete`
    );
    assert(
      finalStatus.completedNodes === 1,
      `Expected 1 complete, got ${finalStatus.completedNodes}`
    );

    // ── 32. Delete graph ──
    step('Delete graph');
    const deleteResult = await service.delete(ctx, GRAPH);
    assert(
      deleteResult.errors.length === 0,
      `Delete failed: ${JSON.stringify(deleteResult.errors)}`
    );

    // ── 33. Verify graph gone from listing ──
    step('Verify graph removed from listing');
    const finalList = await service.list(ctx);
    assert(!finalList.slugs.includes(GRAPH), 'Graph should not be in listing after delete');

    console.log(`\n=== ALL ${count()} E2E OPERATIONS VERIFIED ===\n`);
  } finally {
    await cleanup(workspacePath);
  }
}

main().catch((err) => {
  console.error('\nE2E FAILED:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
