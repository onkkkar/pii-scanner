import { walkRepo } from './extractor/index';
import { buildGraph, mernRule } from './graph/index';
import { tagGraph, tracePii } from './pii/index';
import { runLLMLayer } from './llm/index';
import { loadCatalog, saveCatalog } from './llm/catalog';
import { loadHashes, saveHashes, filterChangedFiles, buildHashMap } from './utils/incremental';
import { generateReport } from './output/report';
import { writeReport } from './output/writer';
import { Report } from './output/report';

export async function runScanner(repoPath: string): Promise<Report> {
  const savedHashes = loadHashes();
  const allFiles    = walkRepo(repoPath);
  const changed     = filterChangedFiles(allFiles, savedHashes);

  if (changed.length === 0) {
    console.log('No files changed since last run — using cached state');
  } else {
    console.log(`${changed.length} of ${allFiles.length} file(s) changed`);
  }

  const graph    = buildGraph(allFiles, [mernRule]);
  tagGraph(graph);
  const findings = tracePii(graph);

  const existingCatalog = loadCatalog();
  const catalog         = await runLLMLayer(graph, existingCatalog);

  // persist state for next run
  saveHashes(buildHashMap(allFiles));
  saveCatalog(catalog);

  const report = generateReport(graph, findings, catalog, repoPath);
  writeReport(report);

  return report;
}
