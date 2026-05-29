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

/** One field of an elicitation form (a restricted, flat primitive schema per the MCP spec). */
export interface ElicitPrimitive {
  type: 'string' | 'number' | 'integer' | 'boolean';
  title?: string;
  description?: string;
  enum?: string[];
  /** Display labels for `enum` values (same order). Rendered by the client instead of the raw values. */
  enumNames?: string[];
}

export interface ElicitRequestedSchema {
  type: 'object';
  properties: Record<string, ElicitPrimitive>;
  required?: string[];
}

export interface ElicitOutcome {
  action: 'accept' | 'decline' | 'cancel';
  content?: Record<string, string | number | boolean | string[]>;
}

/**
 * Per-call context handed to tool handlers. Lets a tool request structured input from the user via
 * MCP Elicitation when the client supports it (clientSupportsElicitation), with a clean fallback otherwise.
 */
export interface ToolContext {
  clientSupportsElicitation: boolean;
  elicit: (params: { message: string; requestedSchema: ElicitRequestedSchema }) => Promise<ElicitOutcome>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  handler: (input: any, api: ApiClient, ctx?: ToolContext) => Promise<unknown>;
}

export function defineTool<TInput extends z.ZodTypeAny>(def: {
  name: string;
  description: string;
  inputSchema: TInput;
  handler: (input: z.infer<TInput>, api: ApiClient, ctx?: ToolContext) => Promise<unknown>;
}): ToolDefinition {
  return def as ToolDefinition;
}
