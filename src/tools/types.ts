import { z } from 'zod';
import { ApiClient } from '../api-client.js';

/**
 * Standard dryRun field for write tools. Default true so the LLM has to
 * explicitly opt into actually executing the write. The handler returns a
 * description of the call it WOULD make instead of performing it.
 */
export const dryRunField = z
  .coerce.boolean()
  .default(true)
  .describe(
    'Default true. When true, the tool returns the planned API call (method, url, body) without executing it. Set to false to actually perform the write. Always show the dryRun preview to the user and obtain confirmation before re-running with dryRun=false.',
  );

export function dryRunPreview(method: string, url: string, body?: unknown) {
  return {
    dryRun: true,
    wouldCall: { method, url, body: body ?? null },
    note: 'No data was changed. Re-run with dryRun=false to execute.',
  };
}

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
