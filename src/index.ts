#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { TokenManager } from './auth.js';
import { ApiClient, ApiError } from './api-client.js';
import { buildAllTools } from './tools/index.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const tokens = new TokenManager(cfg);
  const api = new ApiClient(cfg, tokens);

  const server = new McpServer(
    {
      name: 'quinbook-mcp',
      version: '0.2.8',
    },
    {
      instructions: [
        'quinbook booking assistant — tools for the quinbook ticketing/booking system.',
        '',
        'Booking links: to give the user a clickable link that opens a booking in the quinbook seller backoffice, build the URL',
        '  https://quinbook.com/seller/bookings/order/{iOrder}',
        "using the order's numeric iOrder (returned by orders_get / orders_list). No token is required for this seller link.",
        '',
        'Write tools execute immediately — there is no dry-run/preview. Before calling any write tool (cart_*, orders_cancel, orders_record_payment, orders_patch_*, contacts_create/update/delete, …) summarise what you are about to do and get the user\'s explicit confirmation.',
        '',
        'This connector never executes outbound financial transactions: it cannot refund payments, and orders_cancel works only for orders without a payment. Cancelling or refunding a paid order must be done by staff in the quinbook backoffice.',
        'When the user asks for something this connector is not allowed to do — refunding a payment, or cancelling/modifying an order that has already been paid — do NOT attempt it. Instead reply with the booking link (https://quinbook.com/seller/bookings/order/{iOrder}) so the user can open the order and complete the action themselves in the backoffice. Hand off the link to click or copy; never call a money-moving endpoint yourself.',
        '',
        'Never invent, guess, or derive values that the user is expected to provide — especially names, labels or descriptions (e.g. a coupon/voucher name; do not fabricate something like "Gutschein 50 €"). If such a value is missing, ASK the user for it instead of making one up or putting it into a preview. Ask naturally and conversationally — and do NOT explain to the user that you are not allowed to invent values; simply ask the question.',
      ].join('\n'),
    },
  );

  const allTools = buildAllTools(tokens);
  for (const tool of allTools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: (tool.inputSchema as any).shape ?? {},
        ...(tool.annotations ? { annotations: tool.annotations } : {}),
      },
      async (rawInput: unknown) => {
        try {
          const input = tool.inputSchema.parse(rawInput ?? {});
          // Per-call context: client capabilities are only known after the initialize handshake,
          // so resolve elicitation support here (not at tool-registration time).
          const ctx = {
            clientSupportsElicitation: !!server.server.getClientCapabilities()?.elicitation,
            elicit: (params: { message: string; requestedSchema: unknown }) =>
              server.server.elicitInput(params as any) as Promise<any>,
          };
          const result = await tool.handler(input, api, ctx);
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
