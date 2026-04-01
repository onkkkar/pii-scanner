# DEV Phased Plan — PII Scanner

This plan is written for a coding agent to implement phase by phase.

Each phase has a goal, exact deliverables, expected output, test checklist, and manual verification steps. Implement one phase at a time. Review and test before moving to the next.

---

## Phase 1 — Shared types and utils

### Goal

Define all shared TypeScript types and utility functions used across every other module. Nothing else can be built without this.

### Deliverables

- `src/utils/types.ts` — all shared interfaces and types
- `src/utils/hash.ts` — MD5 file hashing
- `src/utils/state.ts` — read and write state files (hashes, graph, catalog)
- `src/utils/file.ts` — safe file reading helper

### Types to define

```ts
// src/utils/types.ts

type NodeKind = 'source' | 'sink' | 'code_snippet';

type PiiType =
  | 'EMAIL' | 'PHONE' | 'NAME'
  | 'ADDRESS' | 'DOB' | 'IP_ADDRESS';

type ProcessingActivity =
  | 'validation' | 'transformation'
  | 'logging' | 'persistence' | 'enrichment';

type EdgeKind = 'data_flow' | 'calls' | 'writes' | 'imports';

interface ScannedFile {
  filePath: string;
  content: string;
  hash: string;
  language: 'js' | 'jsx' | 'ts' | 'tsx';
}

interface Node {
  id: string;
  kind: NodeKind;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  piiTypes: PiiType[];
  processingActivities: ProcessingActivity[];
  raw: string;
  metadata: Record<string, unknown>;
}

interface Edge {
  from: string;
  to: string;
  kind: EdgeKind;
  piiTypes: PiiType[];
}

interface Graph {
  nodes: Map<string, Node>;
  edges: Edge[];
  adjacency: Map<string, string[]>;
}

interface ActivityCatalog {
  [canonicalId: string]: {
    canonicalName: string;
    aliases: string[];
    evidence: string[];
  }
}

interface ScanState {
  hashes: Record<string, string>;       // filePath → MD5 hash
  graphFragments: Record<string, unknown>; // filePath → graph fragment
  activities: ActivityCatalog;
}
```

### Tests

- hash of same content always returns same value
- hash of different content returns different value
- state file write then read returns same object
- file read returns correct content
- file read on missing file throws clear error

### Manual verification

- run `npm test` — all utils tests pass
- check `src/utils/` has 4 files

### Commit
```
feat: shared types and utils
```

---

## Phase 2 — File walker (extractor)

### Goal

Walk all files in the target repo, filter by extension, read content, compute hash.

### Deliverables

- `src/extractor/walker.ts` — recursive file walker
- `src/extractor/index.ts` — exports `walkRepo(repoPath: string): ScannedFile[]`
- `src/extractor/walker.test.ts` — tests

### Expected output

```ts
[
  {
    filePath: 'sample-app/frontend/RegisterForm.jsx',
    content: '...raw content...',
    hash: 'abc123',
    language: 'jsx'
  },
  {
    filePath: 'sample-app/backend/userRoutes.js',
    content: '...raw content...',
    hash: 'def456',
    language: 'js'
  },
  {
    filePath: 'sample-app/backend/userModel.js',
    content: '...raw content...',
    hash: 'ghi789',
    language: 'js'
  },
  {
    filePath: 'sample-app/backend/logger.js',
    content: '...raw content...',
    hash: 'jkl012',
    language: 'js'
  }
]
```

### Tests

- walks nested folders and returns files from all depths
- filters out non JS/TS files (e.g. `.json`, `.md`, `.log`)
- returns correct file count for sample-app (exactly 4 files)
- computes consistent hash — same file always returns same hash
- different file content returns different hash
- throws clear error if repo path does not exist

### Manual verification

- run walker on `../sample-app`
- print result and confirm 4 files returned
- confirm each file has non-empty content and hash

### Commit
```
feat: file walker
```

---

## Phase 3 — Graph builder

### Goal

Take scanned files and build a graph of Source, CodeSnippet, and Sink nodes with edges between them. The graph engine has zero PII knowledge — it only builds structure.

### Deliverables

- `src/graph/types.ts` — AnalysisRule interface
- `src/graph/builder.ts` — builds graph from scanned files + rules
- `src/graph/rules.ts` — default source/sink detection rules for MERN stack
- `src/graph/traversal.ts` — BFS and DFS traversal functions
- `src/graph/index.ts` — exports `buildGraph(files, rules): Graph`
- `src/graph/builder.test.ts` — tests

### AnalysisRule interface

```ts
interface AnalysisRule {
  name: string;
  isSource:   (file: ScannedFile) => boolean;
  isSink:     (file: ScannedFile) => boolean;
  tagNode:    (node: Node, file: ScannedFile) => Node;
  buildEdges: (nodes: Node[], files: ScannedFile[]) => Edge[];
}
```

### Default rules for MERN stack

