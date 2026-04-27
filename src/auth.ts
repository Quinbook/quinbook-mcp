import * as http from 'http';
import * as crypto from 'crypto';
import { URL } from 'url';
import open from 'open';
import keytar from 'keytar';
import axios from 'axios';
import { Config } from './config.js';

const KEYTAR_SERVICE = 'quinbook-mcp';

interface TokenSet {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

function accountKey(cfg: Config): string {
  return `${new URL(cfg.baseUrl).host}::${cfg.clientId}`;
}

async function loadTokens(cfg: Config): Promise<TokenSet | null> {
  const raw = await keytar.getPassword(KEYTAR_SERVICE, accountKey(cfg));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TokenSet;
  } catch {
    return null;
  }
}

async function saveTokens(cfg: Config, tokens: TokenSet): Promise<void> {
  await keytar.setPassword(KEYTAR_SERVICE, accountKey(cfg), JSON.stringify(tokens));
}

async function clearTokens(cfg: Config): Promise<void> {
  await keytar.deletePassword(KEYTAR_SERVICE, accountKey(cfg));
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function tokenSetFromResponse(data: any): TokenSet {
  const expiresIn: number = typeof data.expires_in === 'number' ? data.expires_in : 3600;
  return {
    access_token: data.access_token || data.token,
    refresh_token: data.refresh_token,
    expires_at: nowSec() + Math.max(60, expiresIn - 30),
  };
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
  return tokenSetFromResponse(res.data);
}

interface LoopbackResult {
  code: string;
  state: string;
  redirectUri: string;
}

function startLoopbackServer(expectedState: string): Promise<LoopbackResult> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url || '/', 'http://127.0.0.1');
        if (url.pathname !== '/callback') {
          res.writeHead(404).end();
          return;
        }
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`<html><body><h1>OAuth error</h1><pre>${error}</pre></body></html>`);
          server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }
        if (!code || !state || state !== expectedState) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<html><body><h1>Invalid OAuth callback</h1></body></html>');
          server.close();
          reject(new Error('Invalid OAuth callback (missing/invalid state)'));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          '<html><body><h1>quinbook MCP — login complete</h1><p>You can close this window.</p></body></html>',
        );
        const port = (server.address() as any).port;
        server.close();
        resolve({ code, state, redirectUri: `http://127.0.0.1:${port}/callback` });
      } catch (e) {
        reject(e as Error);
      }
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1');
  });
}

async function interactiveLogin(cfg: Config): Promise<TokenSet> {
  const state = crypto.randomBytes(16).toString('hex');

  const tempServer = http.createServer();
  await new Promise<void>((resolve) => tempServer.listen(0, '127.0.0.1', resolve));
  const port = (tempServer.address() as any).port;
  tempServer.close();
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  const loopback = startLoopbackServer(state);

  const authUrl = new URL(`${cfg.baseUrl}/v1/auth/authorize`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', cfg.clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('auth_mode', 'user');

  process.stderr.write(`[quinbook-mcp] Opening browser for OAuth login: ${authUrl.toString()}\n`);
  await open(authUrl.toString());

  const result = await loopback;
  return exchangeCode(cfg, result.code, redirectUri);
}

export class TokenManager {
  private cached: TokenSet | null = null;
  private inflight: Promise<TokenSet> | null = null;

  constructor(private readonly cfg: Config) {}

  async getAccessToken(): Promise<string> {
    const tokens = await this.ensureValidTokens();
    return tokens.access_token;
  }

  async forceRefresh(): Promise<void> {
    this.cached = null;
    await clearTokens(this.cfg);
  }

  private async ensureValidTokens(): Promise<TokenSet> {
    if (this.inflight) return this.inflight;

    this.inflight = (async () => {
      let tokens = this.cached || (await loadTokens(this.cfg));

      if (tokens && tokens.expires_at > nowSec()) {
        this.cached = tokens;
        return tokens;
      }

      if (tokens && tokens.refresh_token) {
        try {
          const refreshed = await refreshTokens(this.cfg, tokens.refresh_token);
          await saveTokens(this.cfg, refreshed);
          this.cached = refreshed;
          return refreshed;
        } catch (e) {
          process.stderr.write(`[quinbook-mcp] Refresh failed, falling back to interactive login: ${(e as Error).message}\n`);
        }
      }

      const fresh = await interactiveLogin(this.cfg);
      await saveTokens(this.cfg, fresh);
      this.cached = fresh;
      return fresh;
    })();

    try {
      return await this.inflight;
    } finally {
      this.inflight = null;
    }
  }
}
