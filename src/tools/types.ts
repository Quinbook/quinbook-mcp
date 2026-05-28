import { z } from 'zod';
import { ApiClient } from '../api-client.js';

/**
 * Boolean coercion that handles MCP-transport quirks where booleans arrive as strings.
 * Plain `z.coerce.boolean()` is unsafe: `Boolean("false") === true`.
 * This treats the strings "false"/"0"/"no"/"" as false, "true"/"1"/"yes" as true,
 * and leaves real booleans alone.
 */
export const coerceBool = () =>
  z.preprocess((v) => {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      if (s === 'true' || s === '1' || s === 'yes') return true;
      if (s === 'false' || s === '0' || s === 'no' || s === '') return false;
    }
    if (typeof v === 'number') return v !== 0;
    return v;
  }, z.boolean());

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
