import { z } from 'zod';
import { defineTool, ToolDefinition } from './types.js';

const ordersListInput = z.object({
  search: z.string().optional().describe('Free-text search across order fields'),
  start: z.number().int().min(0).default(0).describe('Pagination offset'),
  length: z.number().int().min(1).max(1000).default(100).describe('Page size (max 1000)'),
  filter_start: z.string().optional().describe('ISO datetime — earliest order/slot start'),
  filter_end: z.string().optional().describe('ISO datetime — latest order/slot start'),
  filter_field: z
    .enum(['date_created', 'i_eventslot.start_date'])
    .optional()
    .describe('Which date column the filter_start/end applies to'),
  filter_status: z.string().optional().describe('Order status filter (numeric or list)'),
  filter_payment: z.string().optional().describe('Payment method filter (e.g. paypal, onsite, stripe)'),
  only_nonbinding: z.boolean().optional().describe('If true, only return non-binding reservations'),
});

const ordersList = defineTool({
  name: 'orders_list',
  description:
    'List orders for the authenticated company with filters and pagination. Use this for searches like "all bookings last week" or "orders with status X".',
  inputSchema: ordersListInput,
  handler: async (input, api) => api.get('/v1/order', input),
});

const ordersGetInput = z.object({
  i_order: z.number().int().positive().describe('Order id'),
});

const ordersGet = defineTool({
  name: 'orders_get',
  description: 'Fetch a single order by id, including items, payments and customer.',
  inputSchema: ordersGetInput,
  handler: async (input, api) => api.get(`/v1/order/${input.i_order}`),
});

export const orderTools: ToolDefinition[] = [ordersList, ordersGet];
