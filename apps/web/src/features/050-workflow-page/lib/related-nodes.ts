/**
 * Related nodes computation — pure function for select-to-reveal.
 *
 * Given a selected node, computes upstream (input sources) and downstream
 * (nodes consuming this node's outputs) relationships from GraphStatusResult.
 *
 * Phase 4: Context Indicators — Plan 050
 */

import type { LineStatusResult, NodeStatusResult } from '@chainglass/positional-graph';

export interface NodeRelationship {
  nodeId: string;
  relation: 'upstream' | 'downstream';
  inputName: string;
  status: 'available' | 'waiting' | 'error';
}

export interface RelatedNodesResult {
  selected: string;
  related: NodeRelationship[];
  relatedNodeIds: Set<string>;
}

function extractUpstreamFromNode(node: NodeStatusResult): NodeRelationship[] {
  const relationships: NodeRelationship[] = [];
  for (const [inputName, entry] of Object.entries(node.inputPack.inputs)) {
    if (entry.status === 'available') {
      for (const src of entry.detail.sources) {
        relationships.push({
          nodeId: src.sourceNodeId,
          relation: 'upstream',
          inputName,
          status: 'available',
        });
      }
    } else if (entry.status === 'waiting') {
      for (const src of entry.detail.available) {
        relationships.push({
          nodeId: src.sourceNodeId,
          relation: 'upstream',
          inputName,
          status: 'available',
        });
      }
      for (const waitingNodeId of entry.detail.waiting) {
        relationships.push({
          nodeId: waitingNodeId,
          relation: 'upstream',
          inputName,
          status: 'waiting',
        });
      }
    }
    // error entries don't have source node references
  }
  return relationships;
}

export function computeRelatedNodes(
  selectedNodeId: string,
  lines: LineStatusResult[]
): RelatedNodesResult {
  const allNodes = lines.flatMap((l) => l.nodes);
  const selectedNode = allNodes.find((n) => n.nodeId === selectedNodeId);
  if (!selectedNode) {
    return { selected: selectedNodeId, related: [], relatedNodeIds: new Set() };
  }

  const related: NodeRelationship[] = [];

  // Upstream: nodes that feed into the selected node's inputs
  related.push(...extractUpstreamFromNode(selectedNode));

  // Downstream: nodes whose inputs reference the selected node
  for (const node of allNodes) {
    if (node.nodeId === selectedNodeId) continue;
    for (const [inputName, entry] of Object.entries(node.inputPack.inputs)) {
      let referencesSelected = false;
      if (entry.status === 'available') {
        referencesSelected = entry.detail.sources.some((s) => s.sourceNodeId === selectedNodeId);
      } else if (entry.status === 'waiting') {
        referencesSelected =
          entry.detail.available.some((s) => s.sourceNodeId === selectedNodeId) ||
          entry.detail.waiting.includes(selectedNodeId);
      }
      if (referencesSelected) {
        related.push({
          nodeId: node.nodeId,
          relation: 'downstream',
          inputName,
          status: entry.status,
        });
      }
    }
  }

  const relatedNodeIds = new Set(related.map((r) => r.nodeId));
  relatedNodeIds.add(selectedNodeId);

  return { selected: selectedNodeId, related, relatedNodeIds };
}
