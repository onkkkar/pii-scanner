// Builds a Graph from a flat list of ScannedFile objects

// Three phases:
//   1. Classify each file (source / sink / code_snippet) and create nodes
//   2. Build edges by calling rule.buildEdges() with the full tagged node list
//   3. Derive the adjacency Map from the edge list for O(1) neighbor lookup

import { basename, extname } from 'path';
import { ScannedFile, Graph, Node, NodeKind, Edge } from '../utils/types';
import { AnalysisRule } from './types';

export function buildGraph(files: ScannedFile[], rules: AnalysisRule[]): Graph {
  const nodes    = new Map<string, Node>();
  const edges:   Edge[]                  = [];
  const adjacency = new Map<string, string[]>();

  // Phase 1 — classify files and create nodes
  for (const file of files) {
    for (const rule of rules) {
      let kind: NodeKind;
      if (rule.isSource(file)) {
        kind = 'source';
      } else if (rule.isSink(file)) {
        kind = 'sink';
      } else {
        // Any file that is neither a source nor a sink is a processing node.
        kind = 'code_snippet';
      }

      const ext       = extname(file.filePath);
      const base      = basename(file.filePath, ext);
      const prefix    = kind === 'source' ? 'source' : kind === 'sink' ? 'sink' : 'fn';
      const defaultId = `${prefix}:${base}`;

      const rawNode: Node = {
        id: defaultId,
        kind,
        filePath: file.filePath,
        lineStart: 1,
        lineEnd: file.content.split('\n').length,
        piiTypes: [],
        processingActivities: [],
        raw: file.content,
        metadata: {},
      };

      // tagNode may change any field including id — always use the returned node.
      const node = rule.tagNode(rawNode, file);
      nodes.set(node.id, node);
    }
  }

  // Phase 2 — build edges
  const allNodes = Array.from(nodes.values());
  for (const rule of rules) {
    const newEdges = rule.buildEdges(allNodes, files);
    edges.push(...newEdges);
  }

  // Phase 3 — build adjacency list
  for (const node of nodes.values()) {
    adjacency.set(node.id, []);
  }
  for (const edge of edges) {
    const neighbors = adjacency.get(edge.from) ?? [];
    // Guard against duplicate neighbor entries when multiple rules produce the same edge.
    if (!neighbors.includes(edge.to)) {
      neighbors.push(edge.to);
    }
    adjacency.set(edge.from, neighbors);
  }

  return { nodes, edges, adjacency };
}
