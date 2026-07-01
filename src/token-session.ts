import axios from 'axios';
import { Config } from './config.js';
import { ITokenManager, JwtClaims, TokenSet, decodeJwt } from './auth.js';

/**
 * Raised when the remote connector has no usable token for the current request.
 * ApiClient calls forceRefresh() on a 401; for the pass-through connector there
 * is nothing to refresh (Claude, the OAuth client, owns the refresh token), so
 * we surface this and let the HTTP layer answer with 401 + WWW-Authenticate so
 * Claude re-runs the OAuth flow.
 */
export class UnauthorizedError extends Error {
  constructor(message = 'authentication required') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Per-session, pass-through token manager for the remote HTTP connector.
 *
 * Auth model: Claude authenticates the user against the quinbook OAuth server
 * directly and sends the resulting quinbook JWT as `Authorization: Bearer` on
 * every request. This class simply holds that bearer and forwards it — it never
 * persists a token to disk and never stores a refresh token. That is the whole
 * point of pass-through: no server-side custody of customer credentials.
 *
 * Two token sources are tracked:
 *  - `base`: the bearer from the incoming request header, refreshed by the HTTP
 *    layer on every request (so Claude's own token refresh flows through).
 *  - `override`: a company-scoped token minted by me_switch_company. Once the
 *    user has switched company within a session, that choice is sticky and wins
 *    over the header bearer for the rest of the session.
 */
export class SessionTokenManager implements ITokenManager {
  private base: string;
  private override: string | null = null;

  constructor(
    private readonly cfg: Config,
    initialBearer: string,
  ) {
    this.base = initialBearer;
  }

  /** Refresh the header-derived bearer (called by the HTTP layer per request). */
  setBaseBearer(bearer: string): void {
    if (bearer) this.base = bearer;
  }

  private current(): string {
    return this.override ?? this.base;
  }

  async getAccessToken(): Promise<string> {
    const token = this.current();
    if (!token) throw new UnauthorizedError();
    return token;
  }

  async getActiveCompany(): Promise<number | null> {
    const c = decodeJwt(this.current()).icompany;
    return c ? Number(c) : null;
  }

  async getCurrentClaims(): Promise<JwtClaims> {
    return decodeJwt(this.current());
  }

  async forceRefresh(): Promise<void> {
    // Pass-through: nothing to refresh here. Signal re-authentication.
    throw new UnauthorizedError('token expired or invalid; re-authentication required');
  }

  async switchCompany(targetCompanyId: number): Promise<TokenSet> {
    if (!Number.isFinite(targetCompanyId) || targetCompanyId <= 0) {
      throw new Error(`Invalid company id: ${targetCompanyId}`);
    }
    const res = await axios.post(
      `${this.cfg.baseUrl}/v1/auth/token`,
      { grant_type: 'switch_company', company_id: targetCompanyId },
      {
        headers: {
          Authorization: `Bearer ${this.current()}`,
          'Content-Type': 'application/json',
          'User-Agent': this.cfg.userAgent,
        },
        validateStatus: () => true,
      },
    );
    if (res.status >= 400) {
      throw new Error(`switch_company failed (${res.status}): ${JSON.stringify(res.data)}`);
    }
    const access = (res.data as { access_token?: unknown })?.access_token;
    if (typeof access !== 'string' || !access) {
      throw new Error('switch_company returned no access_token');
    }
    // Session-memory only: the switched token wins for the rest of this session.
    this.override = access;
    const claims = decodeJwt(access);
    return {
      access_token: access,
      refresh_token: '',
      expires_at: typeof claims.exp === 'number' ? claims.exp : 0,
    };
  }
}
