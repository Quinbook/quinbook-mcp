import { z } from 'zod';
import { defineTool, ToolDefinition, coerceBool } from './types.js';
import { MissingField, needsInputPayload, resolveMissing } from './needs_input.js';

// Offline payment handlers accepted by the endpoint. Authoritative source: OrderV2Controller.IsOfflineHandler
// → _offlineHandlers = { cash, transfer, izettle, sumup, payleven } plus any handler starting with "pos_".
// NOTE: "onsite" is NOT accepted here (the old tool description wrongly listed it) — it would be rejected
// with PAYMENT_HANDLER_NOT_ALLOWED. pos_card / pos_cash are concrete examples of the pos_* prefix.
const OFFLINE_HANDLERS = ['cash', 'transfer', 'izettle', 'sumup', 'payleven', 'pos_card', 'pos_cash'] as const;

const isoDateTime = z.string().describe('ISO 8601 datetime');

// ── orders_to_cart ────────────────────────────────────────────
const ordersToCartInput = z.object({
  iOrder: z.coerce.number().int().positive().describe('Order id to copy into a new cart'),});

const ordersToCart = defineTool({
  name: 'orders_to_cart',
  description:
    'Copy an existing order into a fresh cart for re-booking / modification. The original order remains untouched until the new cart is checked out (which adopts the source order via i_parent). WRITE.',
  annotations: { title: 'Copy order to new cart', readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  inputSchema: ordersToCartInput,
  handler: async (input, api) => {
    const url = `/v2/order/${input.iOrder}/to-cart`;    return api.post(url);
  },
});

// ── orders_cancel ─────────────────────────────────────────────
// Only unpaid orders can be cancelled here (see the payout guard in the handler), so the refund-related
// fields of the underlying endpoint (refundMethod / refundType / fee / reference) are intentionally not
// exposed — there is never anything to refund.
const ordersCancelInput = z.object({
  iOrder: z.coerce.number().int().positive(),
  reason: z.string().optional().describe('Cancellation reason (stored in the order status history and audit log)'),});

const ordersCancel = defineTool({
  name: 'orders_cancel',
  description:
    'Cancel an order that has NOT received any payment (cancelling simply releases the reserved slots — no '
    + 'money moves). If the order already has a payment, this tool refuses with an error and points to the '
    + 'backoffice: cancelling a paid order would require issuing a refund/payout, which this connector is not '
    + 'permitted to execute. WRITE.',
  annotations: { title: 'Cancel unpaid order', readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  inputSchema: ordersCancelInput,
  handler: async (input, api) => {
    const { iOrder, ...body } = input;
    // Payout guard: never cancel an order that has received money. A paid cancellation triggers a refund,
    // i.e. an outbound financial transaction, which this connector intentionally does not perform. Such cases
    // must be handled by staff in the quinbook backoffice. `totalPayed` is the authoritative amount-received
    // field on the V2 order (0 for unpaid / reserved bookings).
    const order = (await api.get(`/v2/order/${iOrder}`)) as { totalPayed?: number } | null;
    const totalPayed = Number(order?.totalPayed ?? 0);
    if (totalPayed > 0) {
      throw new Error(
        `Order ${iOrder} has a payment (totalPayed=${totalPayed}). Cancelling it would require issuing a `
        + `refund/payout, which this connector is not permitted to do. Please cancel and refund the order in the `
        + `quinbook backoffice: https://quinbook.com/seller/bookings/order/${iOrder}`,
      );
    }
    const url = `/v2/order/${iOrder}/cancel`;    return api.post(url, body);
  },
});

// ── orders_record_payment ─────────────────────────────────────
// Required by the endpoint (OrderServiceV2.RecordPaymentAsync): paymentHandler (non-blank) and amount (> 0).
// Both are intentionally OPTIONAL in zod so a missing value reaches the handler and we can elicit it (a
// schema-required field would be rejected at parse time, before the gate, with no chance to ask). These are
// money-sensitive: the model must ASK, never invent an amount or handler.
const ordersRecordPaymentInput = z.object({
  iOrder: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive().optional().describe('Payment amount in order currency, must be > 0. Ask the user — never guess.'),
  paymentHandler: z
    .string()
    .optional()
    .describe('Offline handler only: cash, transfer, izettle, sumup, payleven, or any pos_* (e.g. pos_card, pos_cash). NOT onsite. Ask the user — never guess.'),
  reference: z.string().optional().describe('External reference (receipt no., bank reference, …)'),});

const RECORD_PAYMENT_MISSING: Record<'amount' | 'paymentHandler', MissingField> = {
  amount: { field: 'amount', question: 'Welcher Betrag wurde gezahlt (in €)?', primitive: { type: 'number', title: 'Betrag (€)' } },
  paymentHandler: {
    field: 'paymentHandler',
    question: 'Wie wurde gezahlt?',
    primitive: { type: 'string', title: 'Zahlungsart', enum: [...OFFLINE_HANDLERS] },
  },
};

const ordersRecordPayment = defineTool({
  name: 'orders_record_payment',
  description:
    'Record an offline payment on an order. Allowed handlers: cash, transfer, izettle, sumup, payleven, or '
    + 'any pos_* (NOT onsite). Online handlers (Stripe, PayPal, …) are rejected — those are handled by their '
    + 'provider integrations. Amount and payment method are required — if either is missing, ASK the user; '
    + 'never invent an amount or a payment method. WRITE.',
  annotations: { title: 'Record offline payment', readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  inputSchema: ordersRecordPaymentInput,
  handler: async (input, api, ctx) => {
    const missing: MissingField[] = [];
    if (input.amount === undefined || input.amount === null) missing.push(RECORD_PAYMENT_MISSING.amount);
    if (!input.paymentHandler || String(input.paymentHandler).trim() === '') missing.push(RECORD_PAYMENT_MISSING.paymentHandler);

    if (missing.length) {
      const res = await resolveMissing(ctx, 'Für die Zahlungserfassung fehlen noch Angaben:', missing, true);
      if (res.kind === 'gate' || res.kind === 'cancelled') return res.payload;
      if (res.kind === 'collected') input = { ...input, ...res.values };
      // Re-validate after collection; if still incomplete, hand back the gate so the model asks again.
      if (input.amount === undefined || input.amount === null || !input.paymentHandler) {
        return needsInputPayload('Für die Zahlungserfassung fehlen noch Angaben:', missing);
      }
    }

    const { iOrder, ...body } = input;
    const url = `/v2/order/${iOrder}/payments`;
    return api.post(url, body);
  },
});

// NOTE: orders_refund_payment was intentionally removed. Issuing a refund is an outbound financial
// transaction, which the Anthropic directory policy prohibits for connectors. Refunds must be done by
// staff in the quinbook backoffice. (orders_cancel likewise refuses paid orders — see its payout guard.)

// ── orders_resend_confirmation ────────────────────────────────
const ordersResendConfirmationInput = z.object({
  iOrder: z.coerce.number().int().positive(),});

const ordersResendConfirmation = defineTool({
  name: 'orders_resend_confirmation',
  description: 'Resend the order confirmation email to the customer. WRITE (sends email).',
  annotations: { title: 'Resend confirmation email', readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  inputSchema: ordersResendConfirmationInput,
  handler: async (input, api) => {
    const url = `/v2/order/${input.iOrder}/resend-confirmation`;    return api.post(url);
  },
});

// ── orders_resend_invoice ─────────────────────────────────────
const ordersResendInvoiceInput = z.object({
  iOrder: z.coerce.number().int().positive(),});

const ordersResendInvoice = defineTool({
  name: 'orders_resend_invoice',
  description: 'Resend the invoice email to the customer. WRITE (sends email).',
  annotations: { title: 'Resend invoice email', readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  inputSchema: ordersResendInvoiceInput,
  handler: async (input, api) => {
    const url = `/v2/order/${input.iOrder}/resend-invoice`;    return api.post(url);
  },
});

// ── orders_patch_recipient ────────────────────────────────────
const ordersPatchRecipientInput = z.object({
  iOrder: z.coerce.number().int().positive(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  companyName: z.string().optional(),
  ustId: z.string().optional(),
  emailAddress: z.string().email().optional(),
  gender: z.string().optional(),
  phone1: z.string().optional(),
  phone2: z.string().optional(),
  address1: z.string().optional(),
  address2: z.string().optional(),
  zip: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  state: z.string().optional(),
  language: z.string().optional(),
  updateCustomerRecord: z
    .boolean()
    .optional()
    .describe('If true, also updates the base customer record (not just the order recipient)'),});

const ordersPatchRecipient = defineTool({
  name: 'orders_patch_recipient',
  description:
    'Patch the recipient (billing/customer-facing) data of an order. Only provided fields change. Triggers invoice re-creation for binding orders if recipient-visible fields are modified. WRITE.',
  annotations: { title: 'Update order recipient', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  inputSchema: ordersPatchRecipientInput,
  handler: async (input, api) => {
    const { iOrder, ...body } = input;
    const url = `/v2/order/${iOrder}/recipient`;    return api.patch(url, body);
  },
});

// ── orders_patch_flags ────────────────────────────────────────
const ordersPatchFlagsInput = z.object({
  iOrder: z.coerce.number().int().positive(),
  nonbinding: coerceBool().optional().describe('Flip between binding and non-binding (reservation)'),
  nonbindingExpire: isoDateTime.optional().describe('Expiration timestamp for non-binding reservations'),
  silent: coerceBool().optional().describe('Suppress customer-facing notification emails on updates'),
  internalInfo: z.string().optional().describe('Internal note (not customer-visible, not on invoice)'),
  customerInfo: z.string().optional().describe("Customer's note (not on invoice)"),
  invoiceInfo: z
    .string()
    .optional()
    .describe('Free-form text printed on the invoice. Changing this triggers invoice re-creation for binding orders.'),});

const ordersPatchFlags = defineTool({
  name: 'orders_patch_flags',
  description:
    'Patch order flags / notes. Only provided fields change. Note: changing invoiceInfo or nonbinding re-creates the invoice for binding orders. WRITE.',
  annotations: { title: 'Update order flags/notes', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  inputSchema: ordersPatchFlagsInput,
  handler: async (input, api) => {
    const { iOrder, ...body } = input;
    const url = `/v2/order/${iOrder}/flags`;    return api.patch(url, body);
  },
});

export const orderWriteTools: ToolDefinition[] = [
  ordersToCart,
  ordersCancel,
  ordersRecordPayment,
  ordersResendConfirmation,
  ordersResendInvoice,
  ordersPatchRecipient,
  ordersPatchFlags,
];
