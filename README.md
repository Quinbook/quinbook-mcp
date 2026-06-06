# @quinbook/mcp-api

MCP (Model Context Protocol) server that exposes the [quinbook](https://quinbook.com) public API as tools for AI assistants — Claude Desktop, Claude Code, IDEs and any other MCP-compatible client.

> **Status:** v0.2.8 — PKCE auth, 37 tools (each with MCP annotations), Desktop Extension (`.mcpb`) packaging. No outbound financial transactions (no refunds; paid orders cannot be cancelled here).

## Highlights

- **OAuth 2.0 Authorization Code flow** with a polling callback (no local web server needed during login)
- Token storage in the OS credential store via `keytar`
- Automatic refresh + auto-correction of the active company across token refreshes
- Rate-limit aware (8 req/s client-side throttle, respects `Retry-After`)
- Multi-tenant: per-company token cache, switch via `me_switch_company`
- Write tools execute immediately — the model is expected to confirm with the user first (the bundled skills enforce this)

## Tools (37)

### Identity & Multi-Tenancy

- `me_whoami` – fast JWT decode (no API call)
- `me_companies` – list reachable companies, with optional `search`
- `me_switch_company` – switch active company (uses `grant_type=switch_company`)

### Read

- **Slots:** `slots_calendar`, `slots_event`, `slots_get`
- **Orders V2:** `orders_list`, `orders_get`, `orders_cart_list`, `orders_cart_get`, `orders_cart_calculate`
- **Coupons:** `coupons_get`, `coupons_find`, `coupons_used`
- **Tax:** `get_tax_groups`
- **Contacts:** `contacts_search`, `contacts_get`, `contacts_notices_list`

### Write (execute immediately — confirm first)

- **Cart mutations:** `cart_add_item`, `cart_patch_item`, `cart_remove_item`, `cart_apply_coupon`, `cart_remove_coupon`, `cart_delete`, `cart_checkout`
- **Order lifecycle:** `orders_to_cart`, `orders_cancel` (unpaid orders only), `orders_record_payment` (offline only), `orders_resend_confirmation`, `orders_resend_invoice`, `orders_patch_recipient`, `orders_patch_flags`
- **Coupons:** `coupons_create`
- **Contacts:** `contacts_add_notice`, `contacts_create`, `contacts_update`, `contacts_delete`

> **No outbound money movement.** This connector deliberately cannot execute outbound financial
> transactions. There is no refund tool, and `orders_cancel` refuses any order that has received a
> payment (`totalPayed > 0`) — cancelling or refunding a paid order has to be done by staff in the
> quinbook backoffice. `orders_record_payment` only books *offline* payments (cash/transfer/POS); it
> does not charge cards.

Every tool ships with MCP annotations — a human-readable `title` plus a `readOnlyHint` (reads) or `destructiveHint` (writes) — so MCP clients can render the right safety affordances.

## Configuration

The package ships with a built-in OAuth client id — no secret to manage. Authentication uses the OAuth 2.0 Authorization Code flow with **PKCE** (RFC 7636), which is the recommended pattern for native/CLI public clients per RFC 8252. The `client_id` is a public identifier and intentionally bundled.

| Variable | Default | When to set |
|---|---|---|
| `QUINBOOK_API_BASE_URL` | `https://api.quinbook.com` | Override only for development against a different host |
| `QUINBOOK_OAUTH_CLIENT_ID` | _(bundled)_ | Override only for testing against an alternate OAuth app |
| `QUINBOOK_DEBUG` | _(unset)_ | If set, logs outbound headers (with bearer masked) to stderr |

## Who is this for?

- **Quinbook customers** (event organisers, escape rooms, museums, sport facilities, ticketing operators) who want to talk to their booking system in plain language: *"How many bookings for Saturday's Escape Room?"*, *"Cancel order 12345 with a 5 € fee."*, *"Add a discount coupon for the kids' event next month."*
- **Power users / multi-tenant operators** managing several companies at once. Switch with `me_switch_company` and continue working in the chat.
- **Backoffice automation** — combine quinbook-mcp with other MCP servers (filesystem, sheets, …) to build refund-batch workflows, daily-report-generators, etc.

## Example prompts

```
You: "Show me how many bookings Wunderbar GmbH had last week."
→ KI ruft me_companies({search:"Wunderbar"}), me_switch_company(108),
  orders_list({ dateFrom: "2026-04-23", dateTo: "2026-04-29" })

You: "Cancel order 12345 because the customer is sick. Charge no fee."
→ KI ruft orders_get(12345), bestätigt die Details mit dem User
  → orders_cancel({iOrder:12345, refundMethod:"...", reason:"..."})

You: "Add a Reindeer Antler Headband to a cart for Henning, ship to his address."
→ KI ruft contacts_search({search:"Henning"}), bestätigt → cart_add_item → cart_checkout
```

The included [skills](./skills) (`quinbook-booking`, `quinbook-refund`, `quinbook-multi-tenant`) describe these flows in detail so Claude follows them consistently.

## Setup in Claude Desktop / Claude Code

Edit `claude_desktop_config.json` (Desktop) or `.mcp.json` (Code), add:

```json
{
  "mcpServers": {
    "quinbook": {
      "command": "npx",
      "args": ["-y", "@quinbook/mcp-api"]
    }
  }
}
```

That's it — no client id, no secret. On the first tool call the server opens a browser window for the OAuth login. The user logs in **with their own quinbook user credentials**; the resulting tokens are saved to the OS credential store and auto-refreshed for the lifetime of the refresh token (~30 days). No further interactive login is required during that window.

## Skills

The repo ships with three companion skills that teach Claude how to use the tools well:

| Skill | What it covers |
|---|---|
| [`booking-workflow`](./skills/booking-workflow.md) | slots → cart → optional coupon → calculate → checkout → verify, with confirm-before-write discipline |
| [`refund-workflow`](./skills/refund-workflow.md) | `orders_cancel` with refund-method matrix per payment type, fees, partial refunds |
| [`multi-tenant`](./skills/multi-tenant.md) | when to call `me_whoami`, how to switch companies, safety net for cross-tenant operations |

Drop them into `~/.claude/skills/` (or your IDE's equivalent) so Claude reads the workflow before reaching for tools.

## Roadmap

- [x] **0.1** — initial release: 36 tools, OAuth polling-callback, multi-tenancy
- [ ] **0.2** — PKCE (RFC 7636) instead of bundled client secret; tests + CI; smithery.ai listing
- [ ] **0.3** — `shifts_*` tools (employee skills, workload, historic shifts) wrapping the AiTools backend; selectable LLM-friendly compact projections for more endpoints
- [ ] **0.4** — write tools for shifts (assignment changes), survey statistics; English UI translations of error messages

## Architecture

- **OAuth Polling-Callback** – the server registers a `polling_token` (UUID) with the authorize endpoint instead of a loopback redirect URI. After successful login the backend stores the auth-code in Redis under that token; the MCP polls `GET /v1/auth/poll?polling_token=…` until the code arrives, then exchanges it via `POST /v1/auth/token` as usual. Avoids needing a local web server, works behind firewalls/NAT, lets the user complete the login on a different device if desired.
- **Per-company token cache** – keytar stores tokens under `<host>::<clientId>::<iCompany>`, with a separate `::active` pointer. `me_switch_company` mints a new access token via `grant_type=switch_company` (uses the current bearer in the Authorization header).
- **Defensive active-pointer correction** – if the backend's refresh path returns a token bound to a different company than the active pointer (a known issue when the `icompany` claim is missing from older refresh tokens), the client immediately re-runs `switch_company` to restore the desired company.
- **Write tools execute immediately.** There is no dry-run mechanism; the model is expected to confirm the action with the user before calling a write tool (the bundled skills enforce this discipline).
- **Schema coercion** – tool inputs use `z.coerce.number()` and a custom `coerceBool()` helper (because `z.coerce.boolean()` would treat the string `"false"` as `true`).

## Development

```bash
npm install
npm run build
npm start
```

Smoke test (full OAuth + sample tool calls):

```bash
QUINBOOK_API_BASE_URL=https://api3.quinbook.com \
QUINBOOK_OAUTH_CLIENT_ID=… \
node dist/test-flow.js
```

## Troubleshooting / FAQ

**Q: My active company keeps switching back to a different one after a while.**  
This is the known refresh-token edge case the client auto-corrects: the server falls back to `FirstOrDefault` when an old refresh-token doesn't carry the `icompany` claim. After one login cycle with a fresh token, the issue stops.

**Q: I get an `invalid_redirect_uri` error during login.**  
Ensure your OAuth app on the quinbook backend has `redirect_uris` set to a list including `"http://127.0.0.1/callback"` (loopback wildcard). Polling-mode does not require this — it uses the `urn:woizzer:polling` marker instead — but mixed setups can confuse the matcher.

**Q: Output is too large for my LLM tool budget.**  
`slots_calendar` already uses the compact backend variant. For per-event filtering, pass the `ievent` argument. For order listings, use `limit` (max 100) and date filters.

**Q: How do I log out / switch user?**  
Delete the keytar entries via your OS credential manager (search for `quinbook-mcp` service), then call any tool — the polling-flow login will re-trigger.

## Privacy Policy

This MCP server is a thin client to the quinbook API operated by **Woizzer AG**. The full,
authoritative privacy policy is published at **<https://quinbook.com/de/privacy>**. A summary of
how *this connector* handles data:

- **What it collects / processes.** Your quinbook login credentials are entered directly on the
  quinbook OAuth page — the server never sees or stores your password. It processes the OAuth
  access/refresh tokens it receives, and the request/response payloads of the API calls you trigger
  (bookings, orders, contacts, coupons, slots). These are the same data you already manage in your
  quinbook account.
- **How it uses the data.** Solely to execute the tool calls you (via the AI assistant) request
  against the quinbook API. No analytics, no telemetry, no profiling.
- **Where / how long it stores it.** Tokens are stored **locally on your machine** — in the OS
  credential store (`keytar`) or, as a fallback, a file at `~/.quinbook-mcp/secrets.json`
  (mode 0600). Nothing is stored on any server operated by this project. Tokens live until they
  expire (refresh token ~30 days) or you delete them (see "How do I log out" above). API payloads
  are not persisted by the connector beyond the lifetime of the request.
- **Third parties.** Data flows only between your machine and the quinbook API host you configure
  (`QUINBOOK_API_BASE_URL`, default `https://api.quinbook.com`). When run inside an AI client
  (Claude Desktop, etc.), tool inputs/outputs are also processed by that client per its own privacy
  policy. No other third party receives data from this connector.
- **Contact.** Data controller: Woizzer AG, Osakaallee 2, 20457 Hamburg, Germany —
  <support@quinbook.com>.

## License

[MIT](./LICENSE) © Woizzer AG.

The MIT license covers **the code in this repository** (the MCP server itself). Use of the quinbook API endpoints exposed through this server is governed by the quinbook Terms of Service. "quinbook" is a trademark of Woizzer AG.
