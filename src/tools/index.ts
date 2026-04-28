import { ToolDefinition } from './types.js';
import { slotTools } from './slots.js';
import { orderTools } from './orders.js';
import { couponTools } from './coupons.js';
import { buildMeTools } from './me.js';
import { TokenManager } from '../auth.js';

export function buildAllTools(tokens: TokenManager): ToolDefinition[] {
  return [
    ...buildMeTools(tokens),
    ...slotTools,
    ...orderTools,
    ...couponTools,
  ];
}
