// Detects React form sources, Mongoose DB sinks, and file-logger sinks
// Builds data_flow edges (source → route) and writes edges (route → sinks) by inspecting require() / import calls in route-handler files

import { basename, extname } from 'path';
import { AnalysisRule } from './types';
import { ScannedFile, Node, Edge } from '../utils/types';

export const mernRule: AnalysisRule = {
  name: 'mern',

  isSource(file: ScannedFile): boolean {
    // React form with input fields — JSX or TSX only
    return (
      (file.language === 'jsx' || file.language === 'tsx') &&
      (file.content.includes('<form') || file.content.includes('<input'))
    );
  },

  isSink(file: ScannedFile): boolean {
    // Mongoose schema definition OR file-logger using appendFileSync
    return (
      file.content.includes('mongoose.Schema') ||
      file.content.includes('appendFileSync')
    );
  },

  tagNode(node: Node, file: ScannedFile): Node {
    if (node.kind === 'sink') {
      // MongoDB sink: derive id from mongoose.model('User', ...) → 'sink:users'
      // \s* handles multiline calls: mongoose.model(\n  'User', ...
      const mongooseMatch = file.content.match(/mongoose\.model\s*\(\s*['"](\w+)['"]/);
      if (mongooseMatch) {
        return { ...node, id: `sink:${mongooseMatch[1].toLowerCase()}s` };
      }
      // File-logger sink: derive id from the log filename → 'sink:app.log'
      const logFileMatch = file.content.match(/['"]([\w.-]+\.log)['"]/);
      if (logFileMatch) {
        return { ...node, id: `sink:${logFileMatch[1]}` };
      }
    }

    if (node.kind === 'code_snippet') {
      // Express route: extract path segment from router.post('/register', ...)
      const routerMatch = file.content.match(/router\.\w+\s*\(\s*['"]\/(\w+)['"]/);
      if (routerMatch) {
        return { ...node, id: `fn:${routerMatch[1]}` };
      }
      // app.post('/path', ...) pattern
      const appMatch = file.content.match(/app\.\w+\s*\(\s*['"]\/(\w+)['"]/);
      if (appMatch) {
        return { ...node, id: `fn:${appMatch[1]}` };
      }
    }

    // Source nodes keep the default id: source:<BaseName>
    return node;
  },

  buildEdges(nodes: Node[], files: ScannedFile[]): Edge[] {
    const edges: Edge[] = [];
    const sources = nodes.filter(n => n.kind === 'source');
    const snippets = nodes.filter(n => n.kind === 'code_snippet');
    const sinks   = nodes.filter(n => n.kind === 'sink');

    // source → code_snippet: data_flow
    // The React form sends its payload to every Express route handler
    for (const source of sources) {
      for (const snippet of snippets) {
        edges.push({
          from: source.id,
          to: snippet.id,
          kind: 'data_flow',
          piiTypes: [],
        });
      }
    }

    // code_snippet → sink: writes
    // A route handler writes to a sink if its file requires / imports the sink's file
    for (const snippet of snippets) {
      const snippetFile = files.find(f => f.filePath === snippet.filePath);
      if (!snippetFile) continue;

      for (const sink of sinks) {
        const sinkBase = basename(sink.filePath, extname(sink.filePath));

        if (
          snippetFile.content.includes(`require('./${sinkBase}')`) ||
          snippetFile.content.includes(`require("./${sinkBase}")`) ||
          snippetFile.content.includes(`from './${sinkBase}'`) ||
          snippetFile.content.includes(`from "./${sinkBase}"`)
        ) {
          edges.push({
            from: snippet.id,
            to: sink.id,
            kind: 'writes',
            piiTypes: [],
          });
        }
      }
    }

    return edges;
  },
};
