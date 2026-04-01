# Developer Guide — PII Scanner

This guide explains how to work with the PII scanner in day to day development.

It focuses on:

- how to run the scanner
- how to add a new PII type
- how to add a new source or sink rule
- how to extend the scanner for a new analysis domain
- when to skip the LLM layer
- known limitations to keep in mind
- debug checklist when results look wrong
- test checklist for new rules

It does not cover internal graph engine implementation in depth. See [ARCHITECTURE.md](./ARCHITECTURE.md) for that.

---

## Default rule: always use createScanner()

Use this in normal usage:

```ts
import { createScanner } from './src/scanner';
import { piiRules } from './src/pii/rules';

const scanner = createScanner({
  repoPath: '../sample-app',
  rules: [piiRules],
  stateDir: './state',
  outputDir: './output',
});

await scanner.scan();
```

Avoid calling individual modules directly unless you are testing them in isolation. The `createScanner()` API wires everything together correctly.

---

## Typical usage

### Run against sample app

```bash
npm start
```

### Run with debug logging

```bash
SCANNER_DEBUG=1 npm start
```

### Run without LLM (offline mode)

```bash
SKIP_LLM=true npm start
```

Use this when you do not have an API key or want to test the deterministic core in isolation.

### Run tests

```bash
npm test
```

All tests use a mock LLM client. Real Claude API is never called in tests.

---

## Think in two layers

Every change to the scanner should be evaluated at two levels:

1. **Deterministic layer** — file walking, graph building, PII detection, tracing. This must always produce the same output for the same input.

2. **LLM layer** — ambiguous field classification, activity labeling. This is a hint layer only. It never drives graph logic.

If what you are adding touches the deterministic layer, make sure it has a unit test that does not depend on the LLM.

---

## Adding a new PII type

Suppose you want to add `SSN` (social security number).

### Step 1 — add the type

In `src/utils/types.ts` add `SSN` to the `PiiType` union:

```ts
type PiiType =
  | 'EMAIL' | 'PHONE' | 'NAME'
  | 'ADDRESS' | 'DOB' | 'IP_ADDRESS'
  | 'SSN'; // add here
```

### Step 2 — add the regex pattern

In `src/pii/patterns.ts` add a pattern for `SSN`:

```ts
const PII_PATTERNS: Record<PiiType, RegExp[]> = {
  // existing patterns ...
  SSN: [/\bssn\b/i, /\bsocialSecurity\b/i, /\bsocialSecurityNumber\b/i],
};
```

### Step 3 — add to sample app (if needed for testing)

If you want to verify detection end to end, add an `ssn` field to `userModel.js` in the sample app:

```js
ssn: { type: String }, // social security number — PII
```

### Step 4 — add tests

In `src/pii/tagger.test.ts` add:

```ts
it('tags ssn field as SSN', () => {
  // test that a node with 'ssn' in raw content gets tagged SSN
});

it('does not tag unrelated fields as SSN', () => {
  // test that 'createdAt' is not tagged SSN
});
```

### Step 5 — verify end to end

Run the scanner and confirm `SSN` appears in `sensitiveDataTypes` in the report.

---

## Adding a new sink type

Suppose you want to add Redis as a sink.

### Step 1 — update graph rules

In `src/graph/rules.ts` add a Redis sink detection rule:

```ts
// detect Redis sink — file uses redis client set/get calls
isSink: (file: ScannedFile) => {
  return file.content.includes('redis.set') ||
         file.content.includes('client.set') ||
         file.content.includes('redisClient');
}
```

### Step 2 — add node id convention

Use a consistent node id pattern:

```ts
// sink node id for Redis
'sink:redis'
```

### Step 3 — add tests

```ts
it('creates sink node for Redis client file', () => {
  // test that a file with redis.set creates a Sink node
});
```

### Step 4 — verify

Run scanner on a codebase with a Redis client file and confirm a `sink:redis` node appears in the graph.

---

## Adding a new source type

Suppose you want to add a REST API endpoint as a source (public API receiving user data).

### Step 1 — update graph rules

In `src/graph/rules.ts` add a source detection rule:

```ts
// detect public API source — Express route that receives user data from external caller
isSource: (file: ScannedFile) => {
  return file.content.includes('req.body') &&
         file.content.includes('router.post');
}
```

### Step 2 — add node id convention

```ts
'source:publicApi'
```

### Step 3 — add tests and verify

Same pattern as adding a new sink.

---

## Extending for a new analysis domain

Suppose you want to add security taint tracking — find where user input reaches dangerous functions like `eval()` or `exec()`.

### Step 1 — add new tag types

In `src/utils/types.ts`:

```ts
type TaintType = 'TAINTED' | 'SANITIZED';
```

### Step 2 — create a new rule plugin

Create `src/taint/taintRules.ts` implementing `AnalysisRule`:

```ts
import { AnalysisRule } from '../graph/types';

export const taintRules: AnalysisRule = {
  name: 'taint',

  // source: any file that reads from req.body, req.query, req.params
  isSource: (file) =>
    file.content.includes('req.body') ||
    file.content.includes('req.query'),

  // sink: any file that calls eval, exec, or innerHTML
  isSink: (file) =>
    file.content.includes('eval(') ||
    file.content.includes('exec(') ||
    file.content.includes('innerHTML'),

  tagNode: (node, file) => {
    // tag node as TAINTED if it receives user input directly
    if (file.content.includes('req.body')) {
      node.metadata.taintType = 'TAINTED';
    }
    return node;
  },

  buildEdges: (nodes, files) => {
    // build edges based on taint flow — same pattern as PII rules
    return [];
  },
};
```

### Step 3 — register the rule

Pass it to `createScanner()`:

```ts
const scanner = createScanner({
  repoPath: '../sample-app',
  rules: [piiRules, taintRules], // add taintRules here
  stateDir: './state',
  outputDir: './output',
});
```

### Step 4 — add tests

```ts
it('creates source node for file reading req.body', () => { ... });
it('creates sink node for file calling eval()', () => { ... });
```

The core graph engine is untouched. Only the rule plugin is new.

---

## Reusable rule helper patterns

When writing rules, prefer small composable checks over large monolithic functions.

### Source detection helpers

```ts
const hasJSXForm    = (file: ScannedFile) => file.content.includes('<form');
const hasInputField = (file: ScannedFile) => file.content.includes('<input');
const isJSX         = (file: ScannedFile) => file.language === 'jsx' || file.language === 'tsx';
```

### Sink detection helpers

```ts
const hasMongoose   = (file: ScannedFile) => file.content.includes('mongoose.Schema');
const hasFileWrite  = (file: ScannedFile) => file.content.includes('appendFileSync');
const hasRedis      = (file: ScannedFile) => file.content.includes('redis.set');
```

### Edge detection helpers

```ts
const requiresFile  = (content: string, filePath: string) =>
  content.includes(`require('./${filePath}')`);
const callsCreate   = (content: string) => content.includes('.create(');
const callsLogger   = (content: string) => content.includes('logger.info') ||
                                            content.includes('logger.error');
```

---

## When to skip the LLM layer

Skip LLM when:

- running in CI or automated pipelines — use `SKIP_LLM=true`
- testing the deterministic core in isolation
- you do not have a Claude API key yet
- the activity catalog already covers all patterns in the codebase

```bash
SKIP_LLM=true npm start
```

When LLM is skipped:

- ambiguous field names are left unclassified
- processing activities are detected by deterministic patterns only
- canonical catalog is not updated
- report is still produced — just with fewer activity labels

---

## Known limitations developers should remember

1. dynamic field names like `obj[fieldName]` are not detected — regex cannot resolve runtime values
2. PII is detected by field name not by value — a field named `data` carrying an email is not caught
3. only JS and TS files are scanned — Java, Go, Python files are ignored
4. only one React form is supported as a source — multiple forms are not traced separately
5. LLM classification is non-deterministic by nature — the canonical catalog is what makes output stable, not the LLM itself
6. incremental re-runs work at file level — if a function inside a file changes, the whole file is rescanned

---

## Debug checklist when results look wrong

Check in this order:

1. is the file being picked up by the walker? Check extension filter in `src/extractor/walker.ts`
2. is the node being created? Check `isSource` / `isSink` patterns in `src/graph/rules.ts`
3. is the PII type being detected? Check regex in `src/pii/patterns.ts`
4. is the edge being built? Check `buildEdges` logic in `src/graph/rules.ts`
5. is the trace correct? Run BFS manually from the source node and print visited nodes
6. is the activity label wrong? Open `state/activities.json` and check canonical catalog entries
7. is the re-run rescanning everything? Check that `state/hashes.json` exists and is not empty

Enable debug mode for detailed per-file logs:

```bash
SCANNER_DEBUG=1 npm start
```

---

## Safe update pattern when rules change

When requirements change — for example a new field name is considered PII:

### Do this

- add the regex pattern to `src/pii/patterns.ts`
- add a unit test for the new pattern
- run `npm test` to confirm no regressions

### Avoid this

- hardcoding field names in multiple places across modules
- bypassing the pattern registry and adding checks directly in `tagger.ts`

The pattern registry in `src/pii/patterns.ts` is the single source of truth for what counts as PII. Keep it there.

---

## Test checklist for new rules

For each new source or sink rule, test:

- correct file is classified as source or sink
- unrelated file is not classified incorrectly
- node id follows the correct naming convention
- edges connect correctly to adjacent nodes
- BFS traversal from source reaches the new node

For each new PII type, test:

- all field name variants are matched
- case insensitive matching works
- non-PII fields are not matched (false positive check)
- trace path is correct from source to sink

---

## Final guideline

Treat `createScanner()` as the default entry point. When rules change, update:

- pattern or rule file
- tests

not the core graph engine or traversal logic. That is the main extensibility win of this architecture — rules are plugins, the engine stays stable.