```ts
// src/graph/rules.ts

isSource: file contains JSX form with input fields
  → detect: file.content includes '<form' or '<input'
  → language is jsx or tsx

isSink (database): file contains Mongoose schema
  → detect: file.content includes 'mongoose.Schema'

isSink (logs): file contains appendFileSync or console log writes
  → detect: file.content includes 'appendFileSync' or 'fs.write'

isCodeSnippet: file contains Express route handler
  → detect: file.content includes 'router.' or 'app.post' or 'app.get'
```

### Expected graph for sample-app

```ts
nodes: {
  'source:RegisterForm'   → kind: source,       file: RegisterForm.jsx
  'fn:register'           → kind: code_snippet,  file: userRoutes.js
  'sink:users'            → kind: sink,          file: userModel.js
  'sink:app.log'          → kind: sink,          file: logger.js
}

edges: [
  { from: 'source:RegisterForm', to: 'fn:register',  kind: 'data_flow' }
  { from: 'fn:register',         to: 'sink:users',   kind: 'writes'    }
  { from: 'fn:register',         to: 'sink:app.log', kind: 'writes'    }
]

adjacency: {
  'source:RegisterForm' → ['fn:register']
  'fn:register'         → ['sink:users', 'sink:app.log']
}
```

### Tests

- source node created for RegisterForm.jsx
- code snippet node created for userRoutes.js
- sink node created for userModel.js
- sink node created for logger.js
- edges connect source → route → sinks correctly
- adjacency list matches edges
- BFS from source node visits all reachable nodes
- BFS returns nodes in correct order

### Manual verification

- run graph builder on sample-app files
- print graph and confirm 4 nodes and 3 edges
- print adjacency list and confirm structure matches expected

### Commit
```
feat: graph builder
```

---

## Phase 4 — PII detector

### Goal

Scan each node for PII field names using regex. Tag matched nodes. Trace each PII type from source to sink using BFS.

### Deliverables

- `src/pii/patterns.ts` — PII regex patterns per type
- `src/pii/tagger.ts` — scans nodes and tags with PII types
- `src/pii/tracer.ts` — BFS trace per PII type from source → sink
- `src/pii/index.ts` — exports `detectPii(graph): PiiTrace[]`
- `src/pii/tagger.test.ts` — tests

### PII patterns

```ts
const PII_PATTERNS: Record<PiiType, RegExp[]> = {
  EMAIL:      [/\bemail\b/i],
  PHONE:      [/\bphone\b/i, /\bphoneNumber\b/i],
  NAME:       [/\bname\b/i, /\bfullName\b/i, /\bfirstName\b/i],
  ADDRESS:    [/\baddress\b/i],
  DOB:        [/\bdob\b/i, /\bdateOfBirth\b/i],
  IP_ADDRESS: [/\bipAddress\b/i, /\bip\b/i],
};
```

### Expected output

```ts
[
  {
    piiType: 'EMAIL',
    trace: [
      'source:RegisterForm',
      'fn:register',
      'sink:users',
      'sink:app.log'
    ]
  },
  {
    piiType: 'PHONE',
    trace: [
      'source:RegisterForm',
      'fn:register',
      'sink:users'
    ]
  },
  {
    piiType: 'NAME',
    trace: [
      'source:RegisterForm',
      'fn:register',
      'sink:users'
    ]
  }
]
```

### Tests

- EMAIL pattern matches `email`, `Email`, `EMAIL` — case insensitive
- PHONE pattern matches `phone`, `phoneNumber`
- NAME pattern matches `name`, `fullName`, `firstName`
- DOB pattern matches `dob`, `dateOfBirth`
- IP_ADDRESS pattern matches `ipAddress`
- `createdAt` is not tagged as any PII type
- `status` is not tagged as any PII type
- EMAIL trace path is correct — passes through all 4 nodes
- PHONE trace path is correct — passes through 3 nodes, not log sink
- nodes with no PII fields are not tagged

### Manual verification

- run PII detector on sample-app graph
- print traces and confirm EMAIL goes through all 4 nodes
- confirm PHONE does not appear in log sink trace
- confirm no false positives on non-PII fields

### Commit
```
feat: PII detection and tracing
```

---

## Phase 5 — LLM layer

### Goal

Classify ambiguous field names and label processing activities via Claude API. Normalize all suggestions to a canonical catalog. Persist catalog for reuse across runs.

### Deliverables

- `src/llm/client.ts` — Claude API client + mock client for tests
- `src/llm/classifier.ts` — classifies ambiguous field names
- `src/llm/activities.ts` — suggests and normalizes processing activity labels
- `src/llm/catalog.ts` — reads and writes canonical activity catalog
- `src/llm/index.ts` — exports `runLLMLayer(graph, catalog): ActivityCatalog`
- `src/llm/classifier.test.ts` — tests using mock client

### Mock client for tests

```ts
// src/llm/client.ts
export const mockLLMClient = {
  classify: async (fieldName: string) => ({
    isPII: true,
    piiType: 'EMAIL' as PiiType,
    suggestedActivity: 'validation',
  }),
};
```

### Canonical activity catalog

