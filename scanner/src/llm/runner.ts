import { Graph, ActivityCatalog } from '../utils/types';
import { LLMClient, mockLLMClient } from './client';
import { classifyAmbiguousFields } from './classifier';
import { buildActivityCatalog } from './activities';
import { mergeCatalog } from './catalog';

// just call this one function from the main pipeline instead of calling each step manually
export async function runLLMLayer(
  graph: Graph,
  existingCatalog: ActivityCatalog,
  client?: LLMClient,
): Promise<ActivityCatalog> {
  const llm = client ?? mockLLMClient;

  await classifyAmbiguousFields(graph, llm);  // tags nodes the regex didn't catch
  const newCatalog = await buildActivityCatalog(graph, llm);  // builds the activity catalog
  return mergeCatalog(existingCatalog, newCatalog);  // merges with previous run 
}
