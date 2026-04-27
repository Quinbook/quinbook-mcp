import { z } from 'zod';
import { ApiClient } from '../api-client.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  handler: (input: any, api: ApiClient) => Promise<unknown>;
}

export function defineTool<TInput extends z.ZodTypeAny>(def: {
  name: string;
  description: string;
  inputSchema: TInput;
  handler: (input: z.infer<TInput>, api: ApiClient) => Promise<unknown>;
}): ToolDefinition {
  return def as ToolDefinition;
}
