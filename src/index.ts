#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { TokenManager } from './auth.js';
import { ApiClient, ApiError } from './api-client.js';
import { allTools } from './tools/index.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const tokens = new TokenManager(cfg);
  const api = new ApiClient(cfg, tokens);

  const server = new McpServer({
    name: 'quinbook-mcp',
    version: '0.1.0',
  });

  for (const tool of allTools) {
    server.tool(
      tool.name,
      tool.description,
      (tool.inputSchema as any).shape ?? {},
      async (rawInput: unknown) => {
        try {
          const input = tool.inputSchema.parse(rawInput ?? {});
          const result = await tool.handler(input, api);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          };
        } catch (e) {
          const err = e as Error;
          const message =
            e instanceof ApiError
              ? `API error ${err.message}`
              : `${err.name}: ${err.message}`;
          return {
            isError: true,
            content: [{ type: 'text' as const, text: message }],
          };
        }
      },
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[quinbook-mcp] Connected. ${allTools.length} tools registered.\n`);
}

main().catch((e) => {
  process.stderr.write(`[quinbook-mcp] Fatal: ${(e as Error).message}\n`);
  process.exit(1);
});
