---
name: quinbook-refund
description: Workflow for cancelling a quinbook order. This connector only cancels orders that have NOT received a payment; anything that would require a refund/payout is handed off to the quinbook backoffice. Use this when the user asks to cancel, refund, storno, or undo an order.
allowed-tools:
  - mcp__quinbook__orders_get
  - mcp__quinbook__orders_cancel
  - mcp__quinbook__contacts_add_notice
---

# Cancel workflow (unpaid orders only)

**Important boundary:** this connector never executes outbound financial transactions. It can cancel an
order **only if no money has been received** (`totalPayed == 0`) — cancelling such an order just releases
the reserved slots. There is **no refund tool**. If an order already has a payment, the cancel is refused
and the customer's cancellation/refund must be processed by staff in the quinbook backoffice.

## Step 1 — Inspect the order

`orders_get({ iOrder })` shows:

- `cancelled: boolean` — if already cancelled, nothing to do
- `total`, `totalPayed` — **the deciding field is `totalPayed`**
- `payments: [...]` — context on how (if at all) it was paid
- `customer.emailAddress` — for the user to confirm

## Step 2 — Branch on payment status

- **`totalPayed == 0` (unpaid / reservation):** you can cancel it here. Continue to Step 3.
- **`totalPayed > 0` (paid):** do **not** attempt to cancel — `orders_cancel` will refuse with an error,
  because a refund would have to be issued. Tell the user this has to be done in the backoffice and give
  them the link:

  > This order has already received a payment, so I can't cancel or refund it from here — that would
  > move money, which this assistant isn't allowed to do. Please cancel and refund it in the backoffice:
  > https://quinbook.com/seller/bookings/order/{iOrder}

  Optionally attach a CRM note (Step 5) so the handover is documented.

## Step 3 — Run the cancel (unpaid only)

`orders_cancel` executes immediately — there is no dry-run. Always:

1. Summarise the planned cancel to the user: order, customer, that it is unpaid
2. Get explicit confirmation in chat
3. Only then call `orders_cancel({ iOrder, reason })`

`reason` is optional but recommended (it lands in the order's status history and the AuditLog). You do not
need a `refundMethod` for an unpaid order — there is nothing to refund.

```
orders_cancel({
  iOrder: 12345,
  reason: "Customer requested cancellation"
})
```

## Step 4 — Verify

`orders_get({ iOrder })` again. Expect:

- `cancelled: true`
- `status: 99` (CANCELD)
- `statuses[]` last entry: `{ status: "CANCELD", reason: <your reason text> }`

## Step 5 — Audit trail

The `reason` string lands in the order's status history *and* the AuditLog. If the user wants a longer
note — or you handed a paid order off to the backoffice — additionally call
`contacts_add_notice({ iCustomer, notice, type: "cancel" })` to attach a CRM note to the customer.
