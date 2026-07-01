#!/usr/bin/env node
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { loadConfig, Config } from './config.js';
import { ApiClient } from './api-client.js';
import { SessionTokenManager } from './token-session.js';
import { createMcpServer } from './mcp-server.js';

/**
 * Remote HTTP entry point for the quinbook connector (Anthropic Connectors
 * Directory). Hosts the MCP Streamable-HTTP transport and authenticates every
 * request via a pass-through OAuth bearer (see token-session.ts). The tool layer
 * is shared verbatim with the local stdio connector (mcp-server.ts).
 */

const MCP_PATH = '/mcp';

interface Session {
  transport: StreamableHTTPServerTransport;
  tokens: SessionTokenManager;
}

const sessions = new Map<string, Session>();

function remoteConfig(): Config & { publicUrl: string; port: number } {
  const base = loadConfig();
  const publicUrl = (process.env.MCP_PUBLIC_URL || 'https://mcp.quinbook.com').replace(/\/+$/, '');
  const port = Number(process.env.PORT) || 8787;
  return {
    ...base,
    // Keep the `claude-via-mcp` marker so the CoreApi McpAccessMiddleware
    // governance (no_mcp=Y) recognises remote traffic too.
    userAgent: 'quinbook-mcp/0.2.9-remote (claude-via-mcp)',
    publicUrl,
    port,
  };
}

const CFG = remoteConfig();

function protectedResourceMetadata() {
  return {
    resource: CFG.publicUrl,
    authorization_servers: [CFG.baseUrl],
    scopes_supported: ['mcp'],
    bearer_methods_supported: ['header'],
  };
}

function bearerFrom(req: http.IncomingMessage): string | null {
  const h = req.headers['authorization'];
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(Array.isArray(h) ? h[0] : h);
  return m ? m[1].trim() : null;
}

function setCors(req: http.IncomingMessage, res: http.ServerResponse): void {
  const origin = (req.headers.origin as string) || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, mcp-session-id, mcp-protocol-version, last-event-id',
  );
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, www-authenticate');
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(payload);
}

function sendUnauthorized(res: http.ServerResponse): void {
  const metadataUrl = `${CFG.publicUrl}/.well-known/oauth-protected-resource`;
  res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${metadataUrl}"`);
  sendJson(res, 401, {
    jsonrpc: '2.0',
    error: { code: -32001, message: 'Authentication required' },
    id: null,
  });
}

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > 4 * 1024 * 1024) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

async function handleMcp(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const bearer = bearerFrom(req);
  if (!bearer) {
    sendUnauthorized(res);
    return;
  }

  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  // Existing session: refresh its base bearer and hand off to its transport.
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    session.tokens.setBaseBearer(bearer);
    const body = req.method === 'POST' ? await readJsonBody(req) : undefined;
    await session.transport.handleRequest(req, res, body);
    return;
  }

  // New session: only valid on a POST whose body is an `initialize` request.
  if (req.method === 'POST') {
    const body = await readJsonBody(req);
    if (isInitializeRequest(body)) {
      const tokens = new SessionTokenManager(CFG, bearer);
      const api = new ApiClient(CFG, tokens);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id: string) => {
          sessions.set(id, { transport, tokens });
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) sessions.delete(transport.sessionId);
      };
      const server = createMcpServer(api, tokens);
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
      return;
    }
    sendJson(res, 400, {
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Bad Request: no valid session id and not an initialize request' },
      id: null,
    });
    return;
  }

  // GET/DELETE without a known session id.
  sendJson(res, 400, {
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Bad Request: missing or unknown mcp-session-id' },
    id: null,
  });
}

const httpServer = http.createServer((req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname;

  if (path === '/.well-known/oauth-protected-resource' && req.method === 'GET') {
    sendJson(res, 200, protectedResourceMetadata());
    return;
  }

  if (path === '/healthz' && req.method === 'GET') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (path === MCP_PATH) {
    handleMcp(req, res).catch((e) => {
      process.stderr.write(`[quinbook-mcp-remote] handler error: ${(e as Error).message}\n`);
      if (!res.headersSent) {
        sendJson(res, 500, {
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    });
    return;
  }

  sendJson(res, 404, { error: 'not found' });
});

httpServer.listen(CFG.port, () => {
  process.stderr.write(
    `[quinbook-mcp-remote] listening on :${CFG.port} — resource=${CFG.publicUrl} auth-server=${CFG.baseUrl}\n`,
  );
});
