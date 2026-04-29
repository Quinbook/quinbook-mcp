# @quinbook/mcp-api

MCP (Model Context Protocol) server that exposes the [quinbook](https://quinbook.com) public API as tools for AI assistants — Claude Desktop, Claude Code, IDEs and any other MCP-compatible client.

> **Status:** private preview. Not yet published to npm.

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

| Variable | Default | Description |
|---|---|---|
| `QUINBOOK_API_BASE_URL` | `https://api.quinbook.com` | Base URL of the quinbook API |
| `QUINBOOK_OAUTH_CLIENT_ID` | _(required)_ | OAuth client id, issued by quinbook |
| `QUINBOOK_OAUTH_CLIENT_SECRET` | _(required)_ | OAuth client secret |
| `QUINBOOK_DEBUG` | _(unset)_ | If set, logs outbound headers (with bearer masked) to stderr |

## Setup in Claude Desktop / Claude Code

Edit `claude_desktop_config.json` (Desktop) or `.mcp.json` (Code), add:

```json
{
  "mcpServers": {
    "quinbook": {
      "command": "npx",
      "args": ["-y", "@quinbook/mcp-api"],
      "env": {
        "QUINBOOK_OAUTH_CLIENT_ID": "your-client-id",
        "QUINBOOK_OAUTH_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

On the first tool call the server opens a browser window for OAuth login. The user logs in once; the resulting tokens are saved to the OS credential store and auto-refreshed for the lifetime of the refresh token (~30 days). No further interactive login is required during that window.

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

## License

UNLICENSED — private preview.
