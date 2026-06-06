import { z } from 'zod';
import { defineTool, ToolDefinition, coerceBool } from './types.js';
import { MissingField, needsInputPayload, resolveMissing } from './needs_input.js';

// All endpoints in this module are class-level Internal in the backend
// (ContactController, CustomerController). Per the "Internal but
// MCP-allowed" architecture (see feedback_mcp_public_endpoints_only.md),
// quinbook-mcp consumes them anyway — they are stable enough for AI
// tooling but not part of the public third-party API contract.

// ── contacts_search ─────────────────────────────────────────────
const contactsSearchInput = z.object({
  search: z.string().optional().describe('Free-text search across name, company, email, etc.'),
  name: z.string().optional().describe('Filter by contact name'),
  companyName: z.string().optional().describe('Filter by company name'),
  emailAddress: z.string().optional().describe('Filter by email'),
  limit: z.coerce.number().int().min(1).max(500).default(100).describe('Max results, default 100'),
});

const contactsSearch = defineTool({
  name: 'contacts_search',
  description:
    'Search contacts (customers) by name, company name, email, or free-text. Returns a list of compact contact records with iCustomer, name, address, phone. (Internal — MCP-allowed)',
  annotations: { title: 'Search contacts', readOnlyHint: true, openWorldHint: true },
  inputSchema: contactsSearchInput,
  handler: async (input, api) => api.get('/v1/contact/search', input),
});

// ── contacts_get ────────────────────────────────────────────────
const contactsGetInput = z.object({
  iCustomer: z.coerce.number().int().positive().describe('Customer / contact id'),
});

const contactsGet = defineTool({
  name: 'contacts_get',
  description:
    'Fetch a single contact (customer) by id. Returns the full customer record. (Internal — MCP-allowed)',
  annotations: { title: 'Get contact', readOnlyHint: true, openWorldHint: true },
  inputSchema: contactsGetInput,
  handler: async (input, api) => api.get(`/v1/customer/${input.iCustomer}`),
});

