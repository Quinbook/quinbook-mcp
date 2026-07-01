import { ToolDefinition } from './types.js';
import { slotTools } from './slots.js';
import { orderTools } from './orders.js';
import { couponTools } from './coupons.js';
import { couponWriteTools } from './coupons_write.js';
import { contactTools } from './contacts.js';
import { buildMeTools } from './me.js';
import { cartWriteTools } from './cart_write.js';
import { orderWriteTools } from './orders_write.js';
import { ITokenManager } from '../auth.js';

export function buildAllTools(tokens: ITokenManager): ToolDefinition[] {
  return [
    ...buildMeTools(tokens),
    ...slotTools,
    ...orderTools,
    ...couponTools,
    ...couponWriteTools,
    ...contactTools,
    ...cartWriteTools,
    ...orderWriteTools,
  ];
}
