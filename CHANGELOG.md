# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-04-30 (initial release)

### Added
- MCP server exposing the quinbook ticketing API as 36 tools across these areas:
  - **Identity & multi-tenancy** (`me_whoami`, `me_companies`, `me_switch_company`)
  - **Slots & calendar** (`slots_calendar`, `slots_event`, `slots_get`)
  - **Orders V2 read** (`orders_list`, `orders_get`, `orders_cart_list`/`_get`/`_calculate`)
  - **Coupons** (`coupons_get`, `coupons_find`, `coupons_used`)
  - **Cart mutations** (`cart_add_item`, `cart_patch_item`, `cart_remove_item`,
    `cart_apply_coupon`, `cart_remove_coupon`, `cart_delete`, `cart_checkout`)
  - **Order lifecycle** (`orders_to_cart`, `orders_cancel`, `orders_record_payment`,
    `orders_refund_payment`, `orders_resend_confirmation`/`_invoice`,
    `orders_patch_recipient`/`_flags`)
  - **Contacts** (`contacts_search`, `contacts_get`, `contacts_notices_list`,
    `contacts_add_notice`, `contacts_create`, `contacts_update`, `contacts_delete`)
- OAuth 2.0 Authorization Code flow with **redis-backed polling callback** (no
  local web-server, no random-port redirect — works behind firewalls/NAT).
- Per-company token cache via OS credential store (keytar). One token per
  `<host>::<clientId>::<iCompany>` plus an `active` pointer.
- Defensive auto-correction after refresh: if the backend returns a token bound
  to the wrong company (FirstOrDefault fallback), the server immediately calls
  `switch_company` to restore the active state.
- All write tools default to `dryRun: true` — the tool returns the planned API
  call without executing it. Set `dryRun: false` explicitly to perform the write.
- Schema coercion (`z.coerce.*` and a custom `coerceBool`) so MCP transport
  string-encoded numbers/booleans are accepted.
- Bundled OAuth client credentials (RFC 8252-style public client). End users
  install via `npx @quinbook/mcp-api` with no env-block in their MCP config.
- Compact backend endpoints (`/v1/me?compact=true`,
  `/v1/slots/calendar/{date}/compact`) keep tool output within LLM token
  budgets even for large date ranges.
