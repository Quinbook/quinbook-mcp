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
  inputSchema: ordersToCartInput,
  handler: async (input, api) => {
    const url = `/v2/order/${input.iOrder}/to-cart`;    return api.post(url);
  },
});

// ── orders_cancel ─────────────────────────────────────────────
const ordersCancelInput = z.object({
  iOrder: z.coerce.number().int().positive(),
  refundMethod: z
    .enum(['online', 'coupon', 'transfer', 'onsite', 'cash', 'none'])
    .optional()
    .describe('Refund method. Leave empty for orders without payments.'),
  refundType: z
    .enum(['overpayed'])
    .optional()
    .describe('Use "overpayed" to only refund the overpaid amount (partial refund).'),
  reason: z.string().optional().describe('Cancellation reason (stored in audit log)'),
  fee: z.coerce.number().optional().describe('Cancellation fee to deduct from refund. Only set if the user specified one — never invent a fee; omit it to refund in full.'),
  reference: z.string().optional().describe('Payment reference (e.g. bank transfer id)'),});

const ordersCancel = defineTool({
  name: 'orders_cancel',
  description:
    'Cancel an order and process refunds. The endpoint requires no fields beyond the order id: the refund '
    + 'method defaults to the original payment handler when omitted. Do NOT invent a cancellation fee or a '
    + 'refund method — only pass them if the user explicitly asked for them. WRITE.',
  inputSchema: ordersCancelInput,
  handler: async (input, api) => {
    const { iOrder, ...body } = input;
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

// ── orders_refund_payment ─────────────────────────────────────
const ordersRefundPaymentInput = z.object({
  iOrder: z.coerce.number().int().positive(),
  iOrderPayment: z.coerce.number().int().positive().describe('Specific payment id to refund (from orders_get.payments[].iOrderPayment)'),});

const ordersRefundPayment = defineTool({
  name: 'orders_refund_payment',
  description:
    'Refund a specific OFFLINE payment (cash/transfer/POS). Online payments must be refunded via the provider '
    + 'portal directly. iOrderPayment must be a real payment id from orders_get.payments[].iOrderPayment — '
    + 'never guess it; if you do not have it, look it up with orders_get first. WRITE.',
  inputSchema: ordersRefundPaymentInput,
  handler: async (input, api) => {
    const url = `/v2/order/${input.iOrder}/payments/${input.iOrderPayment}/refund`;    return api.post(url);
  },
});

// ── orders_resend_confirmation ────────────────────────────────
const ordersResendConfirmationInput = z.object({
  iOrder: z.coerce.number().int().positive(),});

const ordersResendConfirmation = defineTool({
  name: 'orders_resend_confirmation',
  description: 'Resend the order confirmation email to the customer. WRITE (sends email).',
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
  ordersRefundPayment,
  ordersResendConfirmation,
  ordersResendInvoice,
  ordersPatchRecipient,
  ordersPatchFlags,
];
