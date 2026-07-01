#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { TokenManager } from './auth.js';
import { ApiClient } from './api-client.js';
import { createMcpServer } from './mcp-server.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const tokens = new TokenManager(cfg);
  const api = new ApiClient(cfg, tokens);

  const server = createMcpServer(api, tokens);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[quinbook-mcp] Connected (stdio).\n');
}

main().catch((e) => {
  process.stderr.write(`[quinbook-mcp] Fatal: ${(e as Error).message}\n`);
  process.exit(1);
});
