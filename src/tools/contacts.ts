import { z } from 'zod';
import { defineTool, ToolDefinition, dryRunField, dryRunPreview } from './types.js';

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
  attachmentId: z.coerce.number().int().positive().optional().describe('Optional attachment file id'),
  dryRun: dryRunField,
});

const contactsAddNotice = defineTool({
  name: 'contacts_add_notice',
  description:
    'Add a new note/notice to a contact. Use this to record interactions ("Customer called", "Asked about refund", etc.). Notices are visible to staff in the backend UI. WRITE — defaults to dryRun. (Internal — MCP-allowed)',
  inputSchema: contactsAddNoticeInput,
  handler: async (input, api) => {
    const { dryRun, iCustomer, ...body } = input;
    const url = `/v1/customer/${iCustomer}/notices`;
    if (dryRun) return dryRunPreview('POST', url, body);
    return api.post(url, body);
  },
});

export const contactTools: ToolDefinition[] = [
  contactsSearch,
  contactsGet,
  contactsNoticesList,
  contactsAddNotice,
];
