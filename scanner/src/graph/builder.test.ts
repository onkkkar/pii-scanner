// Tests for the graph builder — covers node classification, edge construction,
// adjacency list correctness, and BFS / DFS traversal on the sample-app.

import * as path from 'path';
import { walkRepo } from '../extractor/index';
import { buildGraph, mernRule, bfs, dfs } from './index';
import { ScannedFile } from '../utils/types';

// Absolute path to sample-app — same pattern used in walker.test.ts.
const SAMPLE_APP = path.resolve(__dirname, '../../..', 'sample-app');

// ---------------------------------------------------------------------------
// Minimal ScannedFile helpers for unit-level classification tests.
// These let us test isSource / isSink / tagNode without touching disk.
// ---------------------------------------------------------------------------

function makeFile(partial: Partial<ScannedFile> & { content: string }): ScannedFile {
  return {
    filePath: partial.filePath ?? 'test/file.js',
    content: partial.content,
    hash: 'testhash',
    language: partial.language ?? 'js',
  };
}

// ---------------------------------------------------------------------------
// Group 1 — Node classification with mock files
// ---------------------------------------------------------------------------

describe('buildGraph — node classification', () => {
  it('classifies a JSX file with <form> and <input> as source', () => {
    const file = makeFile({
      filePath: 'frontend/Form.jsx',
      content: '<form><input name="email" /></form>',
      language: 'jsx',
    });

    const graph = buildGraph([file], [mernRule]);
    const node = graph.nodes.get('source:Form');

    expect(node).toBeDefined();
    expect(node!.kind).toBe('source');
  });

  it('classifies a file with mongoose.Schema as sink and sets id to sink:<model>s', () => {
    const file = makeFile({
      filePath: 'backend/userModel.js',
      content: [
        "const mongoose = require('mongoose');",
        'const s = new mongoose.Schema({ email: String });',
        "mongoose.model('User', s);",
      ].join('\n'),
    });

    const graph = buildGraph([file], [mernRule]);

    expect(graph.nodes.has('sink:users')).toBe(true);
    expect(graph.nodes.get('sink:users')!.kind).toBe('sink');
  });

  it('classifies a file with appendFileSync as sink and sets id from .log filename', () => {
    const file = makeFile({
      filePath: 'backend/logger.js',
      content: [
        "const fs = require('fs');",
        "const logFile = 'app.log';",
        'fs.appendFileSync(logFile, msg);',
      ].join('\n'),
    });

    const graph = buildGraph([file], [mernRule]);

    expect(graph.nodes.has('sink:app.log')).toBe(true);
    expect(graph.nodes.get('sink:app.log')!.kind).toBe('sink');
  });

  it('classifies an Express router file as code_snippet and sets id from route path', () => {
    const file = makeFile({
      filePath: 'backend/userRoutes.js',
      content: [
        "const router = require('express').Router();",
        "router.post('/register', async (req, res) => {});",
      ].join('\n'),
    });

    const graph = buildGraph([file], [mernRule]);

    expect(graph.nodes.has('fn:register')).toBe(true);
    expect(graph.nodes.get('fn:register')!.kind).toBe('code_snippet');
  });

  it('every node has a non-empty raw field equal to the file content', () => {
    const content = '<form><input name="email" /></form>';
    const file = makeFile({ filePath: 'F.jsx', content, language: 'jsx' });

    const graph = buildGraph([file], [mernRule]);
    const node = Array.from(graph.nodes.values())[0];

    expect(node.raw).toBe(content);
  });
});

// ---------------------------------------------------------------------------
// Group 2 — Sample-app integration: correct graph shape
// ---------------------------------------------------------------------------

