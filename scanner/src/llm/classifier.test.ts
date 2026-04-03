// Tests for the LLM layer — all groups use mockLLMClient so the real API is never called.
// Group 1: mockLLMClient shape verification
// Group 2: classifyAmbiguousFields — finding and tagging untagged nodes
// Group 3: buildActivityCatalog — building catalog from tagged sample-app graph
// Group 4: catalog operations — load, save, merge

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { walkRepo } from '../extractor/index';
import { buildGraph, mernRule } from '../graph/index';
import { tagGraph } from '../pii/index';
import { ActivityCatalog, Graph } from '../utils/types';
import {
  buildActivityCatalog,
  classifyAmbiguousFields,
  loadCatalog,
  mergeCatalog,
  mockLLMClient,
  runLLMLayer,
  saveCatalog,
} from './index';

const SAMPLE_APP = path.resolve(__dirname, '../../..', 'sample-app');

// Group 1 — mockLLMClient: shape and behaviour

describe('mockLLMClient — shape and behaviour', () => {
  it('classify returns isPII, piiType, and confidence', async () => {
    const result = await mockLLMClient.classify('email');
    expect(result).toHaveProperty('isPII');
    expect(result).toHaveProperty('piiType');
    expect(result).toHaveProperty('confidence');
  });

  it('suggestActivity returns activity and description strings', async () => {
    const result = await mockLLMClient.suggestActivity('fn:register', ['validation']);
    expect(typeof result.activity).toBe('string');
    expect(typeof result.description).toBe('string');
  });

  it('suggestActivity uses the first activity name in the response', async () => {
    const result = await mockLLMClient.suggestActivity('fn:register', ['transformation']);
    expect(result.activity).toBe('transformation');
  });
});

// Group 2 — classifyAmbiguousFields: finds and tags untagged nodes

describe('classifyAmbiguousFields — untagged node handling', () => {
  it('returns a Map', async () => {
    const files = walkRepo(SAMPLE_APP);
    const graph = tagGraph(buildGraph(files, [mernRule]));
    const results = await classifyAmbiguousFields(graph, mockLLMClient);
    expect(results instanceof Map).toBe(true);
  });

  it('only processes nodes with empty piiTypes', async () => {
    const files = walkRepo(SAMPLE_APP);
    const graph = tagGraph(buildGraph(files, [mernRule]));

    // count nodes with no piiTypes before
    const untaggedBefore = Array.from(graph.nodes.values()).filter(n => n.piiTypes.length === 0);
    await classifyAmbiguousFields(graph, mockLLMClient);

    // mock always returns isPII: true, so untagged nodes should now have piiTypes
    for (const node of untaggedBefore) {
      expect(node.piiTypes.length).toBeGreaterThan(0);
    }
  });

  it('classifying a field named "uid" does not throw', async () => {
    // build a minimal graph with a node that has "uid" in its content and no piiTypes
    const graph: Graph = {
      nodes: new Map([
        ['sink:users', {
          id: 'sink:users',
          kind: 'sink',
          filePath: 'backend/userModel.js',
          lineStart: 1,
          lineEnd: 5,
          piiTypes: [],
          processingActivities: [],
          raw: 'const uid = req.body.uid;',
          metadata: {},
        }],
      ]),
      edges: [],
      adjacency: new Map([['sink:users', []]]),
    };

    await expect(classifyAmbiguousFields(graph, mockLLMClient)).resolves.not.toThrow();
  });

  it('returns empty Map when all nodes already have piiTypes', async () => {
    // graph where every node is already tagged
    const graph: Graph = {
      nodes: new Map([
        ['source:Form', {
          id: 'source:Form',
          kind: 'source',
          filePath: 'Form.jsx',
          lineStart: 1, lineEnd: 10,
          piiTypes: ['EMAIL'],
          processingActivities: [],
          raw: 'email',
          metadata: {},
        }],
      ]),
      edges: [],
      adjacency: new Map([['source:Form', []]]),
    };

    const results = await classifyAmbiguousFields(graph, mockLLMClient);
    expect(results.size).toBe(0);
  });
});

// Group 3 — buildActivityCatalog: catalog from sample-app

