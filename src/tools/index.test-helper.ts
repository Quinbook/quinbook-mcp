// Test helper: build the full tool list with a dummy TokenManager so the schemas
// (which is all the tests care about) are accessible without going through the
// real keytar/OAuth flow.

import { ToolDefinition } from './types.js';
import { slotTools } from './slots.js';
import { orderTools } from './orders.js';
import { couponTools } from './coupons.js';
import { buildMeTools } from './me.js';
import { cartWriteTools } from './cart_write.js';
import { orderWriteTools } from './orders_write.js';
import { contactTools } from './contacts.js';

// Stub TokenManager — the test only inspects schemas, never invokes handlers.
const stubTokens: any = {
  getAccessToken: async () => '',
  getActiveCompany: async () => null,
  getCurrentClaims: async () => ({}),
  forceRefresh: async () => {},
  switchCompany: async () => null,
};

export const allTools: ToolDefinition[] = [
  ...buildMeTools(stubTokens),
  ...slotTools,
  ...orderTools,
  ...couponTools,
  ...contactTools,
  ...cartWriteTools,
  ...orderWriteTools,
];
