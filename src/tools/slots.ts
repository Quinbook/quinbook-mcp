import { z } from 'zod';
import { defineTool, ToolDefinition, coerceBool } from './types.js';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

const slotsCalendarInput = z.object({
  date: isoDate.describe('Calendar date (YYYY-MM-DD)'),
  lang: z.string().default('en').describe('Language code for translated fields'),
  timezone: z.string().default('Europe/Berlin').describe('IANA timezone for date interpretation'),
  ievent: z.coerce.number().int().positive().optional().describe('Restrict to a specific event id'),
  onlyfree: coerceBool().optional().describe('If true, only return slots with free capacity'),
});

const slotsCalendar = defineTool({
  name: 'slots_calendar',
  description:
    'Get the company calendar for a specific date — all events and their slots, with availability. Returns a compact projection (id, name, start/end, capacity/freeSeats/takenSeats, isAvailable) so the response fits into AI tool-output limits.',
  annotations: { title: 'Company calendar (day)', readOnlyHint: true, openWorldHint: true },
  inputSchema: slotsCalendarInput,
  handler: async (input, api) => {
    const { date, ...query } = input;
    return api.get(`/v1/slots/calendar/${date}/compact`, query);
  },
});

const slotsEventInput = z.object({
  ievent: z.coerce.number().int().positive().describe('Event id'),
  date: isoDate.describe('Date (YYYY-MM-DD)'),
  lang: z.string().default('en'),
  timezone: z.string().default('Europe/Berlin'),
});

const slotsEvent = defineTool({
  name: 'slots_event',
  description: 'Get all slots of one event on one date.',
  annotations: { title: 'Event slots (day)', readOnlyHint: true, openWorldHint: true },
  inputSchema: slotsEventInput,
  handler: async (input, api) => {
    const { ievent, date, ...query } = input;
    return api.get(`/v1/slots/event/${ievent}/${date}`, query);
  },
});

const slotsGetInput = z.object({
  id: z.coerce.number().int().positive().describe('EventSlot id'),
  date: isoDate.optional().describe('Optional date (YYYY-MM-DD) — disambiguates recurring slot patterns'),
});

const slotsGet = defineTool({
  name: 'slots_get',
  description: 'Fetch a single slot by id (optionally restricted to a date).',
  annotations: { title: 'Get slot', readOnlyHint: true, openWorldHint: true },
  inputSchema: slotsGetInput,
  handler: async (input, api) => {
    const path = input.date ? `/v1/slots/${input.id}/${input.date}` : `/v1/slots/${input.id}`;
    return api.get(path);
  },
});

export const slotTools: ToolDefinition[] = [slotsCalendar, slotsEvent, slotsGet];
