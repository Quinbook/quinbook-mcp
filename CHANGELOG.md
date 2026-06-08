# Changelog

All notable changes to this project will be documented in this file.

## [0.2.9] - 2026-06-08

Documentation and guidance polish ahead of the Anthropic directory submission. No changes to the
tool/API surface; one assistant-instruction addition.

### Added
- **"Compliance & financial boundary" section in the README**, stating per-tool that the connector
  executes no outbound financial transactions, aligned with the Anthropic Software Directory Policy.
- **Hand-off instruction**: when asked for a disallowed money action (refund, or cancelling a paid
  order), the assistant now returns the backoffice booking link to click/copy instead of attempting
  it — the default even without the bundled skill installed.

### Changed
- README now documents the `.mcpb` Desktop Extension install path (download from Releases, open in
  Claude Desktop) and a from-source option, instead of the npm/`npx` path.
- Removed the stale Roadmap section; fixed example prompts and the `refund-workflow` skill
  description that still referenced refund parameters.

## [0.2.8] - 2026-06-06

Directory-readiness release: brings the connector in line with the Anthropic software
directory policy, which prohibits connectors from executing outbound financial transactions.

### Removed
- **`orders_refund_payment`** — issuing a refund is an outbound financial transaction and is
  not permitted for directory connectors. Refunds must be handled by staff in the quinbook
  backoffice. Tool count 38 → 37.

### Changed
- **`orders_cancel` now refuses paid orders.** Before cancelling, the tool loads the order and,
  if it has received any payment (`totalPayed > 0`), returns an error pointing to the backoffice
  instead of triggering a refund. Unpaid / reserved bookings still cancel normally (this only
  releases slots — no money moves).
- **`manifest.json` API-server description fixed.** It no longer labels `api3.quinbook.com` as a
  "Beta/test" server for trying out write operations — every server talks to live production data,
  there is no sandbox. The description now says so.
- Server `instructions` document the no-financial-transactions boundary explicitly.

### Security
- `npm audit fix`: resolved all 6 reported advisories in shipped production
  dependencies (2 high — axios, fast-uri; 4 moderate) via semver-compatible
  updates (no breaking major bumps; axios → 1.17.0). `npm audit` now reports 0
  vulnerabilities. Build + tests green.

## [0.2.7] - 2026-06-05

### Added
- **MCP tool annotations on all 38 tools** — each tool now carries a human-readable
  `title` plus a `readOnlyHint` (17 reads) or `destructiveHint` (21 writes; 10 marked
  destructive: cancel/refund/delete/patch). Registration moved to the modern
  `server.registerTool` API. Required for the Anthropic connector directory and lets
  MCP clients render correct safety affordances.
- **`privacy_policies`** in `manifest.json` pointing to <https://quinbook.com/de/privacy>,
  plus a **Privacy Policy** section in the README (data collected, usage, local token
  storage, third parties, retention, contact).
- Regression test (`annotations.test.ts`) asserting every tool ships a `title` and the
  correct read/write hint.

### Changed
- **`manifest.json`: `dxt_version: "0.1"` → `manifest_version: "0.2"`** (directory
  submission requires manifest_version 0.2+).
- Legal entity aligned to **Woizzer AG** across `manifest.json`, `LICENSE` and README
  (was inconsistently "quinbook GmbH" in the license).
- README tool count corrected (36 → 38; `coupons_create` / `get_tax_groups` were missing).

## [Unreleased]

### Changed
- **Removed the `dryRun` mechanism.** Write tools now execute immediately. The
  confirm-before-write discipline lives in the bundled skills instead of a tool
  flag. (`dryRunField`/`dryRunPreview` removed; `dryRun` input dropped from all
  write tools.)
- **Token storage falls back to a file** (`~/.quinbook-mcp/secrets.json`, mode
  0600) when keytar's native module cannot load — e.g. an ABI mismatch against a
  bundled runtime. keytar stays primary where it loads.

### Added
- **Desktop Extension packaging** (`manifest.json`) so the server can be
  installed in Claude Desktop as a single `.mcpb` file (Settings → Extensions),
  with an optional API-server picker (production / beta).

## [0.2.0] - 2026-05-02

### Changed
- **Auth: switched from bundled `client_secret` to PKCE (RFC 7636).** The OAuth
  app `quinbook-mcp` is now registered as a public client on the backend; the
  authorization-code flow is bound to a per-session `code_verifier` instead of
  a shared secret. Refresh-token requests no longer require a secret either.
- Removed `QUINBOOK_OAUTH_CLIENT_SECRET` env var and the bundled default secret.
  `QUINBOOK_OAUTH_CLIENT_ID` is the only OAuth setting end-users can override.

### Why
- A `client_secret` shipped inside an npm package is not actually secret. PKCE
  is the standard mitigation for native/CLI public clients (RFC 8252) and lets
  us open-source the repo without leaking anything that adds attack surface.

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
