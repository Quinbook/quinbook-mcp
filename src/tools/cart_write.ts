import { z } from 'zod';
import { defineTool, ToolDefinition, dryRunField, dryRunPreview, coerceBool } from './types.js';

const isoDateTime = z.string().describe('ISO 8601 datetime, e.g. 2026-04-30T20:30:00');

// ── cart_add_item ─────────────────────────────────────────────
const cartAddItemInput = z.object({
  iSku: z.coerce.number().int().positive().describe('SKU id to add'),
  quantity: z.coerce.number().int().min(1).max(9999).describe('Quantity'),
  iCart: z.coerce.number().int().positive().optional().describe('Cart id. If omitted, the most recent open cart is used or a new one is created.'),
  slotStart: isoDateTime.optional().describe('Slot start time (for time-based products)'),
  slotEnd: isoDateTime.optional().describe('Slot end time (for time-based products)'),
  iEvent: z.coerce.number().int().positive().optional().describe('Event id (for event-based products)'),
  iEventSlot: z.coerce.number().int().positive().optional().describe('EventSlot id (for slot-based bookings)'),
  attributes: z.string().optional().describe('Optional JSON attributes (language, nopicture, digital_value, …)'),
  manualAdjustment: z.coerce.number().optional().describe('Optional manual price adjustment'),
  manualAdjustmentNotice: z.string().optional().describe('Reason for manual adjustment'),
  dryRun: dryRunField,
});

const cartAddItem = defineTool({
  name: 'cart_add_item',
  description:
    'Add one item to a cart. Creates a new cart if none exists and iCart is not provided. Permission: ADD-BOOKINGS. WRITE — defaults to dryRun.',
  inputSchema: cartAddItemInput,
  handler: async (input, api) => {
    const { dryRun, ...body } = input;
    if (dryRun) return dryRunPreview('POST', '/v2/order/cart/items', body);
    return api.post('/v2/order/cart/items', body);
  },
});

// ── cart_patch_item ───────────────────────────────────────────
const cartPatchItemInput = z.object({
  iCart: z.coerce.number().int().positive().describe('Cart id'),
  iCartItem: z.coerce.number().int().positive().describe('Cart item id'),
  quantity: z.coerce.number().int().min(0).max(9999).optional().describe('New quantity (0 removes the item)'),
  slotStart: isoDateTime.optional(),
  slotEnd: isoDateTime.optional(),
  iEventSlot: z.coerce.number().int().positive().optional(),
  attributes: z.string().optional(),
  manualAdjustment: z.coerce.number().optional(),
  manualAdjustmentNotice: z.string().optional(),
  dryRun: dryRunField,
});

const cartPatchItem = defineTool({
  name: 'cart_patch_item',
  description:
    'Modify a single field on a cart item. Only provided fields are changed; quantity=0 removes the item. Permission: ADD-BOOKINGS. WRITE — defaults to dryRun.',
  inputSchema: cartPatchItemInput,
  handler: async (input, api) => {
    const { dryRun, iCart, iCartItem, ...body } = input;
    const url = `/v2/order/cart/${iCart}/items/${iCartItem}`;
    if (dryRun) return dryRunPreview('PATCH', url, body);
    return api.patch(url, body);
  },
});

// ── cart_remove_item ──────────────────────────────────────────
const cartRemoveItemInput = z.object({
  iCart: z.coerce.number().int().positive(),
  iCartItem: z.coerce.number().int().positive(),
  dryRun: dryRunField,
});

const cartRemoveItem = defineTool({
  name: 'cart_remove_item',
  description: 'Remove an item from the cart. Permission: ADD-BOOKINGS. WRITE — defaults to dryRun.',
  inputSchema: cartRemoveItemInput,
  handler: async (input, api) => {
    const url = `/v2/order/cart/${input.iCart}/items/${input.iCartItem}`;
    if (input.dryRun) return dryRunPreview('DELETE', url);
    return api.delete(url);
  },
});

// ── cart_apply_coupon ─────────────────────────────────────────
const cartApplyCouponInput = z.object({
  iCart: z.coerce.number().int().positive(),
  iCoupon: z.coerce.number().int().positive().describe('Coupon id (use coupons_find first to get the id from a code)'),
  dryRun: dryRunField,
});

