import { z } from 'zod';
import { defineTool, ToolDefinition, coerceBool } from './types.js';

const ordersListInput = z.object({
  search: z.string().optional().describe('Free-text search (customer name, order number, etc.)'),
  offset: z.coerce.number().int().min(0).default(0).describe('Pagination offset'),
  limit: z.coerce.number().int().min(1).max(100).default(50).describe('Page size (max 100)'),
  status: z.string().optional().describe('Filter by order status'),
  paymentHandler: z.string().optional().describe('Filter by payment handler (e.g. paypal, stripe, onsite)'),
  dateFrom: z.string().optional().describe('ISO 8601 — created after this date'),
  dateTo: z.string().optional().describe('ISO 8601 — created before this date'),
  sort: z.enum(['created_at', 'service_at', 'total']).optional().describe('Sort field'),
  direction: z.enum(['asc', 'desc']).optional().describe('Sort direction'),
  iEvent: z.coerce.number().int().positive().optional().describe('Filter by event id'),
  iSku: z.coerce.number().int().positive().optional().describe('Filter by SKU id'),
  nonbinding: coerceBool().optional().describe('Only non-binding (reservation) orders'),
});

const ordersList = defineTool({
  name: 'orders_list',
  description:
    'List orders for the authenticated company (V2). Supports search, status/payment/event filters, date range and sorting.',
  annotations: { title: 'List orders', readOnlyHint: true, openWorldHint: true },
  inputSchema: ordersListInput,
  handler: async (input, api) => api.get('/v2/order', input),
});

const ordersGetInput = z.object({
  iOrder: z.coerce.number().int().positive().describe('Order id'),
});

const ordersGet = defineTool({
  name: 'orders_get',
  description: 'Fetch a single order by id (V2), including items, payments, customer.',
  annotations: { title: 'Get order', readOnlyHint: true, openWorldHint: true },
  inputSchema: ordersGetInput,
  handler: async (input, api) => api.get(`/v2/order/${input.iOrder}`),
});

const cartListInput = z.object({});

const cartList = defineTool({
  name: 'orders_cart_list',
  description: 'List all open (non-expired, non-checked-out) carts of the authenticated user.',
  annotations: { title: 'List open carts', readOnlyHint: true, openWorldHint: true },
  inputSchema: cartListInput,
  handler: async (_input, api) => api.get('/v2/order/cart'),
});

const cartGetInput = z.object({
  id: z.string().describe('Cart id'),
});

const cartGet = defineTool({
  name: 'orders_cart_get',
  description: 'Fetch a single cart by id, including items and applied coupons.',
  annotations: { title: 'Get cart', readOnlyHint: true, openWorldHint: true },
  inputSchema: cartGetInput,
  handler: async (input, api) => api.get(`/v2/order/cart/${input.id}`),
});

const cartCalculateInput = z.object({
  id: z.string().describe('Cart id'),
});

const cartCalculate = defineTool({
  name: 'orders_cart_calculate',
  description: 'Re-calculate prices and totals for a cart (read-only — does not persist).',
  annotations: { title: 'Calculate cart totals', readOnlyHint: true, openWorldHint: true },
  inputSchema: cartCalculateInput,
  handler: async (input, api) => api.get(`/v2/order/cart/${input.id}/calculate`),
});

export const orderTools: ToolDefinition[] = [
  ordersList,
  ordersGet,
  cartList,
  cartGet,
  cartCalculate,
];
