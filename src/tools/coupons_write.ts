import { z } from 'zod';
import { defineTool, ToolDefinition, coerceBool, ElicitPrimitive } from './types.js';

// ── coupons_create ──────────────────────────────────────────────
// Thin forwarder to the CoreApi AI tool POST /v1/ai/tools/create_coupon.
// The validation contract (which fields are required, conditional tax handling, defaults) is owned
// SERVER-SIDE by the typed CreateCouponInput annotations — this tool keeps a LOOSE schema and forwards,
// so it inherits the server's needs_input gate. See docs/plans/aitools-mcp-annotation-rollout.md.
//
// Elicitation: when the server reports missing required fields AND the MCP client supports elicitation,
// we render those as a structured form instead of bouncing a needs_input text back to the model. Clients
// without elicitation support get the plain needs_input payload (graceful fallback).
const couponsCreateInput = z.object({
  type: z
    .enum(['discount', 'cash'])
    .optional()
    .describe(
      "'discount' = Rabatt-Coupon, 'cash' = Wertgutschein. Aus dem Wort des Nutzers ableiten (Gutschein→cash, Coupon/Rabatt→discount)."
    ),
  description: z
    .string()
    .optional()
    .describe('Name/Bezeichnung des Coupons bzw. Gutscheins (vom Nutzer übernehmen).'),
  discountAmount: z.coerce
    .number()
    .optional()
    .describe('Fester Wert/Rabatt (brutto, in €). Bei Wertgutschein Pflicht (min 1).'),
  discountPercentage: z.coerce
    .number()
    .optional()
    .describe('Rabatt in Prozent (nur Coupon, alternativ zu discountAmount).'),
  iTaxGroup: z.coerce
    .number()
    .int()
    .optional()
    .describe('Steuergruppe (i_taxgroup). Bei Wertgutschein PFLICHT, außer steuerfrei — verfügbare mit get_tax_groups ermitteln und den Nutzer wählen lassen.'),
  iTax: z.coerce
    .number()
    .int()
    .optional()
    .describe('Optional: konkrete Steuer (i_tax) innerhalb der gewählten Steuergruppe.'),
  taxFree: coerceBool().optional().describe('true = steuerfrei (keine Steuergruppe nötig). Standard: steuerpflichtig.'),
  validFrom: z.string().optional().describe('Gültig ab (ISO 8601). Standard: sofort.'),
  validUntil: z.string().optional().describe('Gültig bis (ISO 8601). Standard: Jahresende in +3 Jahren.'),
  alias: z.string().optional().describe('Eigener Wunsch-Code (Alias). Leer = Code wird automatisch generiert.'),
  dryRun: coerceBool()
    .optional()
    .describe(
      'true (Default serverseitig) = nur Vorschau, es wird NICHTS geschrieben. false = wirklich anlegen (erst nach Bestätigung durch den Nutzer).'
    ),
});

const ENDPOINT = '/v1/ai/tools/create_coupon';

/** Map a missing coupon field to an elicitation form field (nicer widgets for the few we know). */
function primitiveFor(field: string, question: string): ElicitPrimitive {
  switch (field) {
    case 'type':
      return { type: 'string', title: 'Typ', description: question, enum: ['discount', 'cash'] };
    case 'discountAmount':
      return { type: 'number', title: 'Betrag (€)', description: question };
    case 'discountPercentage':
      return { type: 'number', title: 'Rabatt (%)', description: question };
    case 'taxFree':
      return { type: 'boolean', title: 'Steuerfrei', description: question };
    case 'iTaxGroup':
      return { type: 'number', title: 'Steuergruppe (ID)', description: question };
    default:
      return { type: 'string', title: field, description: question };
  }
}

/** Drop empty/blank values so they don't override server defaults. */
function cleanContent(content: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(content)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    out[k] = v;
  }
  return out;
}

