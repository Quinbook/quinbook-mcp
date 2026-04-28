import { z } from 'zod';
import { defineTool, ToolDefinition } from './types.js';

const couponsGetInput = z.object({
  id: z.coerce.number().int().positive().describe('Coupon id'),
});

const couponsGet = defineTool({
  name: 'coupons_get',
  description: 'Fetch a single coupon by id. Requires LIST-CASHCOUPONS permission.',
  inputSchema: couponsGetInput,
  handler: async (input, api) => api.get(`/v1/coupons/${input.id}`),
});

const couponsFindInput = z.object({
  code: z.string().min(1).describe('Coupon code to look up'),
});

const couponsFind = defineTool({
  name: 'coupons_find',
  description: 'Find a coupon by its code (e.g. when validating a customer-entered code).',
  inputSchema: couponsFindInput,
  handler: async (input, api) => api.get(`/v1/coupons/find/${encodeURIComponent(input.code)}`),
});

const couponsUsedInput = z.object({
  iCoupon: z.coerce.number().int().positive().describe('Coupon id'),
});

const couponsUsed = defineTool({
  name: 'coupons_used',
  description: 'Get usage history of a coupon — orders that consumed it.',
  inputSchema: couponsUsedInput,
  handler: async (input, api) => api.get(`/v1/coupons/${input.iCoupon}/used`),
});

export const couponTools: ToolDefinition[] = [couponsGet, couponsFind, couponsUsed];