// ── contacts_notices_list ───────────────────────────────────────
const contactsNoticesListInput = z.object({
  iCustomer: z.coerce.number().int().positive().describe('Customer / contact id'),
  type: z.string().optional().describe('Filter by notice type (e.g. "default", "default-private")'),
  onlyMarked: z.boolean().optional().describe('If true, return only marked (favorited) notices'),
  sortFavorites: z.boolean().optional().describe('If true, sort favorited notices first'),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const contactsNoticesList = defineTool({
  name: 'contacts_notices_list',
  description:
    'List notices/notes attached to a contact. Notices are internal staff notes (e.g. "Customer called to reschedule"). (Internal — MCP-allowed)',
  annotations: { title: 'List contact notices', readOnlyHint: true, openWorldHint: true },
  inputSchema: contactsNoticesListInput,
  handler: async (input, api) => {
    const { iCustomer, onlyMarked, sortFavorites, ...rest } = input;
    const query: Record<string, unknown> = { ...rest };
    // Backend expects "Y"/"N" for boolean flags on this endpoint (legacy).
    if (onlyMarked !== undefined) query.onlymarked = onlyMarked ? 'Y' : 'N';
    if (sortFavorites !== undefined) query.sortfav = sortFavorites ? 'Y' : 'N';
    return api.get(`/v1/customer/${iCustomer}/notices`, query);
  },
});

// ── contacts_add_notice ─────────────────────────────────────────
const contactsAddNoticeInput = z.object({
  iCustomer: z.coerce.number().int().positive().describe('Customer / contact id'),
  notice: z.string().min(1).describe('Notice / note text to attach to the contact'),
  type: z
    .string()
    .optional()
    .describe('Notice type (e.g. "default", "default-private"). System-types ("system*") are blocked. Default: "default".'),
  attachmentId: z.coerce.number().int().positive().optional().describe('Optional attachment file id'),});

const contactsAddNotice = defineTool({
  name: 'contacts_add_notice',
  description:
    'Add a new note/notice to a contact. Use this to record interactions ("Customer called", "Asked about refund", etc.). Notices are visible to staff in the backend UI. WRITE. (Internal — MCP-allowed)',
  annotations: { title: 'Add contact notice', readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  inputSchema: contactsAddNoticeInput,
  handler: async (input, api) => {
    const { iCustomer, ...body } = input;
    const url = `/v1/customer/${iCustomer}/notices`;
    return api.post(url, body);
  },
});

// ── contacts_create / update / delete ───────────────────────────
// Backed by POST/PATCH/DELETE /v1/contact (Internal, MCP-allowed).
// Mirror of WebCore SellerController._SetContact behavior.
const contactWritableFields = z.object({
  gender: z.string().optional().describe('e.g. "M", "F", "" (empty = unset)'),
  companyName: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  birthday: z.string().optional().describe('ISO yyyy-MM-dd or dd.MM.yyyy'),
  emailAddress: z.string().email().optional(),
  website: z.string().optional(),
  phone1: z.string().optional().describe('Server-side normalized via Helper.ParsePhonenumber'),
  phone2: z.string().optional(),
  address1: z.string().optional(),
  address2: z.string().optional(),
  zip: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional().describe('ISO country code (e.g. "DE"). Used as fallback for phone normalization.'),
  language: z.string().optional(),
  ustId: z.string().optional(),
  internalNote: z.string().optional().describe('Free-form note attached as a notice entry'),
  newsletterSeller: coerceBool().optional().describe('Whether the contact opts in to seller newsletter'),
  customFields: z
    .record(z.string(), z.string())
    .optional()
    .describe('Dynamic CustomerField values. Keys are iCustomerField ids as strings, values are the field content.'),
});

const contactsCreateInput = contactWritableFields.extend({});

// Identity gate: the real endpoint (CoreApi ContactController.CreateContact) requires AT LEAST ONE of
// these four — NOT all of them, and NOT gender (the stricter jQuery rules in the WebCore ContactDetail
// view are not what the API enforces). Mirror the endpoint, not the legacy form. See
// docs/plans/aitools-mcp-annotation-rollout.md.
const IDENTITY_FIELDS = ['firstName', 'lastName', 'emailAddress', 'companyName'] as const;
const IDENTITY_PROMPTS: MissingField[] = [
  { field: 'firstName', question: 'Wie lautet der Vorname?', primitive: { type: 'string', title: 'Vorname' } },
  { field: 'lastName', question: 'Wie lautet der Nachname?', primitive: { type: 'string', title: 'Nachname' } },
  { field: 'emailAddress', question: 'Wie lautet die E-Mail-Adresse?', primitive: { type: 'string', title: 'E-Mail' } },
  { field: 'companyName', question: 'Wie lautet der Firmenname?', primitive: { type: 'string', title: 'Firma' } },
];

function hasIdentity(input: Record<string, unknown>): boolean {
  return IDENTITY_FIELDS.some((f) => typeof input[f] === 'string' && (input[f] as string).trim() !== '');
}

const IDENTITY_MESSAGE = 'Für den neuen Kontakt fehlt eine Angabe — bitte mindestens Vor-/Nachname, E-Mail oder Firma angeben.';

const contactsCreate = defineTool({
  name: 'contacts_create',
  description:
    'Create a new contact (and underlying customer record). At least one of firstName, lastName, '
    + 'emailAddress or companyName is required — if none is given, ask the user (do not invent a name). '
    + 'WRITE. (Internal — MCP-allowed)',
  annotations: { title: 'Create contact', readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  inputSchema: contactsCreateInput,
  handler: async (input, api, ctx) => {
    if (!hasIdentity(input)) {
      // At-least-one-of rule → render all four as optional, then re-validate the merged result.
      const res = await resolveMissing(ctx, IDENTITY_MESSAGE, IDENTITY_PROMPTS, false);
      if (res.kind === 'gate' || res.kind === 'cancelled') return res.payload;
      if (res.kind === 'collected') {
        input = { ...input, ...res.values };
        if (!hasIdentity(input)) return needsInputPayload(IDENTITY_MESSAGE, IDENTITY_PROMPTS);
      }
    }
    return api.post('/v1/contact', input);
  },
});

const contactsUpdateInput = contactWritableFields.extend({
  iCustomer: z.coerce.number().int().positive().describe('Customer / contact id to update'),});

const contactsUpdate = defineTool({
  name: 'contacts_update',
  description:
    'Patch an existing contact. Only provided fields are written. WRITE. (Internal — MCP-allowed)',
  annotations: { title: 'Update contact', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  inputSchema: contactsUpdateInput,
  handler: async (input, api) => {
    const { iCustomer, ...body } = input;
    const url = `/v1/contact/${iCustomer}`;
    return api.patch(url, body);
  },
});

const contactsDeleteInput = z.object({
  iCustomer: z.coerce.number().int().positive().describe('Customer / contact id to delete'),});

const contactsDelete = defineTool({
  name: 'contacts_delete',
  description: 'Soft-delete a contact. WRITE. (Internal — MCP-allowed)',
  annotations: { title: 'Delete contact', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  inputSchema: contactsDeleteInput,
  handler: async (input, api) => {
    const url = `/v1/contact/${input.iCustomer}`;
    return api.delete(url);
  },
});

export const contactTools: ToolDefinition[] = [
  contactsSearch,
  contactsGet,
  contactsNoticesList,
  contactsAddNotice,
  contactsCreate,
  contactsUpdate,
  contactsDelete,
];
