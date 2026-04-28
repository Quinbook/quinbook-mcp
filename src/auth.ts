import * as crypto from 'crypto';
import { URL } from 'url';
import open from 'open';
import keytar from 'keytar';
import axios from 'axios';
import { Config } from './config.js';

const POLLING_REDIRECT_URI = 'urn:woizzer:polling';
const POLLING_TIMEOUT_MS = 10 * 60 * 1000;
const POLLING_INTERVAL_MS = 2000;

const KEYTAR_SERVICE = 'quinbook-mcp';

export interface TokenSet {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

interface JwtClaims {
  icompany?: string;
  g?: string;
  session?: string;
  exp?: number;
  nbf?: number;
  [k: string]: unknown;
}

export function decodeJwt(token: string): JwtClaims {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return {};
    return JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8')) as JwtClaims;
  } catch {
    return {};
  }
}

function hostKey(cfg: Config): string {
  return `${new URL(cfg.baseUrl).host}::${cfg.clientId}`;
}

function tokenKey(cfg: Config, iCompany: number): string {
  return `${hostKey(cfg)}::${iCompany}`;
}

function activeKey(cfg: Config): string {
  return `${hostKey(cfg)}::active`;
}

async function loadTokensForCompany(cfg: Config, iCompany: number): Promise<TokenSet | null> {
  const raw = await keytar.getPassword(KEYTAR_SERVICE, tokenKey(cfg, iCompany));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TokenSet;
  } catch {
    return null;
  }
}

async function saveTokensForCompany(cfg: Config, iCompany: number, tokens: TokenSet): Promise<void> {
  await keytar.setPassword(KEYTAR_SERVICE, tokenKey(cfg, iCompany), JSON.stringify(tokens));
}

async function clearTokensForCompany(cfg: Config, iCompany: number): Promise<void> {
  await keytar.deletePassword(KEYTAR_SERVICE, tokenKey(cfg, iCompany));
}

