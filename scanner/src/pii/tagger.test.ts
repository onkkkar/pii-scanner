// Tests for PII detection and tracing.
// Group 1: detectPii unit tests against inline strings
// Group 2: detectActivities unit tests against inline strings
// Group 3: tagGraph integration — tags nodes in the sample-app graph
// Group 4: tracePii end-to-end — finds paths from source to sinks

import * as path from 'path';
import { walkRepo } from '../extractor/index';
import { buildGraph, mernRule } from '../graph/index';
import { Graph } from '../utils/types';
import { detectActivities, detectPii, tagGraph, tracePii } from './index';

const SAMPLE_APP = path.resolve(__dirname, '../../..', 'sample-app');

// Group 1 — detectPii: field name matching

describe('detectPii — field name matching', () => {
  it('matches EMAIL when the string contains "email"', () => {
    expect(detectPii('const email = req.body.email;')).toContain('EMAIL');
  });

  it('matches PHONE when the string contains "phone"', () => {
    expect(detectPii('phone: { type: String }')).toContain('PHONE');
  });

  it('matches NAME when the string contains "name"', () => {
    expect(detectPii('<input name="name" value={formData.name} />')).toContain('NAME');
  });

  it('matches DOB for both "dob" and "dateOfBirth"', () => {
    expect(detectPii('dob: { type: Date }')).toContain('DOB');
    expect(detectPii('const dateOfBirth = req.body.dateOfBirth;')).toContain('DOB');
  });

  it('matches IP_ADDRESS for "ipAddress" (camelCase)', () => {
    expect(detectPii('ipAddress: { type: String }')).toContain('IP_ADDRESS');
  });

  it('returns an empty array when no known PII field names are present', () => {
    expect(detectPii('const router = express.Router();')).toEqual([]);
  });

  it('returns each PII type at most once even when it appears multiple times', () => {
    const content = 'const email = data.email; if (!email) throw new Error(email);';
    const result = detectPii(content);
    const emailMatches = result.filter(t => t === 'EMAIL');
    expect(emailMatches).toHaveLength(1);
  });
});

// Group 2 — detectActivities: processing activity detection

describe('detectActivities — processing activity detection', () => {
  it('detects validation from an if-check with .includes()', () => {
    const code = "if (!email.includes('@')) { return res.status(400).json({ error: 'bad' }); }";
    const activities = detectActivities(code);
    expect(activities).toContain('validation');
  });

  it('detects transformation from .replace()', () => {
    const code = "const formattedPhone = phone.replace(/\\D/g, '');";
    const activities = detectActivities(code);
    expect(activities).toContain('transformation');
  });

  it('detects logging from logger.info() and appendFileSync', () => {
    expect(detectActivities("logger.info(`User registered: ${email}`)")).toContain('logging');
    expect(detectActivities('fs.appendFileSync(logFile, log);')).toContain('logging');
  });

  it('detects persistence from .create()', () => {
    const code = 'const user = await User.create({ name, email });';
    expect(detectActivities(code)).toContain('persistence');
  });

  it('returns an empty array when no activity patterns match', () => {
    expect(detectActivities("const mongoose = require('mongoose');")).toEqual([]);
  });
});

// Group 3 — tagGraph: sample-app integration

describe('tagGraph — sample-app integration', () => {
  let graph: Graph;

  beforeAll(() => {
    const files = walkRepo(SAMPLE_APP);
    graph = tagGraph(buildGraph(files, [mernRule]));
  });

  it('tags source:RegisterForm with EMAIL, PHONE, NAME, ADDRESS, DOB', () => {
    const node = graph.nodes.get('source:RegisterForm')!;
    expect(node.piiTypes).toContain('EMAIL');
    expect(node.piiTypes).toContain('PHONE');
    expect(node.piiTypes).toContain('NAME');
    expect(node.piiTypes).toContain('ADDRESS');
    expect(node.piiTypes).toContain('DOB');
  });

  it('tags fn:register with EMAIL, PHONE, NAME, ADDRESS, DOB', () => {
    const node = graph.nodes.get('fn:register')!;
    expect(node.piiTypes).toContain('EMAIL');
    expect(node.piiTypes).toContain('PHONE');
    expect(node.piiTypes).toContain('NAME');
    expect(node.piiTypes).toContain('ADDRESS');
    expect(node.piiTypes).toContain('DOB');
  });

  it('tags fn:register with validation, transformation, logging, persistence activities', () => {
    const node = graph.nodes.get('fn:register')!;
    expect(node.processingActivities).toContain('validation');
    expect(node.processingActivities).toContain('transformation');
    expect(node.processingActivities).toContain('logging');
    expect(node.processingActivities).toContain('persistence');
  });

  it('tags sink:users with IP_ADDRESS in addition to the standard PII types', () => {
    const node = graph.nodes.get('sink:users')!;
    expect(node.piiTypes).toContain('IP_ADDRESS');
    expect(node.piiTypes).toContain('EMAIL');
    expect(node.piiTypes).toContain('NAME');
  });

  it('propagates source piiTypes onto the outgoing data_flow edge', () => {
    const edge = graph.edges.find(
      e => e.from === 'source:RegisterForm' && e.to === 'fn:register',
    );
    expect(edge).toBeDefined();
    expect(edge!.piiTypes).toContain('EMAIL');
    expect(edge!.piiTypes).toContain('NAME');
  });

  it('every node has piiTypes and processingActivities arrays (no longer empty placeholders)', () => {
    for (const node of graph.nodes.values()) {
      expect(Array.isArray(node.piiTypes)).toBe(true);
      expect(Array.isArray(node.processingActivities)).toBe(true);
    }
  });
});

// Group 4 — tracePii: end-to-end path finding

describe('tracePii — end-to-end', () => {
  let graph: Graph;

  beforeAll(() => {
    const files = walkRepo(SAMPLE_APP);
    graph = tagGraph(buildGraph(files, [mernRule]));
  });

  it('returns exactly 2 findings (one per sink)', () => {
    const findings = tracePii(graph);
    expect(findings).toHaveLength(2);
  });

  it('both findings start at source:RegisterForm', () => {
    const findings = tracePii(graph);
    for (const f of findings) {
      expect(f.sourceId).toBe('source:RegisterForm');
    }
  });

  it('finds the path source:RegisterForm → fn:register → sink:users', () => {
    const findings = tracePii(graph);
    const toUsers = findings.find(f => f.sinkId === 'sink:users');
    expect(toUsers).toBeDefined();
    expect(toUsers!.path).toEqual(['source:RegisterForm', 'fn:register', 'sink:users']);
  });

  it('finds the path source:RegisterForm → fn:register → sink:app.log', () => {
    const findings = tracePii(graph);
    const toLog = findings.find(f => f.sinkId === 'sink:app.log');
    expect(toLog).toBeDefined();
    expect(toLog!.path).toEqual(['source:RegisterForm', 'fn:register', 'sink:app.log']);
  });

  it('the finding for sink:users includes EMAIL and IP_ADDRESS in piiTypes', () => {
    const findings = tracePii(graph);
    const toUsers = findings.find(f => f.sinkId === 'sink:users')!;
    expect(toUsers.piiTypes).toContain('EMAIL');
    expect(toUsers.piiTypes).toContain('IP_ADDRESS');
  });

  it('the finding for sink:app.log includes EMAIL in piiTypes (flows from route node)', () => {
    const findings = tracePii(graph);
    const toLog = findings.find(f => f.sinkId === 'sink:app.log')!;
    expect(toLog.piiTypes).toContain('EMAIL');
  });
});
