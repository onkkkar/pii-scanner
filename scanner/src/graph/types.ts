import { ScannedFile, Node, Edge } from '../utils/types';

export interface AnalysisRule {
  name: string;

  // Is this file where data enters the system? (e.g. a form, an API handler)
  isSource: (file: ScannedFile) => boolean;

  // Is this file where data lands? (e.g. a DB model, a log writer)
  isSink: (file: ScannedFile) => boolean;

  // Chance to rename / enrich the node after initial creation
  // e.g. rename 'sink:userModel' → 'sink:users' based on the mongoose.model() call
  tagNode: (node: Node, file: ScannedFile) => Node;

  // Wire up the edges once all nodes exist and have their final ids
  buildEdges: (nodes: Node[], files: ScannedFile[]) => Edge[];
}
