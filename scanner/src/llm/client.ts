import { PiiType } from '../utils/types';

export interface ClassifyResult {
  isPII:      boolean;
  piiType:    PiiType | null;
  confidence: 'high' | 'low';
}

export interface ActivityResult {
  activity:    string;
  description: string;
}

// LLMClient lets us swap between mock and real without changing anything else
export interface LLMClient {
  classify(fieldName: string): Promise<ClassifyResult>;
  suggestActivity(nodeId: string, activities: string[]): Promise<ActivityResult>;
}

// returns hardcoded stuff — to test the whole flow without a real API key
export const mockLLMClient: LLMClient = {
  async classify(_fieldName: string): Promise<ClassifyResult> {
    return { isPII: true, piiType: 'EMAIL', confidence: 'high' };
  },
  async suggestActivity(_nodeId: string, activities: string[]): Promise<ActivityResult> {
    const label = activities[0] ?? 'validation';
    return { activity: label, description: `Performs ${label} on user data` };
  },
};

 // not wired up yet — only this function changes when we hook up Anthropic, nothing else needs to touch the LLMClient interface
export function createClaudeClient(_apiKey: string): LLMClient {
  throw new Error('createClaudeClient: not implemented — use mockLLMClient for now');
}
