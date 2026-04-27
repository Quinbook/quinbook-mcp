import { ToolDefinition } from './types.js';
import { slotTools } from './slots.js';
import { orderTools } from './orders.js';
import { couponTools } from './coupons.js';

export const allTools: ToolDefinition[] = [
  ...slotTools,
  ...orderTools,
  ...couponTools,
];
