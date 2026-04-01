# PII Scanner Architecture

## Goal

Build a **generic static code analysis framework** that scans a codebase and maps how personal user data (PII) flows through it — from where it enters, through what processes it, to where it ends up.

The first use case is PII scanning. But the core engine is rule-agnostic. Think ESLint or SonarQube — a generic engine with pluggable domain rules on top. Swapping the rules changes the analysis domain without touching the engine.

---

## Scope and assumptions

This is a **static analysis tool** for JavaScript and TypeScript codebases.

PII is tracked based on:

- field names in React forms (`email`, `phone`, `name`, `address`, `dob`)
- field names in Mongoose model definitions
- variable destructuring in Express route handlers
- function call patterns to logger utilities and ORM methods

Supported PII types:

- EMAIL
- PHONE
- NAME
- ADDRESS
- DOB
- IP_ADDRESS

One source:

- React frontend form (`RegisterForm.jsx`)

Two sinks:

- MongoDB via Mongoose (`userModel.js`)
- Server logs via logger utility (`logger.js`)

---

## High-level architecture

The system has five main parts:

1. **Extractor**
   - walks all files in the target repo
   - reads raw file content
   - computes MD5 hash per file for incremental runs

2. **Graph Builder**
   - takes extractor output
   - builds nodes (Source, CodeSnippet, Sink) and edges (data_flow, calls, writes)
   - stores graph as adjacency list
   - has zero PII knowledge — purely structural

3. **PII Detector**
   - pluggable rule layer on top of the graph
   - matches field names against PII patterns using regex
   - tags each node with PII types
   - traces each PII type from source to sink using BFS

4. **LLM Layer**
   - classifies ambiguous field names that regex cannot confidently tag
   - suggests processing activity labels (validation, transformation, logging etc.)
   - normalizes all suggestions to a canonical activity catalog
   - never drives core logic — hints only

5. **Output Generator**
   - takes final graph, traces, and activity catalog
   - produces a JSON report
   - saves to `output/report.json`

---

## Core principles

### 1. Deterministic first

The core pipeline — file walking, graph building, PII detection, tracing — must produce the same output for the same input every time. LLM is never in this path.

### 2. Rules are plugins

The graph engine has zero knowledge of PII. What counts as a source, sink, or tag is injected as a rule plugin. This is what makes the engine generic.

### 3. LLM suggestions, not LLM decisions

LLM output is always treated as a hint. Every LLM suggestion is normalized through a deterministic canonical catalog before it enters the report. LLM never makes the final call.

### 4. Incremental by default

Every run saves file hashes and graph state. Re-runs reuse prior state for unchanged files. Full rescans are the exception.

### 5. Fail loudly

If a file cannot be read or a graph fragment cannot be built, the scanner throws a clear error. It never silently skips files.

### 6. Separation of concerns

Each module has exactly one job. Extractor does not build graphs. Graph builder does not detect PII. PII detector does not call LLM. Each module is independently testable.

---

## Data flow

```
sample-app/ (target repo)
     ↓
Extractor
  - walks all .js .jsx .ts .tsx files
  - reads content, computes MD5 hash
     ↓
Graph Builder
  - creates Source node for RegisterForm.jsx
  - creates CodeSnippet node for userRoutes.js
  - creates Sink nodes for userModel.js and logger.js
  - builds edges: data_flow, calls, writes
     ↓
PII Detector
  - scans each node for email, phone, name, address, dob, ipAddress
  - tags nodes with PII types
  - runs BFS from source node to find all sink paths per PII type
     ↓
LLM Layer
  - classifies ambiguous fields
  - labels processing activities
  - deduplicates labels via canonical catalog
     ↓
Output Generator
  - assembles final JSON report
  - writes to output/report.json
```

---

## Module layout

```
pii_scanner/
├── sample-app/
│   ├── frontend/
│   │   └── RegisterForm.jsx      ← SOURCE: React form with PII fields
│   └── backend/
│       ├── userRoutes.js         ← PROCESSING: validates, formats, saves, logs
│       ├── userModel.js          ← SINK: Mongoose schema, writes to MongoDB
│       └── logger.js             ← SINK: writes to app.log on disk
└── scanner/
    └── src/
        ├── extractor/            ← file walker, hash computation
        ├── graph/                ← graph engine, node/edge model
        ├── pii/                  ← PII rule plugin, BFS tracer
        ├── llm/                  ← Claude API client, activity catalog
        ├── output/               ← JSON report generator
        └── utils/                ← shared types, hashing, state persistence
```

