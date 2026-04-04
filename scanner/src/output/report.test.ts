// Group 1 — generateReport: shape and content
// Group 2 — writeReport: file I/O

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { walkRepo } from '../extractor/index';
import { buildGraph, mernRule } from '../graph/index';
import { tagGraph, tracePii } from '../pii/index';
import { runLLMLayer } from '../llm/index';
import { loadCatalog } from '../llm/catalog';
import { generateReport, Report } from './report';
import { writeReport } from './writer';

const SAMPLE_APP = path.resolve(__dirname, '../../..', 'sample-app');

// Group 1 — generateReport

describe('generateReport — shape and content', () => {
  let report: Report;

  beforeAll(async () => {
    const files    = walkRepo(SAMPLE_APP);
    const graph    = tagGraph(buildGraph(files, [mernRule]));
    const findings = tracePii(graph);
    const catalog  = await runLLMLayer(graph, loadCatalog());
    report = generateReport(graph, findings, catalog, SAMPLE_APP);
  });

  it('scanId matches scan-YYYYMMDD-HHMMSS format', () => {
    expect(report.scanId).toMatch(/^scan-\d{8}-\d{6}$/);
  });

  it('repoVersion is a string', () => {
    // either a 40-char git hash or "unknown" if not a git repo
    expect(typeof report.repoVersion).toBe('string');
    expect(report.repoVersion.length).toBeGreaterThan(0);
  });

  it('repoPath matches the path passed in', () => {
    expect(report.repoPath).toBe(SAMPLE_APP);
  });

  it('scannedAt is a valid ISO timestamp', () => {
    expect(() => new Date(report.scannedAt)).not.toThrow();
    expect(new Date(report.scannedAt).toISOString()).toBe(report.scannedAt);
  });

  it('sensitiveDataTypes is a non-empty array', () => {
    expect(Array.isArray(report.sensitiveDataTypes)).toBe(true);
    expect(report.sensitiveDataTypes.length).toBeGreaterThan(0);
  });

  it('sensitiveDataTypes contains EMAIL', () => {
    expect(report.sensitiveDataTypes).toContain('EMAIL');
  });

  it('traces is a non-empty array', () => {
    expect(Array.isArray(report.traces)).toBe(true);
    expect(report.traces.length).toBeGreaterThan(0);
  });

  it('each trace has sourceId, sinkId, path, and piiTypes', () => {
    for (const t of report.traces) {
      expect(typeof t.sourceId).toBe('string');
      expect(typeof t.sinkId).toBe('string');
      expect(Array.isArray(t.path)).toBe(true);
      expect(Array.isArray(t.piiTypes)).toBe(true);
    }
  });

  it('each trace path starts with the sourceId and ends with the sinkId', () => {
    for (const t of report.traces) {
      expect(t.path[0]).toBe(t.sourceId);
      expect(t.path[t.path.length - 1]).toBe(t.sinkId);
    }
  });

  it('processingActivities is a non-empty array', () => {
    expect(Array.isArray(report.processingActivities)).toBe(true);
    expect(report.processingActivities.length).toBeGreaterThan(0);
  });

  it('each activity has canonicalId, canonicalName, aliases, and evidence', () => {
    for (const a of report.processingActivities) {
      expect(typeof a.canonicalId).toBe('string');
      expect(typeof a.canonicalName).toBe('string');
      expect(Array.isArray(a.aliases)).toBe(true);
      expect(Array.isArray(a.evidence)).toBe(true);
    }
  });
});

// Group 2 — writeReport

describe('writeReport — file I/O', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pii-report-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('writes a file to the given path', async () => {
    const files    = walkRepo(SAMPLE_APP);
    const graph    = tagGraph(buildGraph(files, [mernRule]));
    const findings = tracePii(graph);
    const catalog  = await runLLMLayer(graph, {});
    const report   = generateReport(graph, findings, catalog, SAMPLE_APP);

    const outPath = path.join(tmpDir, 'report.json');
    writeReport(report, outPath);

    expect(fs.existsSync(outPath)).toBe(true);
  });

  it('written file is valid JSON and round-trips correctly', async () => {
    const files    = walkRepo(SAMPLE_APP);
    const graph    = tagGraph(buildGraph(files, [mernRule]));
    const findings = tracePii(graph);
    const catalog  = await runLLMLayer(graph, {});
    const report   = generateReport(graph, findings, catalog, SAMPLE_APP);

    const outPath = path.join(tmpDir, 'report.json');
    writeReport(report, outPath);

    const raw    = fs.readFileSync(outPath, 'utf-8');
    const parsed = JSON.parse(raw) as Report;

    expect(parsed.scanId).toBe(report.scanId);
    expect(parsed.repoVersion).toBe(report.repoVersion);
    expect(parsed.sensitiveDataTypes).toEqual(report.sensitiveDataTypes);
    expect(parsed.traces.length).toBe(report.traces.length);
  });
});
