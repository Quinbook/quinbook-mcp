# @quinbook/mcp-api

MCP (Model Context Protocol) server that exposes the [quinbook](https://quinbook.com) public API as tools for AI assistants — Claude Desktop, Claude Code, IDEs and any other MCP-compatible client.

> **Status:** v0.1.0 — initial public release.

## Highlights

- **OAuth 2.0 Authorization Code flow** with a polling callback (no local web server needed during login)
- Token storage in the OS credential store via `keytar`
- Automatic refresh + auto-correction of the active company across token refreshes
- Rate-limit aware (8 req/s client-side throttle, respects `Retry-After`)
- Multi-tenant: per-company token cache, switch via `me_switch_company`
- All write tools default to `dryRun: true` so the LLM has to explicitly opt in

## Tools (36)

### Identity & Multi-Tenancy

- `me_whoami` – fast JWT decode (no API call)
- `me_companies` – list reachable companies, with optional `search`
- `me_switch_company` – switch active company (uses `grant_type=switch_company`)

### Read

- **Slots:** `slots_calendar`, `slots_event`, `slots_get`
- **Orders V2:** `orders_list`, `orders_get`, `orders_cart_list`, `orders_cart_get`, `orders_cart_calculate`
- **Coupons:** `coupons_get`, `coupons_find`, `coupons_used`
- **Contacts:** `contacts_search`, `contacts_get`, `contacts_notices_list`

### Write (all default `dryRun: true`)

- **Cart mutations:** `cart_add_item`, `cart_patch_item`, `cart_remove_item`, `cart_apply_coupon`, `cart_remove_coupon`, `cart_delete`, `cart_checkout`
- **Order lifecycle:** `orders_to_cart`, `orders_cancel`, `orders_record_payment`, `orders_refund_payment`, `orders_resend_confirmation`, `orders_resend_invoice`, `orders_patch_recipient`, `orders_patch_flags`
- **Contacts:** `contacts_add_notice`, `contacts_create`, `contacts_update`, `contacts_delete`

## Configuration

The package ships with a built-in OAuth client — no client id or secret to manage.

| Variable | Default | When to set |
|---|---|---|
| `QUINBOOK_API_BASE_URL` | `https://api.quinbook.com` | Override only for development against a different host |
| `QUINBOOK_OAUTH_CLIENT_ID` | _(bundled)_ | Override only for testing against an alternate OAuth app |
| `QUINBOOK_OAUTH_CLIENT_SECRET` | _(bundled)_ | Override only for testing against an alternate OAuth app |
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
→ KI ruft orders_get(12345), orders_cancel({iOrder:12345, refundMethod:"...", reason:"..."}, dryRun:true),
  shows preview → on confirmation → dryRun:false

You: "Add a Reindeer Antler Headband to a cart for Henning, ship to his address."
→ KI ruft contacts_search({search:"Henning"}), cart_add_item dryRun, cart_checkout dryRun → confirm → real
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
| [`booking-workflow`](./skills/booking-workflow.md) | slots → cart → optional coupon → calculate → checkout → verify, with dry-run discipline |
| [`refund-workflow`](./skills/refund-workflow.md) | `orders_cancel` with refund-method matrix per payment type, fees, partial refunds |
| [`multi-tenant`](./skills/multi-tenant.md) | when to call `me_whoami`, how to switch companies, safety net for cross-tenant operations |

Drop them into `~/.claude/skills/` (or your IDE's equivalent) so Claude reads the workflow before reaching for tools.

## Roadmap

- [x] **0.1** — initial release: 36 tools, OAuth polling-callback, dryRun pattern, multi-tenancy
- [ ] **0.2** — PKCE (RFC 7636) instead of bundled client secret; tests + CI; smithery.ai listing
- [ ] **0.3** — `shifts_*` tools (employee skills, workload, historic shifts) wrapping the AiTools backend; selectable LLM-friendly compact projections for more endpoints
- [ ] **0.4** — write tools for shifts (assignment changes), survey statistics; English UI translations of error messages

## Architecture

- **OAuth Polling-Callback** – the server registers a `polling_token` (UUID) with the authorize endpoint instead of a loopback redirect URI. After successful login the backend stores the auth-code in Redis under that token; the MCP polls `GET /v1/auth/poll?polling_token=…` until the code arrives, then exchanges it via `POST /v1/auth/token` as usual. Avoids needing a local web server, works behind firewalls/NAT, lets the user complete the login on a different device if desired.
- **Per-company token cache** – keytar stores tokens under `<host>::<clientId>::<iCompany>`, with a separate `::active` pointer. `me_switch_company` mints a new access token via `grant_type=switch_company` (uses the current bearer in the Authorization header).
- **Defensive active-pointer correction** – if the backend's refresh path returns a token bound to a different company than the active pointer (a known issue when the `icompany` claim is missing from older refresh tokens), the client immediately re-runs `switch_company` to restore the desired company.
- **`dryRun: true` by default** on every write tool. The handler returns the planned API call (method, url, body) without executing it. The LLM has to explicitly set `dryRun: false` to commit.
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
QUINBOOK_OAUTH_CLIENT_SECRET=… \
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

## License

[MIT](./LICENSE) © quinbook GmbH.

The MIT license covers **the code in this repository** (the MCP server itself). Use of the quinbook API endpoints exposed through this server is governed by the quinbook Terms of Service. "quinbook" is a trademark of quinbook GmbH.