const cartApplyCoupon = defineTool({
  name: 'cart_apply_coupon',
  description: 'Apply a coupon to the cart. WRITE — defaults to dryRun.',
  inputSchema: cartApplyCouponInput,
  handler: async (input, api) => {
    const url = `/v2/order/cart/${input.iCart}/coupons`;
    const body = { iCoupon: input.iCoupon };
    if (input.dryRun) return dryRunPreview('POST', url, body);
    return api.post(url, body);
  },
});

// ── cart_remove_coupon ────────────────────────────────────────
const cartRemoveCouponInput = z.object({
  iCart: z.coerce.number().int().positive(),
  iCartCoupon: z.coerce.number().int().positive().describe('Cart coupon id (the iCartCoupon from cart_get response, NOT the coupon id)'),
  dryRun: dryRunField,
});

const cartRemoveCoupon = defineTool({
  name: 'cart_remove_coupon',
  description: 'Remove a coupon from the cart. WRITE — defaults to dryRun.',
  inputSchema: cartRemoveCouponInput,
  handler: async (input, api) => {
    const url = `/v2/order/cart/${input.iCart}/coupons/${input.iCartCoupon}`;
    if (input.dryRun) return dryRunPreview('DELETE', url);
    return api.delete(url);
  },
});

// ── cart_delete ───────────────────────────────────────────────
const cartDeleteInput = z.object({
  iCart: z.coerce.number().int().positive(),
  dryRun: dryRunField,
});

const cartDelete = defineTool({
  name: 'cart_delete',
  description: 'Delete an entire cart. WRITE — defaults to dryRun.',
  inputSchema: cartDeleteInput,
  handler: async (input, api) => {
    const url = `/v2/order/cart/${input.iCart}`;
    if (input.dryRun) return dryRunPreview('DELETE', url);
    return api.delete(url);
  },
});

// ── cart_checkout ─────────────────────────────────────────────
const checkoutCustomer = z.object({
  iCustomer: z.coerce.number().int().positive().optional().describe('Existing customer id (omit to create new)'),
  emailAddress: z.string().email().optional(),
  gender: z.string().optional(),
  companyName: z.string().optional(),
  ustId: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone1: z.string().optional(),
  phone2: z.string().optional(),
  address1: z.string().optional(),
  address2: z.string().optional(),
  zip: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  state: z.string().optional(),
  language: z.string().optional(),
  leitwegId: z.string().optional(),
});

const cartCheckoutInput = z.object({
  iCart: z.coerce.number().int().positive(),
  customer: checkoutCustomer.describe('Customer data — supply iCustomer for existing user, or full fields to create one'),
  iOrder: z.coerce.number().int().positive().optional().describe('If set, updates (adopts) this existing order instead of creating a new one'),
  paymentHandler: z.string().optional().describe('Override payment handler (e.g. onsite, transfer, stripe_card). If omitted, uses cart default.'),
  invoiceInfo: z.string().optional(),
  customerInfo: z.string().optional(),
  internalInfo: z.string().optional(),
  nonbinding: coerceBool().optional().describe('Make the order a non-binding reservation'),
  nonbindingExpire: isoDateTime.optional().describe('Expiration timestamp for non-binding reservations'),
  silent: coerceBool().optional().describe('Suppress notification emails'),
  dryRun: dryRunField,
});

const cartCheckout = defineTool({
  name: 'cart_checkout',
  description:
    'Convert a cart into an order (the actual booking). On success returns the new iOrder. WRITE — defaults to dryRun. Sends confirmation email unless silent=true. Permission: ADD-BOOKINGS.',
  inputSchema: cartCheckoutInput,
  handler: async (input, api) => {
    const { dryRun, iCart, ...body } = input;
    const url = `/v2/order/cart/${iCart}/checkout`;
    if (dryRun) return dryRunPreview('POST', url, body);
    return api.post(url, body);
  },
});

export const cartWriteTools: ToolDefinition[] = [
  cartAddItem,
  cartPatchItem,
  cartRemoveItem,
  cartApplyCoupon,
  cartRemoveCoupon,
  cartDelete,
  cartCheckout,
];
