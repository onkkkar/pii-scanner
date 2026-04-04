import { execSync } from 'child_process';
import { Graph, PiiType, ActivityCatalog } from '../utils/types';
import { PiiFinding } from '../pii/tracer';

export interface ReportTrace {
  sourceId: string;
  sinkId:   string;
  path:     string[];
  piiTypes: PiiType[];
}

export interface ReportActivity {
  canonicalId:   string;
  canonicalName: string;
  aliases:       string[];
  evidence:      string[];
}

export interface Report {
  scanId:               string;
  repoVersion:          string;
  repoPath:             string;
  scannedAt:            string;
  sensitiveDataTypes:   PiiType[];
  traces:               ReportTrace[];
  processingActivities: ReportActivity[];
}

function buildScanId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
  return `scan-${date}-${time}`;
}

// reads git HEAD hash from the repo being scanned, falls back to 'unknown' if not a git repo
function getRepoVersion(repoPath: string): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: repoPath }).toString().trim();
  } catch {
    return 'unknown';
  }
}

function collectSensitiveTypes(findings: PiiFinding[]): PiiType[] {
  const seen = new Set<PiiType>();
  for (const f of findings) {
    for (const t of f.piiTypes) {
      seen.add(t);
    }
  }
  return Array.from(seen);
}

export function generateReport(
  _graph: Graph,
  findings: PiiFinding[],
  catalog: ActivityCatalog,
  repoPath: string,
): Report {
  const activities: ReportActivity[] = Object.entries(catalog).map(([id, entry]) => ({
    canonicalId:   id,
    canonicalName: entry.canonicalName,
    aliases:       entry.aliases,
    evidence:      entry.evidence,
  }));

  return {
    scanId:      buildScanId(),
    repoVersion: getRepoVersion(repoPath),
    repoPath,
    scannedAt:   new Date().toISOString(),
    sensitiveDataTypes: collectSensitiveTypes(findings),
    traces: findings.map(f => ({
      sourceId: f.sourceId,
      sinkId:   f.sinkId,
      path:     f.path,
      piiTypes: f.piiTypes,
    })),
    processingActivities: activities,
  };
}
