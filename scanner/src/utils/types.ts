// Shared TypeScript types and interfaces used across every scanner module

export type NodeKind = 'source' | 'sink' | 'code_snippet';

export type PiiType =
  | 'EMAIL' | 'PHONE' | 'NAME'
  | 'ADDRESS' | 'DOB' | 'IP_ADDRESS';

export type ProcessingActivity =
  | 'validation' | 'transformation'
  | 'logging' | 'persistence' | 'enrichment';

export type EdgeKind = 'data_flow' | 'calls' | 'writes' | 'imports';

export interface ScannedFile {
  filePath: string;
  content: string;
  hash: string;
  language: 'js' | 'jsx' | 'ts' | 'tsx';
}

export interface Node {
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

export interface Edge {
  from: string;
  to: string;
  kind: EdgeKind;
  piiTypes: PiiType[];
}

export interface Graph {
  nodes: Map<string, Node>;
  edges: Edge[];
  adjacency: Map<string, string[]>;
}

export interface ActivityCatalog {
  [canonicalId: string]: {
    canonicalName: string;
    aliases: string[];
    evidence: string[];
  };
}

export interface ScanState {
  hashes: Record<string, string>;
  graphFragments: Record<string, unknown>;
  activities: ActivityCatalog;
}