---

## Extractor

Responsibilities:

- recursively walk all files under the given repo path
- filter by extension: `.js`, `.jsx`, `.ts`, `.tsx`
- read raw file content as a string
- compute MD5 hash of content
- return a flat list of scanned file objects

```ts
interface ScannedFile {
  filePath: string;   // relative path from repo root
  content: string;    // raw file content as string
  hash: string;       // MD5 of content — used for incremental runs
  language: 'js' | 'jsx' | 'ts' | 'tsx';
}
```

Why MD5:

- fast to compute
- not used for security — only for change detection
- same file always produces same hash

---

## Graph Builder

Responsibilities:

- take list of ScannedFile objects from extractor
- classify each file into a node type using pluggable rules:
  - file contains JSX form fields → Source node
  - file contains Express route handler → CodeSnippet node
  - file contains Mongoose schema definition → Sink node (database)
  - file contains logger.appendFileSync or similar → Sink node (logs)
- build edges between nodes by scanning for:
  - `require('./userModel')` → imports edge
  - `User.create(...)` → writes edge to DB sink
  - `logger.info(...)` → writes edge to log sink
- store graph as adjacency list

```ts
interface Graph {
  nodes: Map<string, Node>;
  edges: Edge[];
  adjacency: Map<string, string[]>; // node id → list of neighbor node ids
}
```

Why adjacency list and not adjacency matrix:

- codebase graphs are sparse — most files do not directly call most other files
- adjacency list uses O(V+E) space vs O(V²) for a matrix
- BFS and DFS on an adjacency list run in O(V+E) time

---

## Node and edge model

```ts
type NodeKind = 'source' | 'sink' | 'code_snippet';

type PiiType =
  | 'EMAIL' | 'PHONE' | 'NAME'
  | 'ADDRESS' | 'DOB' | 'IP_ADDRESS';

type ProcessingActivity =
  | 'validation' | 'transformation'
  | 'logging' | 'persistence' | 'enrichment';

interface Node {
  id: string;                                 // e.g. "fn:userRoutes.register"
  kind: NodeKind;
  filePath: string;                           // e.g. "backend/userRoutes.js"
  lineStart: number;
  lineEnd: number;
  piiTypes: PiiType[];                        // tagged after PII detection
  processingActivities: ProcessingActivity[]; // tagged after LLM layer
  raw: string;                               // raw code of this node
  metadata: Record<string, unknown>;          // open for future rule plugins
}

type EdgeKind = 'data_flow' | 'calls' | 'writes' | 'imports';

interface Edge {
  from: string;
  to: string;
  kind: EdgeKind;
  piiTypes: PiiType[]; // which PII types flow on this edge
}
```

---

## PII Detector

Responsibilities:

- define regex patterns per PII type
- scan each node's raw code for matches
- tag matched nodes with PII types
- run BFS from each source node to find all paths to sink nodes
- return one trace path per PII type

Patterns used:

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

Why regex and not full AST parsing:

- simpler and faster for field name detection
- no language-specific parser required
- predictable and testable output
- known tradeoff: misses dynamic field names like `obj[fieldName]`

BFS trace example for EMAIL:

```
source:RegisterForm
  → fn:userRoutes.register   (data_flow edge — email in req.body)
    → sink:users.email        (writes edge — User.create({ email }))
    → sink:app.log            (writes edge — logger.info(`...${email}`))
```

Why BFS and not DFS:

- BFS explores neighbors level by level — finds the most direct path first
- DFS can go deep into unrelated branches before reaching the sink
- BFS trace paths are shorter and easier to read in the report

```
BFS time complexity:  O(V + E)
BFS space complexity: O(V)
```

---

## LLM Layer

Responsibilities:

- receive a list of ambiguous field names from the PII detector
- call Claude API to classify each as PII or not, and suggest a PII type
- receive processing activity candidates from the graph builder
- ask Claude to suggest a canonical activity label
- normalize all suggestions against a persisted canonical catalog
- save updated catalog to `state/activities.json`
- on re-runs, load catalog first and skip LLM calls for already-classified items