describe('buildGraph — sample-app integration', () => {
  let graph: ReturnType<typeof buildGraph>;

  beforeAll(() => {
    const files = walkRepo(SAMPLE_APP);
    graph = buildGraph(files, [mernRule]);
  });

  it('produces exactly 4 nodes', () => {
    expect(graph.nodes.size).toBe(4);
  });

  it('creates a source node for RegisterForm.jsx', () => {
    const node = graph.nodes.get('source:RegisterForm');
    expect(node).toBeDefined();
    expect(node!.kind).toBe('source');
    expect(node!.filePath).toBe('frontend/RegisterForm.jsx');
  });

  it('creates a code_snippet node for userRoutes.js', () => {
    const node = graph.nodes.get('fn:register');
    expect(node).toBeDefined();
    expect(node!.kind).toBe('code_snippet');
    expect(node!.filePath).toBe('backend/userRoutes.js');
  });

  it('creates a sink node for userModel.js', () => {
    const node = graph.nodes.get('sink:users');
    expect(node).toBeDefined();
    expect(node!.kind).toBe('sink');
    expect(node!.filePath).toBe('backend/userModel.js');
  });

  it('creates a sink node for logger.js', () => {
    const node = graph.nodes.get('sink:app.log');
    expect(node).toBeDefined();
    expect(node!.kind).toBe('sink');
    expect(node!.filePath).toBe('backend/logger.js');
  });

  it('produces exactly 3 edges', () => {
    expect(graph.edges).toHaveLength(3);
  });

  it('connects source:RegisterForm → fn:register with data_flow edge', () => {
    const edge = graph.edges.find(
      e => e.from === 'source:RegisterForm' && e.to === 'fn:register',
    );
    expect(edge).toBeDefined();
    expect(edge!.kind).toBe('data_flow');
  });

  it('connects fn:register → sink:users with writes edge', () => {
    const edge = graph.edges.find(
      e => e.from === 'fn:register' && e.to === 'sink:users',
    );
    expect(edge).toBeDefined();
    expect(edge!.kind).toBe('writes');
  });

  it('connects fn:register → sink:app.log with writes edge', () => {
    const edge = graph.edges.find(
      e => e.from === 'fn:register' && e.to === 'sink:app.log',
    );
    expect(edge).toBeDefined();
    expect(edge!.kind).toBe('writes');
  });

  it('adjacency list matches the edges', () => {
    expect(graph.adjacency.get('source:RegisterForm')).toEqual(['fn:register']);
    expect(graph.adjacency.get('fn:register')?.sort()).toEqual(
      ['sink:app.log', 'sink:users'].sort(),
    );
    expect(graph.adjacency.get('sink:users')).toEqual([]);
    expect(graph.adjacency.get('sink:app.log')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Group 3 — BFS / DFS traversal
// ---------------------------------------------------------------------------

describe('bfs / dfs — traversal', () => {
  let graph: ReturnType<typeof buildGraph>;

  beforeAll(() => {
    const files = walkRepo(SAMPLE_APP);
    graph = buildGraph(files, [mernRule]);
  });

  it('BFS from source:RegisterForm visits all 4 nodes', () => {
    const visited = bfs(graph, 'source:RegisterForm');
    expect(visited).toHaveLength(4);
    expect(visited).toContain('source:RegisterForm');
    expect(visited).toContain('fn:register');
    expect(visited).toContain('sink:users');
    expect(visited).toContain('sink:app.log');
  });

  it('BFS visits source:RegisterForm before fn:register, and fn:register before sinks', () => {
    const visited = bfs(graph, 'source:RegisterForm');
    expect(visited[0]).toBe('source:RegisterForm');
    expect(visited[1]).toBe('fn:register');
    // Both sinks must appear after fn:register (indices 2 and 3)
    const registerIdx = visited.indexOf('fn:register');
    const usersIdx    = visited.indexOf('sink:users');
    const logIdx      = visited.indexOf('sink:app.log');
    expect(usersIdx).toBeGreaterThan(registerIdx);
    expect(logIdx).toBeGreaterThan(registerIdx);
  });

  it('DFS from source:RegisterForm visits all 4 nodes', () => {
    const visited = dfs(graph, 'source:RegisterForm');
    expect(visited).toHaveLength(4);
    expect(visited).toContain('source:RegisterForm');
    expect(visited).toContain('fn:register');
    expect(visited).toContain('sink:users');
    expect(visited).toContain('sink:app.log');
  });

  it('BFS on a node with no outgoing edges returns only that node', () => {
    const visited = bfs(graph, 'sink:users');
    expect(visited).toEqual(['sink:users']);
  });

  it('BFS returns empty array for a node id that does not exist in the graph', () => {
    const visited = bfs(graph, 'does:not:exist');
    expect(visited).toEqual([]);
  });
});
