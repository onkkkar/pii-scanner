// for each source node, finds every sink it can reach and records the path + what PII flows through it

import { bfs } from '../graph/traversal';
import { Graph, PiiType } from '../utils/types';

export interface PiiFinding {
  sourceId: string;
  sinkId:   string;
  path:     string[];  // node IDs in order, from source to sink
  piiTypes: PiiType[]; // union of piiTypes from every node on the path
}

// call after tagGraph — walks source→sink paths and returns one finding per route
export function tracePii(graph: Graph): PiiFinding[] {
  const findings: PiiFinding[] = [];
  const sources = Array.from(graph.nodes.values()).filter(n => n.kind === 'source');
  const sinks   = Array.from(graph.nodes.values()).filter(n => n.kind === 'sink');

  for (const source of sources) {
    // quick reachability check before doing the heavier path reconstruction
    const reachable = new Set(bfs(graph, source.id));

    for (const sink of sinks) {
      if (!reachable.has(sink.id)) continue;

      const path = findPath(graph, source.id, sink.id);
      if (!path) continue;

      findings.push({
        sourceId: source.id,
        sinkId:   sink.id,
        path,
        piiTypes: collectPiiAlongPath(graph, path),
      });
    }
  }

  return findings;
}

// BFS but we track each node's parent so we can reconstruct the actual path at the end
function findPath(graph: Graph, startId: string, targetId: string): string[] | null {
  if (startId === targetId) return [startId];

  const parent  = new Map<string, string>();
  const visited = new Set<string>([startId]);
  const queue   = [startId];

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const neighbor of graph.adjacency.get(current) ?? []) {
      if (visited.has(neighbor)) continue;
      parent.set(neighbor, current);

      if (neighbor === targetId) {
        // found it — walk back through parents to build the path
        const path: string[] = [targetId];
        let node = targetId;
        while (node !== startId) {
          node = parent.get(node)!;
          path.unshift(node);
        }
        return path;
      }

      visited.add(neighbor);
      queue.push(neighbor);
    }
  }

  return null;
}

// collects all unique piiTypes from every node along the path
function collectPiiAlongPath(graph: Graph, path: string[]): PiiType[] {
  const piiSet = new Set<PiiType>();
  for (const nodeId of path) {
    const node = graph.nodes.get(nodeId);
    if (node) {
      for (const pii of node.piiTypes) {
        piiSet.add(pii);
      }
    }
  }
  return Array.from(piiSet);
}
