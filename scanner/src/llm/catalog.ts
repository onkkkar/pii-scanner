import { ActivityCatalog } from '../utils/types';
import { readState, writeState } from '../utils/state';

const DEFAULT_PATH = 'state/activities.json';

// reads catalog from disk, returns empty object if file doesn't exist yet (first run)
export function loadCatalog(filePath: string = DEFAULT_PATH): ActivityCatalog {
  try {
    return readState<ActivityCatalog>(filePath);
  } catch {
    return {};
  }
}

// writes catalog to disk so next run can pick up where we left off
export function saveCatalog(catalog: ActivityCatalog, filePath: string = DEFAULT_PATH): void {
  writeState(filePath, catalog);
}

// merges two runs together — keeps original names, deduplicates aliases and evidence
export function mergeCatalog(existing: ActivityCatalog, incoming: ActivityCatalog): ActivityCatalog {
  const merged: ActivityCatalog = { ...existing };

  for (const [id, entry] of Object.entries(incoming)) {
    if (merged[id]) {
      merged[id] = {
        canonicalName: merged[id].canonicalName,
        aliases:       [...new Set([...merged[id].aliases,  ...entry.aliases])],
        evidence:      [...new Set([...merged[id].evidence, ...entry.evidence])],
      };
    } else {
      merged[id] = { ...entry };
    }
  }

  return merged;
}
