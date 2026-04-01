# PII Scanner

A generic static code analysis framework that scans a codebase and maps how personal user data (PII) flows through it.

Point it at a repo and it tells you:

- where PII enters the system (React form inputs)
- what happens to it along the way (validation, formatting, logging)
- where it ends up (database, server logs)

Output is a JSON report with full source → processing → sink traces per PII type.

The core engine is rule-agnostic — PII scanning is the first use case. The same engine can be extended to security taint tracking, API lineage, or any other code analysis domain by swapping the rule plugin. Think ESLint or SonarQube but for data flow.

---

## Quick start

```bash
cd scanner
npm install

cp .env.example .env
# add ANTHROPIC_API_KEY=your_key_here to .env

npm start     # runs scanner against sample-app/
npm test      # runs all tests
```

Output is written to `scanner/output/report.json`.

To run without a Claude API key:

```bash
SKIP_LLM=true npm start
```

---

## Project structure

```
pii_scanner/
├── sample-app/          ← fake MERN app used as scan target
│   ├── frontend/        ← React form (SOURCE)
│   └── backend/         ← Express routes, Mongoose model, logger
└── scanner/
    └── src/
        ├── extractor/   ← file walker
        ├── graph/       ← graph engine
        ├── pii/         ← PII detection rules
        ├── llm/         ← Claude API client
        ├── output/      ← report generator
        └── utils/       ← shared helpers
```

---

## Docs

**[ARCHITECTURE.md](./ARCHITECTURE.md)**
How the system works internally. Covers module responsibilities, graph schema, node and edge model, algorithms used (BFS, adjacency list, HashMap), determinism strategy, incremental re-run strategy, extensibility design, and known tradeoffs. Start here to understand the system.

**[DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md)**
How to work with the scanner day to day. Covers adding a new PII type, adding a new source or sink rule, extending the scanner for a new analysis domain, writing tests for new rules, and how to debug when results look wrong.

**[DEV_PHASED_PLAN.md](./DEV_PHASED_PLAN.md)**
Step by step build plan used to implement the scanner. Each phase has a goal, deliverables, expected output, test checklist, and manual verification steps. Shows how the system was built incrementally.

---

## How it works (short version)

```
extractor → graph → pii → llm → output
```

1. **extractor** walks all `.js` `.jsx` `.ts` `.tsx` files and computes an MD5 hash per file
2. **graph** builds Source, CodeSnippet, and Sink nodes with edges between them
3. **pii** tags each node with PII types using regex and traces each type source → sink using BFS
4. **llm** classifies ambiguous fields and labels processing activities via Claude API
5. **output** writes the final JSON report

Full internals are in [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Sample output

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
    }
  ]
}
```

---

## Assumptions

- target codebase is JavaScript or TypeScript
- PII fields are identified by field name, not runtime value
- Mongoose is used for database modeling
- single React form is the PII entry point

---

## Supported

- React JSX form fields as PII source
- Express route handlers as processing nodes
- Mongoose model fields as database sink
- Logger utility calls as log sink
- PII types: email, phone, name, address, dob, ipAddress

## Not supported

- dynamic field names like `obj[fieldName]`
- multiple frontend sources
- non JS/TS languages
- Redis, Kafka, or queue-based sinks

---

## Tradeoffs and design notes

Tradeoffs, determinism strategy, reconciliation strategy, incremental strategy, and extensibility design are all documented in [ARCHITECTURE.md](./ARCHITECTURE.md).
