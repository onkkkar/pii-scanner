import { writeState } from '../utils/state';
import { Report } from './report';

const DEFAULT_OUTPUT_PATH = 'output/report.json';

// writes the report to disk — output / dir is created if it doesn't exist
export function writeReport(report: Report, filePath: string = DEFAULT_OUTPUT_PATH): void {
  writeState(filePath, report);
}
