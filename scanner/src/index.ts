import * as path from 'path';
import { runScanner } from './scanner';

const REPO_PATH = path.resolve(__dirname, '../../sample-app');

runScanner(REPO_PATH)
  .then(report => {
    console.log(`\nScan complete — ${report.scanId}`);
    console.log(`Sensitive types found: ${report.sensitiveDataTypes.join(', ')}`);
    console.log(`Traces: ${report.traces.length}`);
    console.log(`Activities catalogued: ${report.processingActivities.length}`);
    console.log(`Report written to output/report.json`);
  })
  .catch(err => {
    console.error('Scanner failed:', err);
    process.exit(1);
  });
