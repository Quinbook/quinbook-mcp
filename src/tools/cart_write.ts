import { z } from 'zod';
import { defineTool, ToolDefinition, coerceBool } from './types.js';

const isoDateTime = z.string().describe('ISO 8601 datetime, e.g. 2026-04-30T20:30:00');

// ── cart_add_item ─────────────────────────────────────────────
const cartAddItemInput = z.object({
  iSku: z.coerce.number().int().positive().describe('SKU id to add. A real article id from a read tool (slots_event, slots_get, …) — never guess it.'),
  quantity: z.coerce.number().int().min(1).max(9999).describe('Quantity'),
  iCart: z.coerce.number().int().positive().optional().describe('Cart id. If omitted, the most recent open cart is used or a new one is created.'),
  slotStart: isoDateTime.optional().describe('Slot start time (for time-based products)'),
  slotEnd: isoDateTime.optional().describe('Slot end time (for time-based products)'),
  iEvent: z.coerce.number().int().positive().optional().describe('Event id (for event-based products)'),
  iEventSlot: z.coerce.number().int().positive().optional().describe('EventSlot id (for slot-based bookings)'),
  attributes: z.string().optional().describe('Optional JSON attributes (language, nopicture, digital_value, …)'),
  manualAdjustment: z.coerce.number().optional().describe('Optional manual price adjustment'),
  manualAdjustmentNotice: z.string().optional().describe('Reason for manual adjustment'),});

const cartAddItem = defineTool({
  name: 'cart_add_item',
  description:
    'Add one item to a cart. Creates a new cart if none exists and iCart is not provided. Permission: ADD-BOOKINGS. WRITE.',
  annotations: { title: 'Add item to cart', readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  inputSchema: cartAddItemInput,
  handler: async (input, api) => api.post('/v2/order/cart/items', input),
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
  manualAdjustmentNotice: z.string().optional(),});

const cartPatchItem = defineTool({
  name: 'cart_patch_item',
  description:
    'Modify a single field on a cart item. Only provided fields are changed; quantity=0 removes the item. Permission: ADD-BOOKINGS. WRITE.',
  annotations: { title: 'Modify cart item', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  inputSchema: cartPatchItemInput,
  handler: async (input, api) => {
    const { iCart, iCartItem, ...body } = input;
    const url = `/v2/order/cart/${iCart}/items/${iCartItem}`;
    return api.patch(url, body);
  },
});

// ── cart_remove_item ──────────────────────────────────────────
const cartRemoveItemInput = z.object({
  iCart: z.coerce.number().int().positive(),
  iCartItem: z.coerce.number().int().positive(),});

const cartRemoveItem = defineTool({
  name: 'cart_remove_item',
  description: 'Remove an item from the cart. Permission: ADD-BOOKINGS. WRITE.',
  annotations: { title: 'Remove cart item', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  inputSchema: cartRemoveItemInput,
  handler: async (input, api) => {
    const url = `/v2/order/cart/${input.iCart}/items/${input.iCartItem}`;
    return api.delete(url);
  },
});

// ── cart_apply_coupon ─────────────────────────────────────────
const cartApplyCouponInput = z.object({
  iCart: z.coerce.number().int().positive(),
  iCoupon: z.coerce.number().int().positive().describe('Coupon id. The endpoint only accepts the numeric id — if the customer gave you a code, resolve it with coupons_find first. Never invent an id.'),});

const cartApplyCoupon = defineTool({
  name: 'cart_apply_coupon',
  description:
    'Apply a coupon to the cart by its numeric id. If you only have a redemption code, look up the id with '
    + 'coupons_find first — never guess the id. WRITE.',
  annotations: { title: 'Apply coupon to cart', readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  inputSchema: cartApplyCouponInput,
  handler: async (input, api) => {
    const url = `/v2/order/cart/${input.iCart}/coupons`;
    const body = { iCoupon: input.iCoupon };
    return api.post(url, body);
  },
});

// ── cart_remove_coupon ────────────────────────────────────────
const cartRemoveCouponInput = z.object({
  iCart: z.coerce.number().int().positive(),
  iCartCoupon: z.coerce.number().int().positive().describe('Cart coupon id (the iCartCoupon from cart_get response, NOT the coupon id)'),});

const cartRemoveCoupon = defineTool({
  name: 'cart_remove_coupon',
  description: 'Remove a coupon from the cart. WRITE.',
  annotations: { title: 'Remove cart coupon', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  inputSchema: cartRemoveCouponInput,
  handler: async (input, api) => {
    const url = `/v2/order/cart/${input.iCart}/coupons/${input.iCartCoupon}`;
    return api.delete(url);
  },
});

// ── cart_delete ───────────────────────────────────────────────
const cartDeleteInput = z.object({
  iCart: z.coerce.number().int().positive(),});

const cartDelete = defineTool({
  name: 'cart_delete',
  description: 'Delete an entire cart. WRITE.',
  annotations: { title: 'Delete cart', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  inputSchema: cartDeleteInput,
  handler: async (input, api) => {
    const url = `/v2/order/cart/${input.iCart}`;
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
  silent: coerceBool().optional().describe('Suppress notification emails'),});

const cartCheckout = defineTool({
  name: 'cart_checkout',
  description:
    'Convert a cart into an order (the actual booking). The cart must already contain items (an empty cart is '
    + 'rejected) and customer data is required — pass iCustomer for an existing customer, or the customer\'s '
    + 'real details to create one; never invent customer data. paymentHandler defaults to the cart\'s handler '
    + 'if omitted. On success returns the new iOrder. WRITE. Sends confirmation email unless silent=true. '
    + 'Permission: ADD-BOOKINGS.',
  annotations: { title: 'Checkout cart (create booking)', readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  inputSchema: cartCheckoutInput,
  handler: async (input, api) => {
    const { iCart, ...body } = input;
    const url = `/v2/order/cart/${iCart}/checkout`;
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
