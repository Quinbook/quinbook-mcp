import { ToolDefinition } from './types.js';
import { orderTools } from './orders.js';
import { slotTools } from './slots.js';
import { statisticsTools } from './statistics.js';

export const allTools: ToolDefinition[] = [
  ...orderTools,
  ...slotTools,
  ...statisticsTools,
];
