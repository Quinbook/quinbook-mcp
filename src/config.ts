export interface Config {
  baseUrl: string;
  clientId: string;
  userAgent: string;
}

// Default OAuth client built into the npm package — public client per RFC 8252.
// PKCE (RFC 7636) replaces the client_secret as the proof mechanism, so there is
// no secret to keep. The client_id is a public identifier and safe to ship in
// the published package.
//
// Override per session via QUINBOOK_OAUTH_CLIENT_ID when needed (development,
// alternate OAuth apps, …).
const DEFAULT_CLIENT_ID = 'b868d7e0427d11f18f2ca8a1592feef4';
const DEFAULT_BASE_URL = 'https://api.quinbook.com';

export function loadConfig(): Config {
  const baseUrl = (process.env.QUINBOOK_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const clientId = process.env.QUINBOOK_OAUTH_CLIENT_ID || DEFAULT_CLIENT_ID;

  if (!clientId) {
    throw new Error(
      'OAuth client_id missing. The default is bundled with the package; ' +
        'this error means the build is broken or QUINBOOK_OAUTH_CLIENT_ID is set to an empty string.',
    );
  }

  return {
    baseUrl,
    clientId,
    userAgent: 'quinbook-mcp/0.2.0 (claude-via-mcp)',
  };
}
