export interface Config {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  userAgent: string;
}

export function loadConfig(): Config {
  const baseUrl = (process.env.QUINBOOK_API_BASE_URL || 'https://api.quinbook.com').replace(/\/+$/, '');
  const clientId = process.env.QUINBOOK_OAUTH_CLIENT_ID || '';
  const clientSecret = process.env.QUINBOOK_OAUTH_CLIENT_SECRET || '';

  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing OAuth credentials. Set QUINBOOK_OAUTH_CLIENT_ID and QUINBOOK_OAUTH_CLIENT_SECRET in the MCP server env.',
    );
  }

  return {
    baseUrl,
    clientId,
    clientSecret,
    userAgent: 'quinbook-mcp/0.1.0 (claude-via-mcp)',
  };
}
