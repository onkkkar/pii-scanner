import { Graph } from '../utils/types';
import { LLMClient, ClassifyResult } from './client';

// regex tagger only catches field names it already knows about (email, phone, etc.)
// anything it missed ends up here — we pull identifiers out of the raw node content and ask the LLM
export async function classifyAmbiguousFields(
  graph: Graph,
  client: LLMClient,
): Promise<Map<string, ClassifyResult>> {
  const results = new Map<string, ClassifyResult>();

  const untaggedNodes = Array.from(graph.nodes.values()).filter(n => n.piiTypes.length === 0);
  if (untaggedNodes.length === 0) return results;

  // grab lowercase identifiers that look like variable/object-key names
  const fieldNames = new Set<string>();
  for (const node of untaggedNodes) {
    const regex = /\b([a-z][a-zA-Z0-9]{2,})\s*[=:]/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(node.raw)) !== null) {
      fieldNames.add(match[1]);
    }
  }

  for (const fieldName of fieldNames) {
    const result = await client.classify(fieldName);
    results.set(fieldName, result);

    if (result.isPII && result.piiType) {
      const pattern = new RegExp(`\\b${fieldName}\\b`);
      for (const node of untaggedNodes) {
        if (pattern.test(node.raw) && !node.piiTypes.includes(result.piiType)) {
          node.piiTypes.push(result.piiType);
        }
      }
    }
  }

  return results;
}
