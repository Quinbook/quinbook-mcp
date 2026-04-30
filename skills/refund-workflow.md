---
name: quinbook-refund
description: Workflow for cancelling a quinbook order with the appropriate refund handling — including fees, partial refunds, and offline-vs-online payment differences. Use this when the user asks to cancel, refund, storno, or undo an order.
allowed-tools:
  - mcp__quinbook__orders_get
  - mcp__quinbook__orders_cancel
  - mcp__quinbook__orders_refund_payment
  - mcp__quinbook__contacts_add_notice
---

# Cancel / refund workflow

Use this when the user wants to cancel or refund an order. Cancel triggers refund logic automatically — you usually do NOT need `orders_refund_payment` directly.

## Step 1 — Inspect the order

`orders_get({ iOrder })` shows:

- `cancelled: boolean` — if already cancelled, only re-issue refund if needed
- `payments: [...]` — each with `paymentHandler` (onsite, transfer, stripe_card, paypal, …) and `iOrderPayment`
- `total`, `totalPayed` — how much is at stake
- `customer.emailAddress` — for the user to confirm

## Step 2 — Decide refund method

Pick `refundMethod` for `orders_cancel` based on how the customer originally paid:

| Original payment | Recommended `refundMethod` | Notes |
|---|---|---|
| Stripe / PayPal / Klarna / online | `online` | Reverses via the original provider |
| Bank transfer | `transfer` | Backend records intent, you handle the actual transfer offline |
| Onsite cash / POS | `onsite` or `cash` | Mark as refunded in person |
| Coupon-paid | `coupon` | Issues a coupon for the refund amount |
| No payment yet (`totalPayed == 0`) | `none` or omit | Nothing to refund |

For overpaid orders (refund only the surplus, not the whole booking): set `refundType: "overpayed"`.

## Step 3 — Cancellation fee

If the user mentioned a cancellation fee (or your business policy applies one), set `fee` in the cancel body. The backend will deduct it from the refund amount:

```
orders_cancel({
  iOrder: 12345,
  refundMethod: "transfer",
  fee: 5.00,
  reason: "Late cancellation < 24h"
})
```

The fee surfaces as a separate `OrderItem` on the cancelled order with `source: "virtual"` (see `reference_cancel_fee_text.md` in the backend memory). The text is configurable per company in WebResources `name='cancel_fee'`.

## Step 4 — Run the cancel (dry run first!)

`orders_cancel` defaults to `dryRun: true`. Always:

1. Run with `dryRun: true` to get the preview
2. Show preview to user
3. Run with `dryRun: false` only after explicit confirmation

The response is `{ success, iOrder, refundMethod, refundAmount, fee, couponId? }`.

## Step 5 — Verify

`orders_get({ iOrder })` again. Expect:

- `cancelled: true`
- `status: 99` (CANCELD)
- `statuses[]` last entry: `{ status: "CANCELD", reason: <your reason text> }`

## When to use `orders_refund_payment` directly

Only when you want to refund a **single payment** without cancelling the whole order — e.g. the customer paid twice and you want to return one of the payments while keeping the booking active. The endpoint works **only for offline handlers** (cash, transfer, POS); online refunds go through their provider portal.

```
orders_refund_payment({ iOrder: 12345, iOrderPayment: 67890, dryRun: false })
```

## Audit trail

The `reason` string lands in the order's status history *and* the AuditLog. If the user wants a longer note, additionally call `contacts_add_notice({ iCustomer, notice, type: "cancel" })` to attach a CRM note to the customer.
