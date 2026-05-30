import { ElicitPrimitive, ToolContext } from './types.js';

// ── Shared required-field gate + elicitation helper ──────────────
// Reusable plumbing for the "ask before you write" contract (see
// docs/plans/aitools-mcp-annotation-rollout.md). Two flavours of gate exist in the MCP:
//   1. Server-driven (coupons_create): the CoreApi AI tool returns {status:"needs_input", missing}.
//   2. Client-driven (contacts_create, …): the validation contract lives in the MCP because the
//      forwarded endpoint has no needs_input gate, only a 400 on violation.
// This helper covers the client-driven case: validate locally, then either render an MCP elicitation
// form (capable clients) or hand back a needs_input payload the model can ask about in chat.

/** One missing field to collect, with an optional richer widget (defaults to a plain text input). */
export interface MissingField {
  field: string;
  question: string;
  /** Optional elicitation widget override (enum dropdown, number, boolean, …). */
  primitive?: ElicitPrimitive;
}

/** Plain text-fallback payload for clients that can't render an elicitation form. */
export function needsInputPayload(message: string, missing: MissingField[]) {
  return {
    status: 'needs_input' as const,
    message,
    missing: missing.map((m) => ({ field: m.field, question: m.question })),
  };
}

/** Drop empty/blank values so collected input doesn't override server-side defaults. */
export function cleanContent(content: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(content)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    out[k] = v;
  }
  return out;
}

export type ResolveOutcome =
  /** Nothing was missing — proceed. */
  | { kind: 'ok' }
  /** Client can't elicit — return this gate to the model so it asks in chat. */
  | { kind: 'gate'; payload: ReturnType<typeof needsInputPayload> }
  /** User filled the form — merge `values` into the input and proceed. */
  | { kind: 'collected'; values: Record<string, unknown> }
  /** User dismissed the form — abort the write. */
  | { kind: 'cancelled'; payload: { status: 'cancelled'; message: string } };

/**
 * Resolve a set of missing fields. When `missing` is empty → {ok}. Otherwise, if the client supports
 * elicitation, render a form and return the collected values; if not, return a needs_input gate.
 *
 * `requireAll` controls the form's `required` array: true (default) forces every field; false renders
 * them all optional — use false for "at least one of" rules where the caller re-validates afterwards.
 */
export async function resolveMissing(
  ctx: ToolContext | undefined,
  message: string,
  missing: MissingField[],
  requireAll = true,
): Promise<ResolveOutcome> {
  if (!missing.length) return { kind: 'ok' };

  if (!ctx?.clientSupportsElicitation) {
    return { kind: 'gate', payload: needsInputPayload(message, missing) };
  }

  const properties: Record<string, ElicitPrimitive> = {};
  const required: string[] = [];
  for (const m of missing) {
    properties[m.field] = m.primitive ?? { type: 'string', title: m.field, description: m.question };
    if (requireAll) required.push(m.field);
  }

  const outcome = await ctx.elicit({
    message,
    requestedSchema: { type: 'object', properties, required },
  });

  if (outcome.action !== 'accept' || !outcome.content) {
    return { kind: 'cancelled', payload: { status: 'cancelled', message: 'Abgebrochen — es wurden keine Angaben gemacht.' } };
  }

  return { kind: 'collected', values: cleanContent(outcome.content) };
}
