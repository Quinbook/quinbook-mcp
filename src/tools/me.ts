import { z } from 'zod';
import { defineTool, ToolDefinition } from './types.js';
import { TokenManager, decodeJwt } from '../auth.js';

const meWhoamiInput = z.object({});

function buildWhoami(tokens: TokenManager): ToolDefinition {
  return defineTool({
    name: 'me_whoami',
    description:
      'Quick identity check: returns the active company id, user id, grant type, roles and session id. Reads the cached JWT — no API call. Useful as the first call to know which company the next operation will target.',
    inputSchema: meWhoamiInput,
    handler: async () => {
      const access = await tokens.getAccessToken();
      const claims = decodeJwt(access);
      return {
        iCompany: claims.icompany ? Number(claims.icompany) : null,
        iCustomer:
          (claims as any)['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'] ??
          (claims as any).nameid ??
          null,
        grantType: claims.g ?? null,
        session: claims.session ?? null,
        roles:
          (claims as any)['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ??
          (claims as any).role ??
          null,
        expiresAt: claims.exp ? new Date(claims.exp * 1000).toISOString() : null,
      };
    },
  });
}

const meCompaniesInput = z.object({
  search: z
    .string()
    .min(1)
    .optional()
    .describe('Optional case-insensitive substring filter on company name. Useful when the user has many companies.'),
});

const meCompanies = defineTool({
  name: 'me_companies',
  description:
    'List companies the authenticated user can switch to. Compact projection: id, name, city, country, timezone, isSelected. Use this when the user asks to switch company or you need to disambiguate which company to operate against.',
  inputSchema: meCompaniesInput,
  handler: async (input, api) => {
    const params: Record<string, unknown> = { compact: true };
    if (input.search) params.search = input.search;
    return api.get('/v1/me', params);
  },
});

const meSwitchCompanyInput = z.object({
  iCompany: z.coerce.number().int().positive().describe('Target company id (i_customer of the company)'),
});

function buildSwitchCompany(tokens: TokenManager): ToolDefinition {
  return defineTool({
    name: 'me_switch_company',
    description:
      'Switch the active company. The MCP server obtains a new access token bound to the target company via grant_type=switch_company and uses it for all subsequent tool calls. Use this once before running tools against a different company.',
    inputSchema: meSwitchCompanyInput,
    handler: async (input) => {
      const newTokens = await tokens.switchCompany(input.iCompany);
      const claims = decodeJwt(newTokens.access_token);
      return {
        ok: true,
        activeCompany: claims.icompany ? Number(claims.icompany) : input.iCompany,
        expiresAt: claims.exp ? new Date(claims.exp * 1000).toISOString() : null,
      };
    },
  });
}

export function buildMeTools(tokens: TokenManager): ToolDefinition[] {
  return [buildWhoami(tokens), meCompanies, buildSwitchCompany(tokens)];
}
