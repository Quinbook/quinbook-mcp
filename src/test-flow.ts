import { loadConfig } from './config.js';
import { TokenManager } from './auth.js';
import { ApiClient } from './api-client.js';
import { buildAllTools } from './tools/index.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  process.stderr.write(`[test-flow] Base URL: ${cfg.baseUrl}\n`);
  process.stderr.write(`[test-flow] Client ID: ${cfg.clientId.slice(0, 8)}…\n`);

  const tokens = new TokenManager(cfg);
  const api = new ApiClient(cfg, tokens);

  const allTools = buildAllTools(tokens);
  process.stderr.write(`[test-flow] ${allTools.length} tools registered: ${allTools.map((t) => t.name).join(', ')}\n`);
  process.stderr.write('[test-flow] Triggering OAuth flow (browser will open if no cached token)…\n');

  const ordersList = allTools.find((t) => t.name === 'orders_list')!;
  const orders = await ordersList.handler({ offset: 0, limit: 2 }, api);
  process.stdout.write('\n=== orders_list (V2, limit=2) ===\n');
  process.stdout.write(JSON.stringify(orders, null, 2).slice(0, 2000) + '\n');

  const slotsCalendar = allTools.find((t) => t.name === 'slots_calendar')!;
  const today = new Date().toISOString().slice(0, 10);
  const cal = await slotsCalendar.handler({ date: today, lang: 'en', timezone: 'Europe/Berlin' }, api);
  process.stdout.write(`\n=== slots_calendar (${today}) ===\n`);
  process.stdout.write(JSON.stringify(cal, null, 2).slice(0, 1000) + '\n');
  process.stderr.write('\n[test-flow] Done.\n');
  process.exit(0);
}

main().catch((e) => {
  process.stderr.write(`[test-flow] FAIL: ${(e as Error).message}\n`);
  process.exit(1);
});