const couponsCreate = defineTool({
  name: 'coupons_create',
  description:
    'Legt einen Coupon (Rabattcode) ODER einen Wertgutschein an. Pflicht: Name (description) und — beim '
    + 'Wertgutschein — Betrag (discountAmount). Bei type="cash" ist außerdem eine Steuergruppe (iTaxGroup) '
    + 'PFLICHT, außer steuerfrei (taxFree=true): ZUERST get_tax_groups aufrufen und dem Nutzer ALLE '
    + 'verfügbaren Gruppen unverändert zur Wahl anbieten (keine weglassen/filtern, auch nicht test- oder '
    + 'ungewöhnlich benannte). Fehlt eine Pflichtangabe, beim Nutzer nachfragen und erneut aufrufen. '
    + 'Führt nach Klärung der Pflichtangaben DIREKT aus (keine separate Vorschau) — hol dir vorher die '
    + 'Bestätigung des Nutzers im Chat. WRITE. (Internal — MCP-allowed)',
  inputSchema: couponsCreateInput,
  handler: async (input, api, ctx) => {
    // Execute directly (no dry-run preview) once required fields are present — consistent with the other
    // MCP write tools. The server's needs_input gate still blocks incomplete writes; the model confirms in
    // chat before calling. dryRun is only honored if the caller sets it explicitly.
    const dryRun = input.dryRun ?? false;
    const resp = (await api.post(ENDPOINT, { ...input, dryRun })) as any;

    // Server gate reports missing required fields → collect them via a form if the client can render one.
    const missing = resp?.status === 'needs_input' && Array.isArray(resp.missing) ? resp.missing : null;
    if (ctx?.clientSupportsElicitation && missing && missing.length) {
      const properties: Record<string, ElicitPrimitive> = {};
      const required: string[] = [];
      for (const m of missing as Array<{ field: string; question: string }>) {
        if (m.field === 'iTaxGroup') {
          // Build a real dropdown from ALL tax groups (names as labels) so nothing is omitted —
          // the model can't curate the list here.
          const tg = (await api.post('/v1/ai/tools/get_tax_groups', {})) as any;
          const items: Array<{ iTaxGroup: number; name: string }> = Array.isArray(tg?.items) ? tg.items : [];
          properties[m.field] = items.length
            ? {
                type: 'string',
                title: 'Steuergruppe',
                description: m.question,
                enum: items.map((i) => String(i.iTaxGroup)),
                enumNames: items.map((i) => i.name),
              }
            : primitiveFor(m.field, m.question);
        } else {
          properties[m.field] = primitiveFor(m.field, m.question);
        }
        required.push(m.field);
      }

      const outcome = await ctx.elicit({
        message: 'Für den Coupon/Gutschein fehlen noch Pflichtangaben:',
        requestedSchema: { type: 'object', properties, required },
      });

      if (outcome.action !== 'accept' || !outcome.content) {
        return { status: 'cancelled', message: 'Anlegen abgebrochen — es wurden keine Angaben gemacht.' };
      }

      // Re-run with the collected values and execute directly (same dryRun intent as the first call).
      const merged = { ...input, ...cleanContent(outcome.content), dryRun };
      return api.post(ENDPOINT, merged);
    }

    return resp;
  },
});

// ── get_tax_groups ──────────────────────────────────────────────
// Forwarder to the CoreApi read tool. Needed so the assistant can resolve the mandatory tax group for a
// cash voucher (coupons_create type=cash) and offer the available groups to the user — without it the model
// hits a dead end ("get_tax_groups not available").
const getTaxGroups = defineTool({
  name: 'get_tax_groups',
  description:
    'Listet die Steuergruppen der aktiven Firma (iTaxGroup + Name, z. B. "Standard 19%", "0% steuerfrei"). '
    + 'Nutze das, um bei einem Wertgutschein (coupons_create type="cash") die Steuergruppe zu ermitteln. '
    + 'Biete dem Nutzer IMMER ALLE zurückgegebenen Gruppen zur Auswahl an — filtere/lasse keine weg, auch '
    + 'nicht test- oder ungewöhnlich benannte. (Internal — MCP-allowed)',
  inputSchema: z.object({}),
  handler: async (_input, api) => api.post('/v1/ai/tools/get_tax_groups', {}),
});

export const couponWriteTools: ToolDefinition[] = [couponsCreate, getTaxGroups];
