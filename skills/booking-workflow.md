---
name: quinbook-booking
description: Workflow for creating a booking via the quinbook-mcp tools — slots → cart → coupon (optional) → checkout. Use this skill when the user asks to book, reserve, or order a slot/ticket on quinbook.
allowed-tools:
  - mcp__quinbook__me_whoami
  - mcp__quinbook__me_companies
  - mcp__quinbook__me_switch_company
  - mcp__quinbook__slots_calendar
  - mcp__quinbook__slots_event
  - mcp__quinbook__slots_get
  - mcp__quinbook__coupons_find
  - mcp__quinbook__cart_add_item
  - mcp__quinbook__cart_apply_coupon
  - mcp__quinbook__orders_cart_calculate
  - mcp__quinbook__cart_checkout
  - mcp__quinbook__orders_get
  - mcp__quinbook__contacts_search
---

# Booking workflow

Use this when the user wants to book, reserve, order or buy something on quinbook. The flow is always: **find slot → cart → optional coupon → calculate → checkout → verify**.

## Step 0 — Verify the active company

If the user mentioned a specific company name or you're not certain which company you should book against, run `me_whoami` first. If `iCompany` doesn't match the user's intent, run `me_companies({ search })` and `me_switch_company` before any cart write.

## Step 1 — Find the slot

For a specific date use `slots_calendar({ date, ievent? })`. The output is the compact projection — only `iEventSlot`, `iEvent`, `start/end`, `capacity`, `freeSeats`, `isAvailable`. **Always read `freeSeats > 0` before continuing.** If the user gave only the event name, look it up in `events[]` first to get `iEvent`, then call `slots_calendar` again with that `ievent` filter.

## Step 2 — Identify the customer

If the user wants to book for an existing customer, use `contacts_search({ search | name | emailAddress })` to get `iCustomer`. If the customer is new, the checkout step accepts a full customer payload (firstName, lastName, emailAddress, address1, zip, city, country) instead of `iCustomer`.

For physical products (`stockitems`-type SKUs) the `address1`/`zip`/`city`/`country` fields are mandatory in the checkout body, even when `iCustomer` is set. The backend does not pull the address from the customer record automatically for physical-shipment products.

## Step 3 — Add to cart

Write tools execute immediately — there is no dry-run preview. **Summarise what you are about to add (SKU, quantity, slot, price) and get the user's confirmation in chat before calling `cart_add_item`.** The handler returns the resulting cart with `iCart` and `iCartItem`.

## Step 4 — Optional: apply a coupon

If the user mentioned a coupon code, look it up with `coupons_find({ code })` (which matches both the actual code and any alias). Then `cart_apply_coupon({ iCart, iCoupon })`.

**Caveat**: there is a known backend NRE when a coupon with `validEvents` is applied to a cart item that has `iEventSlot: null` (only `iEvent` + `slotStart`/`end` set). If `cart_calculate` returns `ERR_9999 "Value cannot be null. (Parameter 'source')"` after a coupon-apply, remove the coupon (`cart_remove_coupon`) and either choose an explicit slot or skip the coupon.

## Step 5 — Calculate

`orders_cart_calculate({ id: iCart })` returns subtotal, fees, taxes, discount, total. Show the totals to the user before checkout.

## Step 6 — Checkout

`cart_checkout({ iCart, customer: { iCustomer? or full address }, paymentHandler, silent? })` creates the order immediately. **Show the calculated totals (Step 5) and get the user's explicit confirmation before calling it** — there is no dry-run.

Payment handler hints:
- `onsite` — pay in person, no money flows
- `transfer` — bank transfer, marked unpaid until confirmed
- `stripe_card` / `paypal` / `klarna` — online, customer pays after the redirect

Use `silent: true` if the user wants to avoid the customer-facing confirmation email (e.g. internal test bookings).

## Step 7 — Verify

`orders_get({ iOrder })` shows the resulting order including status history and items. Status `9` = completed (no payment pending), `4` = pay-pending. Tell the user the resulting `orderNumber`.

## Tips

- **Multi-tenant safety**: when in doubt, run `me_whoami` between bookings — the active company can revert silently after a token refresh on older refresh tokens.
- **Slot-bound events**: `iEventSlot: null` is fine for stockitems but breaks slot-capacity events. If `cart_checkout` returns `dbErrorCode: -411`, the slot needs an explicit `iEventSlot`.
- **Cancel right after booking**: see the `quinbook-refund` skill for the cancel-with-refund flow.
