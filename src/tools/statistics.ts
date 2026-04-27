import { z } from 'zod';
import { defineTool, ToolDefinition } from './types.js';

const isoDateTime = z.string().describe('ISO datetime, e.g. 2026-01-01T00:00:00');

const rangeInput = z.object({
  datefrom: isoDateTime,
  dateto: isoDateTime,
  eventids: z.string().optional().describe('Comma-separated event ids, optional'),
});

const bookingsOverview = defineTool({
  name: 'stats_bookings_overview',
  description:
    'Booking statistics overview: original revenue, cancellations (without successor), rebooking deltas, net revenue.',
  inputSchema: rangeInput,
  handler: async (input, api) => api.get('/v1/statistics/bookings/overview', input),
});

const paymentsOverview = defineTool({
  name: 'stats_payments_overview',
  description: 'Payment statistics overview by date range.',
  inputSchema: rangeInput,
  handler: async (input, api) => api.get('/v1/statistics/payments/overview', input),
});

const slotsOverview = defineTool({
  name: 'stats_slots_overview',
  description: 'Slot statistics overview (capacity, utilization) by date range.',
  inputSchema: rangeInput,
  handler: async (input, api) => api.get('/v1/statistics/slots/overview', input),
});

export const statisticsTools: ToolDefinition[] = [bookingsOverview, paymentsOverview, slotsOverview];
