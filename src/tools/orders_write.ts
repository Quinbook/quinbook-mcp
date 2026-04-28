import { z } from 'zod';
import { defineTool, ToolDefinition, dryRunField, dryRunPreview, coerceBool } from './types.js';

const isoDateTime = z.string().describe('ISO 8601 datetime');

// ── orders_to_cart ────────────────────────────────────────────
const ordersToCartInput = z.object({
  iOrder: z.coerce.number().int().positive().describe('Order id to copy into a new cart'),
  dryRun: dryRunField,
});

const ordersToCart = defineTool({
  name: 'orders_to_cart',
  description:
    'Copy an existing order into a fresh cart for re-booking / modification. The original order remains untouched until the new cart is checked out (which adopts the source order via i_parent). WRITE — defaults to dryRun.',
  inputSchema: ordersToCartInput,
  handler: async (input, api) => {
    const url = `/v2/order/${input.iOrder}/to-cart`;
    if (input.dryRun) return dryRunPreview('POST', url);
    return api.post(url);
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
  fee: z.coerce.number().optional().describe('Cancellation fee to deduct from refund amount'),
  reference: z.string().optional().describe('Payment reference (e.g. bank transfer id)'),
  dryRun: dryRunField,
});

const ordersCancel = defineTool({
  name: 'orders_cancel',
  description:
    'Cancel an order and process refunds. Default refund method follows the original payment handler. Optionally charge a cancellation fee. WRITE — defaults to dryRun.',
  inputSchema: ordersCancelInput,
  handler: async (input, api) => {
    const { dryRun, iOrder, ...body } = input;
    const url = `/v2/order/${iOrder}/cancel`;
    if (dryRun) return dryRunPreview('POST', url, body);
    return api.post(url, body);
  },
});

// ── orders_record_payment ─────────────────────────────────────
const ordersRecordPaymentInput = z.object({
  iOrder: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive().describe('Payment amount in order currency, must be > 0'),
  paymentHandler: z
    .string()
    .describe('Offline handler only: onsite, transfer, cash, izettle, sumup, payleven, pos_card, pos_cash, …'),
  reference: z.string().optional().describe('External reference (receipt no., bank reference, …)'),
  dryRun: dryRunField,
});

const ordersRecordPayment = defineTool({
  name: 'orders_record_payment',
  description:
    'Record an offline payment on an order (cash/transfer/POS). Online handlers (Stripe, PayPal, …) are NOT allowed here; those are handled by their provider integrations. WRITE — defaults to dryRun.',
  inputSchema: ordersRecordPaymentInput,
  handler: async (input, api) => {
    const { dryRun, iOrder, ...body } = input;
    const url = `/v2/order/${iOrder}/payments`;
    if (dryRun) return dryRunPreview('POST', url, body);
    return api.post(url, body);
  },
});

// ── orders_refund_payment ─────────────────────────────────────
const ordersRefundPaymentInput = z.object({
  iOrder: z.coerce.number().int().positive(),
  iOrderPayment: z.coerce.number().int().positive().describe('Specific payment id to refund (from orders_get.payments[].iOrderPayment)'),
  dryRun: dryRunField,
});

const ordersRefundPayment = defineTool({
  name: 'orders_refund_payment',
  description:
    'Refund a specific OFFLINE payment (cash/transfer/POS). Online payments must be refunded via the provider portal directly. WRITE — defaults to dryRun.',
  inputSchema: ordersRefundPaymentInput,
  handler: async (input, api) => {
    const url = `/v2/order/${input.iOrder}/payments/${input.iOrderPayment}/refund`;
    if (input.dryRun) return dryRunPreview('POST', url);
    return api.post(url);
  },
});

// ── orders_resend_confirmation ────────────────────────────────
const ordersResendConfirmationInput = z.object({
  iOrder: z.coerce.number().int().positive(),
  dryRun: dryRunField,
});

const ordersResendConfirmation = defineTool({
  name: 'orders_resend_confirmation',
  description: 'Resend the order confirmation email to the customer. WRITE (sends email) — defaults to dryRun.',
  inputSchema: ordersResendConfirmationInput,
  handler: async (input, api) => {
    const url = `/v2/order/${input.iOrder}/resend-confirmation`;
    if (input.dryRun) return dryRunPreview('POST', url);
    return api.post(url);
  },
});

// ── orders_resend_invoice ─────────────────────────────────────
const ordersResendInvoiceInput = z.object({
  iOrder: z.coerce.number().int().positive(),
  dryRun: dryRunField,
});

const ordersResendInvoice = defineTool({
  name: 'orders_resend_invoice',
  description: 'Resend the invoice email to the customer. WRITE (sends email) — defaults to dryRun.',
  inputSchema: ordersResendInvoiceInput,
  handler: async (input, api) => {
    const url = `/v2/order/${input.iOrder}/resend-invoice`;
    if (input.dryRun) return dryRunPreview('POST', url);
    return api.post(url);
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
    .describe('If true, also updates the base customer record (not just the order recipient)'),
  dryRun: dryRunField,
});

const ordersPatchRecipient = defineTool({
  name: 'orders_patch_recipient',
  description:
    'Patch the recipient (billing/customer-facing) data of an order. Only provided fields change. Triggers invoice re-creation for binding orders if recipient-visible fields are modified. WRITE — defaults to dryRun.',
  inputSchema: ordersPatchRecipientInput,
  handler: async (input, api) => {
    const { dryRun, iOrder, ...body } = input;
    const url = `/v2/order/${iOrder}/recipient`;
    if (dryRun) return dryRunPreview('PATCH', url, body);
    return api.patch(url, body);
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
    .describe('Free-form text printed on the invoice. Changing this triggers invoice re-creation for binding orders.'),
  dryRun: dryRunField,
});

const ordersPatchFlags = defineTool({
  name: 'orders_patch_flags',
  description:
    'Patch order flags / notes. Only provided fields change. Note: changing invoiceInfo or nonbinding re-creates the invoice for binding orders. WRITE — defaults to dryRun.',
  inputSchema: ordersPatchFlagsInput,
  handler: async (input, api) => {
    const { dryRun, iOrder, ...body } = input;
    const url = `/v2/order/${iOrder}/flags`;
    if (dryRun) return dryRunPreview('PATCH', url, body);
    return api.patch(url, body);
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