```ts
// shape of the persisted catalog
interface ActivityCatalog {
  [canonicalId: string]: {
    canonicalName: string;  // e.g. "Validation"
    aliases: string[];      // e.g. ["email format check", "input validation"]
    evidence: string[];     // node ids where this activity was detected
  }
}
```

Why LLM is isolated here and not in the core:

- LLMs are non-deterministic — the same prompt can return different output on different runs
- putting LLM in the core would make the entire pipeline non-deterministic
- isolating it here means the catalog absorbs the non-determinism
- once a label is in the catalog it stays canonical — repeated runs produce the same output

All LLM calls are mockable:

```ts
// used in tests — real Claude API never called
const mockLLM = {
  classify: async (fieldName: string) => ({
    isPII: true,
    piiType: 'EMAIL' as PiiType,
    suggestedActivity: 'validation',
  }),
};
```

---

## Output Generator

Responsibilities:

- take the final graph, trace paths, and activity catalog
- assemble a JSON report
- write to `output/report.json`

Example output shape:

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
    },
    {
      "piiType": "PHONE",
      "path": [
        "source:RegisterForm",
        "fn:userRoutes.register",
        "sink:users.phone"
      ]
    }
  ],
  "processingActivities": [
    {
      "canonicalId": "activity:validation",
      "canonicalName": "Validation",
      "evidence": ["fn:userRoutes.register"],
      "aliases": ["email format check", "input validation"]
    },
    {
      "canonicalId": "activity:transformation",
      "canonicalName": "Transformation",
      "evidence": ["fn:userRoutes.register"],
      "aliases": ["phone formatting", "strip non-numeric"]
    },
    {
      "canonicalId": "activity:logging",
      "canonicalName": "Logging",
      "evidence": ["sink:app.log"],
      "aliases": ["user registration log", "info log"]
    }
  ]
}
```

---

## Determinism strategy

The most important requirement from the spec is determinism.

Every layer of the pipeline and whether it is deterministic:

- File walker — yes. Pure function. Same files always produce same output.
- Graph builder — yes. Rule-based pattern matching. No randomness.
- PII detector — yes. Regex matching. Deterministic by definition.
- LLM layer — no. Non-deterministic by nature.
- Activity catalog — yes. LLM output is normalized and persisted here.
- Final report — yes. Built entirely from the deterministic layers above.

How we contain the non-determinism in the LLM layer:

1. LLM suggestions never go directly into the report
2. Every suggestion is looked up in the canonical catalog first
3. If found in catalog — use the canonical name, skip LLM call
4. If not found — call LLM, normalize the response, add to catalog
5. Catalog is persisted — second run reuses first run's catalog entirely
6. Same input always produces same final report

---

## Incremental re-run strategy

Goal: avoid full rescan when only a few files have changed.

Run 1:

- scan all files
- build full graph
- run PII detection and LLM layer
- save file hashes to `state/hashes.json`
- save graph fragments per file to `state/graph.json`
- save activity catalog to `state/activities.json`

Run 2 with no changes:

- load prior hashes
- hash current files
- all hashes match — reuse entire cached graph
- skip all LLM calls — catalog already complete
- output same report instantly

Run 2 with `userRoutes.js` changed:

- load prior hashes
- hash current files
- `userRoutes.js` hash differs — rescan only this file
- rebuild only the graph fragment for this file
- merge new fragment with cached fragments from other files
- re-run LLM only for new or changed nodes in this file

HashMap used for hash lookup:

```
filePath → MD5 hash
Lookup:   O(1) per file
```

---

## Extensibility design

To add a new analysis domain, implement the rule plugin interface:

```ts
interface AnalysisRule {
  name: string;
  isSource:   (file: ScannedFile) => boolean;
  isSink:     (file: ScannedFile) => boolean;
  tagNode:    (node: Node, file: ScannedFile) => Node;
  buildEdges: (nodes: Node[], files: ScannedFile[]) => Edge[];
}
```

Example — adding security taint tracking:

1. create `src/taint/taintRules.ts` implementing `AnalysisRule`
2. set `isSource` to detect HTTP body, query params, user input
3. set `isSink` to detect `eval()`, `exec()`, `innerHTML` calls
4. set `tagNode` to tag nodes with `TAINTED` or `SANITIZED`
5. register in `graph/ruleRegistry.ts`
6. core graph engine is untouched

Other domains that fit the same plugin model:

- API lineage — source is REST handler, sink is downstream HTTP call
- dependency tracing — source is `import`, sink is where the export is used
- code change impact — source is modified file, sink is files that depend on it

---

## Public API

How a developer runs the scanner:

```ts
import { createScanner } from './scanner';
import { piiRules } from './pii/piiRules';