describe('buildActivityCatalog — sample-app integration', () => {
  let graph: Graph;

  beforeAll(() => {
    const files = walkRepo(SAMPLE_APP);
    graph = tagGraph(buildGraph(files, [mernRule]));
  });

  it('returns a non-empty catalog', async () => {
    const catalog = await buildActivityCatalog(graph, mockLLMClient);
    expect(Object.keys(catalog).length).toBeGreaterThan(0);
  });

  it('catalog has an entry for activity:validation', async () => {
    const catalog = await buildActivityCatalog(graph, mockLLMClient);
    expect(catalog['activity:validation']).toBeDefined();
  });

  it('each catalog entry has canonicalName, aliases, and evidence', async () => {
    const catalog = await buildActivityCatalog(graph, mockLLMClient);
    for (const entry of Object.values(catalog)) {
      expect(typeof entry.canonicalName).toBe('string');
      expect(Array.isArray(entry.aliases)).toBe(true);
      expect(Array.isArray(entry.evidence)).toBe(true);
    }
  });

  it('evidence contains the node ID where the activity was detected', async () => {
    const catalog = await buildActivityCatalog(graph, mockLLMClient);
    const validationEntry = catalog['activity:validation'];
    expect(validationEntry).toBeDefined();
    expect(validationEntry.evidence).toContain('fn:register');
  });

  it('activity:logging has evidence from both fn:register and sink:app.log', async () => {
    const catalog = await buildActivityCatalog(graph, mockLLMClient);
    const loggingEntry = catalog['activity:logging'];
    expect(loggingEntry).toBeDefined();
    expect(loggingEntry.evidence).toContain('fn:register');
    expect(loggingEntry.evidence).toContain('sink:app.log');
  });
});

// Group 4 — catalog operations: load, save, merge

describe('catalog operations — load, save, merge', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pii-catalog-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('loadCatalog returns empty object when file does not exist', () => {
    const catalog = loadCatalog(path.join(tmpDir, 'nope.json'));
    expect(catalog).toEqual({});
  });

  it('saveCatalog + loadCatalog round-trip preserves the catalog', () => {
    const filePath = path.join(tmpDir, 'activities.json');
    const original: ActivityCatalog = {
      'activity:validation': {
        canonicalName: 'Validation',
        aliases: ['email format check'],
        evidence: ['fn:register'],
      },
    };

    saveCatalog(original, filePath);
    const loaded = loadCatalog(filePath);

    expect(loaded).toEqual(original);
  });

  it('mergeCatalog adds new entries from incoming', () => {
    const existing: ActivityCatalog = {};
    const incoming: ActivityCatalog = {
      'activity:logging': {
        canonicalName: 'Logging',
        aliases: ['writes to app.log'],
        evidence: ['sink:app.log'],
      },
    };

    const merged = mergeCatalog(existing, incoming);
    expect(merged['activity:logging']).toBeDefined();
    expect(merged['activity:logging'].canonicalName).toBe('Logging');
  });

  it('mergeCatalog deduplicates aliases when the same entry appears twice', () => {
    const existing: ActivityCatalog = {
      'activity:validation': {
        canonicalName: 'Validation',
        aliases: ['email format check'],
        evidence: ['fn:register'],
      },
    };
    const incoming: ActivityCatalog = {
      'activity:validation': {
        canonicalName: 'Validation',
        aliases: ['email format check'], // duplicate
        evidence: ['fn:register'],
      },
    };

    const merged = mergeCatalog(existing, incoming);
    expect(merged['activity:validation'].aliases).toHaveLength(1);
  });

  it('mergeCatalog deduplicates evidence across runs', () => {
    const existing: ActivityCatalog = {
      'activity:logging': {
        canonicalName: 'Logging',
        aliases: ['writes to log'],
        evidence: ['fn:register'],
      },
    };
    const incoming: ActivityCatalog = {
      'activity:logging': {
        canonicalName: 'Logging',
        aliases: ['writes to log'],
        evidence: ['fn:register'], // same node, second run
      },
    };

    const merged = mergeCatalog(existing, incoming);
    expect(merged['activity:logging'].evidence).toHaveLength(1);
  });

  it('runLLMLayer with mock client produces a catalog without calling real API', async () => {
    const files = walkRepo(SAMPLE_APP);
    const graph = tagGraph(buildGraph(files, [mernRule]));
    const catalog = await runLLMLayer(graph, {}, mockLLMClient);
    expect(Object.keys(catalog).length).toBeGreaterThan(0);
  });
});
