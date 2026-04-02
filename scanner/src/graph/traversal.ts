// BFS and DFS over the adjacency list
// Both return node IDs in visit order, starting from startId

import { Graph } from '../utils/types';

// BFS — used by the PII tracer to find shortest paths from source to sinks
// It finds the most direct route first keeping trace paths short and readable (report)
export function bfs(graph: Graph, startId: string): string[] {
  if (!graph.nodes.has(startId)) return [];

  const visited = new Set<string>();
  const queue:  string[] = [startId];
  const result: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    result.push(current);

    for (const neighbor of graph.adjacency.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        queue.push(neighbor);
      }
    }
  }

  return result;
}

// DFS — For reachability checks and cycle detection
export function dfs(graph: Graph, startId: string): string[] {
  if (!graph.nodes.has(startId)) return [];

  const visited = new Set<string>();
  const result: string[] = [];

  function visit(nodeId: string): void {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    result.push(nodeId);

    for (const neighbor of graph.adjacency.get(nodeId) ?? []) {
      visit(neighbor);
    }
  }

  visit(startId);
  return result;
}
