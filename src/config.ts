export interface Config {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  userAgent: string;
}

// Default OAuth client built into the npm package — RFC 8252-style "public" client
// credentials for native apps. The secret is intentionally NOT confidential here:
// the security model relies on the user's own authorization-code login, not on
// keeping this secret out of the binary. End users install the package and use
// these defaults transparently; only the actual quinbook user-credentials are
// theirs.
//
// Override per session via QUINBOOK_OAUTH_CLIENT_ID / QUINBOOK_OAUTH_CLIENT_SECRET
// when needed (development, alternate OAuth apps, …).
const DEFAULT_CLIENT_ID = 'b868d7e0427d11f18f2ca8a1592feef4';
const DEFAULT_CLIENT_SECRET = 'REDACTED_OAUTH_CLIENT_SECRET';
const DEFAULT_BASE_URL = 'https://api.quinbook.com';

export function loadConfig(): Config {
  const baseUrl = (process.env.QUINBOOK_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const clientId = process.env.QUINBOOK_OAUTH_CLIENT_ID || DEFAULT_CLIENT_ID;
  const clientSecret = process.env.QUINBOOK_OAUTH_CLIENT_SECRET || DEFAULT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'OAuth credentials missing. The default credentials are bundled with the package; ' +
        'this error means the build is broken or the env overrides are set to empty strings.',
    );
  }

  return {
    baseUrl,
    clientId,
    clientSecret,
    userAgent: 'quinbook-mcp/0.1.0 (claude-via-mcp)',
  };
}
