// Eeads each node's raw source, detects PII fields + activities, stamps them onto the node
// Also copies piiTypes onto edges so the report knows what's flowing where

import { Graph, PiiType, ProcessingActivity } from '../utils/types';
import { PII_FIELD_PATTERNS, ACTIVITY_PATTERNS } from './patterns';

// run after buildGraph — nodes come in with empty piiTypes/processingActivities, leave with them filled
export function tagGraph(graph: Graph): Graph {
  for (const node of graph.nodes.values()) {
    node.piiTypes = detectPii(node.raw);
    node.processingActivities = detectActivities(node.raw);
  }

  // edges need to carry piiTypes too — grab them from the node the edge comes out of
  for (const edge of graph.edges) {
    const fromNode = graph.nodes.get(edge.from);
    if (fromNode) {
      edge.piiTypes = [...fromNode.piiTypes];
    }
  }

  return graph;
}

// does this file mention email, phone, name etc? returns which ones
export function detectPii(content: string): PiiType[] {
  const found: PiiType[] = [];
  for (const piiType of Object.keys(PII_FIELD_PATTERNS) as PiiType[]) {
    if (PII_FIELD_PATTERNS[piiType].some(p => p.test(content))) {
      found.push(piiType);
    }
  }
  return found;
}

// is this file validating, transforming, logging, persisting? returns what it finds
export function detectActivities(content: string): ProcessingActivity[] {
  const found: ProcessingActivity[] = [];
  for (const activity of Object.keys(ACTIVITY_PATTERNS) as ProcessingActivity[]) {
    if (ACTIVITY_PATTERNS[activity].some(p => p.test(content))) {
      found.push(activity);
    }
  }
  return found;
}
