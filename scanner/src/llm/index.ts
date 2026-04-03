export { mockLLMClient, createClaudeClient } from './client';
export type { LLMClient, ClassifyResult, ActivityResult } from './client';
export { classifyAmbiguousFields } from './classifier';
export { buildActivityCatalog } from './activities';
export { loadCatalog, saveCatalog, mergeCatalog } from './catalog';
export { runLLMLayer } from './runner';
