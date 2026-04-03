import { Graph, ActivityCatalog } from '../utils/types';
import { LLMClient } from './client';

// tagger gives us raw labels like "validation" or "logging" — not very useful in a report
// asks the LLM to give each activity a proper name + description, only once per activity type not once per node
export async function buildActivityCatalog(
  graph: Graph,
  client: LLMClient,
): Promise<ActivityCatalog> {
  const catalog: ActivityCatalog = {};

  for (const node of graph.nodes.values()) {
    if (node.processingActivities.length === 0) continue;

    for (const activity of node.processingActivities) {
      const canonicalId = `activity:${activity}`;

      if (catalog[canonicalId]) {
        // already described this one — just add current node to evidence and move on
        if (!catalog[canonicalId].evidence.includes(node.id)) {
          catalog[canonicalId].evidence.push(node.id);
        }
        continue;
      }

      const result = await client.suggestActivity(node.id, [activity]);

      catalog[canonicalId] = {
        canonicalName: result.activity,
        aliases:       [result.description],
        evidence:      [node.id],
      };
    }
  }

  return catalog;
}