const scanner = createScanner({
  repoPath: '../sample-app',
  rules: [piiRules],
  stateDir: './state',
  outputDir: './output',
});

const report = await scanner.scan();
```

With optional LLM client:

```ts
import { claudeClient } from './llm/claudeClient';

const scanner = createScanner({
  repoPath: '../sample-app',
  rules: [piiRules],
  llm: claudeClient,       // omit this for offline runs or tests
  stateDir: './state',
  outputDir: './output',
});
```

With user supplied overrides (planned future extension):

```ts
const scanner = createScanner({
  repoPath: '../sample-app',
  rules: [piiRules],
  // skip auto-detection — user tells us which columns are PII
  knownPiiFields: ['users.email', 'users.phone'],
  // skip LLM labeling — user supplies activity list directly
  knownActivities: ['validation', 'logging'],
});
```

---

## Observability and debugging

Enable debug mode:

```bash
SCANNER_DEBUG=1 npm start
```

In debug mode the scanner logs one block per file:

```ts
{
  file: 'backend/userRoutes.js',
  cacheHit: false,
  nodesExtracted: 3,
  edgesBuilt: 2,
  piiTypesFound: ['EMAIL', 'PHONE'],
  activitiesDetected: ['validation', 'transformation'],
  llmCalled: true,
}
```

Common problems and what to check:

- file not appearing in graph → check extension filter in extractor
- node missing from graph → check `isSource` / `isSink` patterns in rules
- PII type not detected → check regex in `PII_PATTERNS`
- wrong activity label → open `state/activities.json` and check catalog
- re-run rescanning all files → check that `state/hashes.json` exists and is not empty
- LLM producing different labels each run → check catalog normalization logic

---

## Testing strategy

Unit tests — test each module in isolation:

- extractor — file walking, hash computation, extension filtering
- graph builder — node classification, edge construction, adjacency list correctness
- PII detector — regex matching per PII type, BFS trace correctness
- LLM layer — always use mock client, never real API in tests
- output generator — JSON shape matches expected schema
- utils — hashing consistency, state file read and write

Integration tests — test full pipeline on sample-app:

- all 4 files discovered
- correct nodes and edges produced
- EMAIL traced through all 4 nodes (form → route → DB → log)
- PHONE traced through 3 nodes (form → route → DB, not in log)
- processing activities correctly labeled

Stability tests — repeated runs on unchanged repo:

- run 1 output is identical to run 2 output
- run 2 rescans zero files

False positive tests — PII detection accuracy:

- `createdAt` → should not be tagged
- `status` → should not be tagged
- `email` → must be tagged EMAIL
- `phone` → must be tagged PHONE

---

## Limitations and known gaps

- dynamic field names like `obj[fieldName]` are not detected — regex cannot resolve runtime values
- only one source supported — single React form
- only JS and TS files are scanned — no Java, Go, Python, Rust
- only two sink types — MongoDB and file logger
- no middleware chain tracing — req/res passing through multiple handlers is not tracked
- no full AST parsing — regex is used for speed and simplicity

---

## Future extensions

From the spec bonus requirements:

- user supplied list of processing activities at scan time — skip LLM labeling entirely
- user supplied list of PII `<table>.<col>` — skip auto-detection entirely
- additional sink types: Redis, Kafka, S3
- additional source types: Android app, public REST API, CLI arguments
- more language support: Java, Go, Rust, Python — requires one parser plugin per language

---

## Final recommendation

The strongest version of this architecture is:

- generic graph engine with zero PII knowledge
- pluggable rule interface so any analysis domain can be added without touching the engine
- fully deterministic core — file walk, graph build, PII tag, BFS trace
- LLM isolated at the classification layer only — never in core logic
- canonical activity catalog that absorbs LLM non-determinism and persists it
- hash-based incremental runs that skip unchanged files
- clear debug output so failures are easy to diagnose
- every module independently unit testable with no external dependencies

This gives a scanner that is fast, predictable, and extensible — and can grow beyond PII scanning without a rewrite.