```ts
// state/activities.json — persisted after each run
{
  "activity:validation": {
    "canonicalName": "Validation",
    "aliases": ["email format check", "input validation"],
    "evidence": ["fn:userRoutes.register"]
  },
  "activity:transformation": {
    "canonicalName": "Transformation",
    "aliases": ["phone formatting", "strip non-numeric"],
    "evidence": ["fn:userRoutes.register"]
  },
  "activity:logging": {
    "canonicalName": "Logging",
    "aliases": ["user registration log"],
    "evidence": ["sink:app.log"]
  }
}
```

### Tests

- mock client returns correct classification
- ambiguous field `uid` is classified without error
- repeated runs produce same catalog — no new labels added
- deduplication works — same label suggested twice adds only one entry
- catalog is saved to disk after run
- catalog is loaded from disk on next run
- real Claude API is never called in tests

### Manual verification

- run LLM layer with real API key
- check `state/activities.json` is created
- run again — confirm no new labels added to catalog
- check aliases are merged not duplicated

### Commit
```
feat: LLM layer and activity catalog
```

---

## Phase 6 — Output generator

### Goal

Take final graph, PII traces, and activity catalog and produce a JSON report.

### Deliverables

- `src/output/report.ts` — assembles report from graph + traces + catalog
- `src/output/writer.ts` — writes report to output/report.json
- `src/output/index.ts` — exports `generateReport(graph, traces, catalog): Report`
- `src/output/report.test.ts` — tests

### Expected report shape

```json
{
  "scanId": "scan-20240101-001",
  "repoPath": "../sample-app",
  "sensitiveDataTypes": ["EMAIL", "PHONE", "NAME", "ADDRESS", "DOB"],
  "traces": [
    {
      "piiType": "EMAIL",
      "path": [
        "source:RegisterForm",
        "fn:userRoutes.register",
        "sink:users.email",
        "sink:app.log"
      ]
    }
  ],
  "processingActivities": [
    {
      "canonicalId": "activity:validation",
      "canonicalName": "Validation",
      "evidence": ["fn:userRoutes.register"],
      "aliases": ["email format check", "input validation"]
    }
  ]
}
```

### Tests

- report contains correct scanId format
- report contains all PII types found in traces
- traces match expected paths from PII detector
- processing activities match catalog
- report is written to output/report.json
- report written is valid JSON and can be parsed back

### Manual verification

- run full pipeline on sample-app
- open output/report.json
- confirm all 5 PII types appear in sensitiveDataTypes
- confirm EMAIL trace passes through all 4 nodes
- confirm processing activities have correct canonical names

### Commit
```
feat: output generator
```

---

## Phase 7 — Incremental re-runs

### Goal

Persist file hashes after each scan. On re-runs skip unchanged files and reuse cached graph fragments.

### Deliverables

- `src/utils/incremental.ts` — compare current hashes to stored hashes
- update `src/extractor/walker.ts` — load prior hashes, skip unchanged files
- update `src/graph/builder.ts` — load cached fragments for unchanged files
- `src/utils/incremental.test.ts` — tests

### Behavior

```
First run:
  - scan all files
  - save hashes to state/hashes.json
  - save graph fragments to state/graph.json

Re-run, no changes:
  - load prior hashes
  - current hash matches stored hash for all files
  - skip all files — reuse entire cached graph
  - output same report instantly

Re-run, userRoutes.js changed:
  - load prior hashes
  - userRoutes.js hash differs — rescan only this file
  - rebuild only userRoutes.js graph fragment
  - merge with cached fragments from other 3 files
```

### Tests

- unchanged files are skipped on re-run
- changed file is rescanned on re-run
- output after re-run on unchanged repo is identical to first run
- state/hashes.json is updated after each run
- missing state file triggers full scan

### Manual verification

- run scanner — note all 4 files scanned
- run again — confirm 0 files rescanned
- edit userRoutes.js — run again — confirm only 1 file rescanned
- confirm output report is identical between run 1 and run 2

### Commit
```
feat: incremental re-runs
```

---

## Phase 8 — Wire everything together

### Goal

Connect all modules in `src/index.ts` so `npm start` runs the full pipeline end to end.

### Deliverables

- `src/index.ts` — full pipeline wired together
- `src/scanner.ts` — `createScanner()` public API
- `.env.example` — example env file with ANTHROPIC_API_KEY placeholder

### Pipeline

```ts
// src/index.ts

const files = await walkRepo(repoPath);
const graph = buildGraph(files, [piiRules]);
const traces = detectPii(graph);
const catalog = await runLLMLayer(graph, loadCatalog());
const report = generateReport(graph, traces, catalog);
await writeReport(report);
```

### Tests

- full pipeline runs end to end on sample-app without errors
- report is written to output/report.json
- running twice produces identical output

### Manual verification

- run `npm start`
- confirm no errors
- open output/report.json
- confirm report is complete and correct

### Commit
```
feat: wire full pipeline
```

---

## Phase 9 — Final cleanup

### Goal

Clean up, make sure all tests pass, update docs with anything that changed during implementation.

### Tasks

- run `npm test` — all tests pass
- delete any `.gitkeep` files that now have real files next to them
- update DEVELOPER_GUIDE.md with real code examples from implementation
- add sample-output.json to repo using real scanner output
- confirm README setup instructions work end to end

### Commit
```
chore: final cleanup
```