async function loadActiveCompany(cfg: Config): Promise<number | null> {
  const raw = await keytar.getPassword(KEYTAR_SERVICE, activeKey(cfg));
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function saveActiveCompany(cfg: Config, iCompany: number): Promise<void> {
  await keytar.setPassword(KEYTAR_SERVICE, activeKey(cfg), String(iCompany));
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function tokenSetFromResponse(data: any, fallbackRefresh?: string): TokenSet {
  const expiresIn: number = typeof data.expires_in === 'number' ? data.expires_in : 3600;
  return {
    access_token: data.access_token || data.token,
    refresh_token: data.refresh_token || fallbackRefresh || '',
    expires_at: nowSec() + Math.max(60, expiresIn - 30),
  };
}

function companyFromToken(tokens: TokenSet): number | null {
  const claims = decodeJwt(tokens.access_token);
  if (!claims.icompany) return null;
  const n = Number(claims.icompany);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function exchangeCode(cfg: Config, code: string, redirectUri: string): Promise<TokenSet> {
  const res = await axios.post(
    `${cfg.baseUrl}/v1/auth/token`,
    {
      grant_type: 'authorization_code',
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      redirect_uri: redirectUri,
      device_type: 'mcp',
      device_info: cfg.userAgent,
    },
    { headers: { 'User-Agent': cfg.userAgent } },
  );
  return tokenSetFromResponse(res.data);
}

async function refreshTokens(cfg: Config, refreshToken: string): Promise<TokenSet> {
  const res = await axios.post(
    `${cfg.baseUrl}/v1/auth/token`,
    {
      grant_type: 'refresh_token',
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: refreshToken,
    },
    { headers: { 'User-Agent': cfg.userAgent } },
  );
  return tokenSetFromResponse(res.data, refreshToken);
}

async function awaitViaPolling(cfg: Config): Promise<{ code: string; redirectUri: string }> {
  const pollingToken = crypto.randomUUID();
  const state = crypto.randomBytes(16).toString('hex');

  const authUrl = new URL(`${cfg.baseUrl}/v1/auth/authorize`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', cfg.clientId);
  authUrl.searchParams.set('redirect_uri', POLLING_REDIRECT_URI);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('auth_mode', 'user');
  authUrl.searchParams.set('polling_token', pollingToken);

  process.stderr.write(
    `[quinbook-mcp] Polling-mode login. Opening browser: ${authUrl.toString()}\n`,
  );
  open(authUrl.toString()).catch((e) => {
    process.stderr.write(`[quinbook-mcp] Failed to open browser: ${(e as Error).message}\n`);
  });

  const pollUrl = `${cfg.baseUrl}/v1/auth/poll`;
  const deadline = Date.now() + POLLING_TIMEOUT_MS;
  let attempt = 0;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, attempt === 0 ? 1000 : POLLING_INTERVAL_MS));
    attempt += 1;

    const res = await axios.get(pollUrl, {
      params: { polling_token: pollingToken },
      headers: { 'User-Agent': cfg.userAgent, Accept: 'application/json' },
      validateStatus: () => true,
      timeout: 10_000,
    });

    if (res.status >= 500) {
      process.stderr.write(`[quinbook-mcp] Poll server error ${res.status}, retrying…\n`);
      continue;
    }
    if (res.status >= 400) {
      throw new Error(`OAuth poll failed with status ${res.status}: ${JSON.stringify(res.data)}`);
    }

    const body = res.data;
    if (body && body.status === 'pending') continue;

    if (body && typeof body.code === 'string' && body.code.length > 0) {
      const returnedState = typeof body.state === 'string' ? body.state : '';
      if (returnedState && returnedState !== state) {
        throw new Error('OAuth poll: state mismatch');
      }
      const redirectUri = typeof body.redirect_uri === 'string' ? body.redirect_uri : POLLING_REDIRECT_URI;
      return { code: body.code, redirectUri };
    }

    throw new Error(`OAuth poll: unexpected response: ${JSON.stringify(body)}`);
  }

  throw new Error('OAuth poll timed out — login not completed within 10 minutes.');
}

async function interactiveLogin(cfg: Config): Promise<TokenSet> {
  const { code, redirectUri } = await awaitViaPolling(cfg);
  return exchangeCode(cfg, code, redirectUri);
}

export class TokenManager {
  private cached: TokenSet | null = null;
  private cachedCompany: number | null = null;
  private inflight: Promise<TokenSet> | null = null;

  constructor(private readonly cfg: Config) {}

  async getAccessToken(): Promise<string> {
    const tokens = await this.ensureValidTokens();
    return tokens.access_token;
  }

  async getActiveCompany(): Promise<number | null> {
    if (this.cachedCompany) return this.cachedCompany;
    const stored = await loadActiveCompany(this.cfg);
    this.cachedCompany = stored;
    return stored;
  }

  async getCurrentClaims(): Promise<JwtClaims> {
    const tokens = await this.ensureValidTokens();
    return decodeJwt(tokens.access_token);
  }

  async forceRefresh(): Promise<void> {
    this.cached = null;
    const active = await this.getActiveCompany();
    if (active) await clearTokensForCompany(this.cfg, active);
  }

  /**
   * Switch the active company by exchanging the current bearer token via
   * grant_type=switch_company. Stores the resulting token under the new
   * company-id key and updates the active pointer.
   */
  async switchCompany(targetCompanyId: number): Promise<TokenSet> {
    if (!Number.isFinite(targetCompanyId) || targetCompanyId <= 0) {
      throw new Error(`Invalid company id: ${targetCompanyId}`);
    }
    const currentTokens = await this.ensureValidTokens();
    const res = await axios.post(
      `${this.cfg.baseUrl}/v1/auth/token`,
      { grant_type: 'switch_company', company_id: targetCompanyId },
      {
        headers: {
          Authorization: `Bearer ${currentTokens.access_token}`,
          'Content-Type': 'application/json',
          'User-Agent': this.cfg.userAgent,
        },
        validateStatus: () => true,
      },
    );
    if (res.status >= 400) {
      throw new Error(`switch_company failed (${res.status}): ${JSON.stringify(res.data)}`);
    }
    // Server returns access_token but no refresh_token → keep the existing one.
    const newTokens = tokenSetFromResponse(res.data, currentTokens.refresh_token);
    const realCompany = companyFromToken(newTokens) ?? targetCompanyId;
    await saveTokensForCompany(this.cfg, realCompany, newTokens);
    await saveActiveCompany(this.cfg, realCompany);
    this.cached = newTokens;
    this.cachedCompany = realCompany;
    return newTokens;
  }

  private async ensureValidTokens(): Promise<TokenSet> {
    if (this.inflight) return this.inflight;

    this.inflight = (async () => {
      let active = this.cachedCompany ?? (await loadActiveCompany(this.cfg));

      // Fast path: in-memory cached token still valid for active company
      if (
        this.cached &&
        this.cachedCompany === active &&
        this.cached.expires_at > nowSec()
      ) {
        return this.cached;
      }

      let tokens: TokenSet | null = null;
      if (active) tokens = await loadTokensForCompany(this.cfg, active);

      if (tokens && tokens.expires_at > nowSec()) {
        this.cached = tokens;
        this.cachedCompany = active;
        return tokens;
      }

      if (tokens && tokens.refresh_token) {
        try {
          const refreshed = await refreshTokens(this.cfg, tokens.refresh_token);
          const company = companyFromToken(refreshed) ?? active!;
          await saveTokensForCompany(this.cfg, company, refreshed);
          await saveActiveCompany(this.cfg, company);
          this.cached = refreshed;
          this.cachedCompany = company;
          return refreshed;
        } catch (e) {
          process.stderr.write(
            `[quinbook-mcp] Refresh failed, falling back to interactive login: ${(e as Error).message}\n`,
          );
        }
      }

      const fresh = await interactiveLogin(this.cfg);
      const company = companyFromToken(fresh);
      if (!company) {
        throw new Error('Login succeeded but JWT did not contain icompany claim.');
      }
      await saveTokensForCompany(this.cfg, company, fresh);
      await saveActiveCompany(this.cfg, company);
      this.cached = fresh;
      this.cachedCompany = company;
      return fresh;
    })();

    try {
      return await this.inflight;
    } finally {
      this.inflight = null;
    }
  }
}
