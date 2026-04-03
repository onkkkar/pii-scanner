// PII field name patterns and processing activity patterns

import { PiiType, ProcessingActivity } from '../utils/types';

// We scan source code for field names, not actual data values
// e.g. we look for the variable name "email" not a valid email address.
export const PII_FIELD_PATTERNS: Record<PiiType, RegExp[]> = {
  EMAIL:      [/\bemail\b/i],
  PHONE:      [/\bphone\b/i],
  NAME:       [/\bname\b/i],
  ADDRESS:    [/\baddress\b/i],
  DOB:        [/\bdob\b/i, /\bdate_?of_?birth\b/i, /\bdateOfBirth\b/i, /\bbirthdate\b/i],
  IP_ADDRESS: [/\bip_?address\b/i],
};

// Activity patterns detect what a file does with data, not what data it holds
export const ACTIVITY_PATTERNS: Record<ProcessingActivity, RegExp[]> = {
  validation:     [/if\s*\(/, /\.test\s*\(/, /\.includes\s*\(/, /\.match\s*\(/],
  transformation: [/\.replace\s*\(/, /\.trim\s*\(/, /\.toLowerCase\s*\(/, /\.toUpperCase\s*\(/, /\.slice\s*\(/, /\.split\s*\(/],
  logging:        [/console\.(log|info|warn|error)/, /logger\.(info|warn|error|log)/, /appendFileSync/],
  persistence:    [/\.create\s*\(/, /\.save\s*\(/, /\.insert\s*\(/, /\.upsert\s*\(/, /\.findOneAndUpdate\s*\(/],
  enrichment:     [/Object\.assign\s*\(/, /\.merge\s*\(/, /\.\.\.[a-zA-Z]\w*\s*[,}]/],
};
