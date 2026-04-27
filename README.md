# @quinbook/mcp-api

MCP server that exposes the [quinbook](https://quinbook.com) public API as tools for AI assistants (Claude Desktop, Claude Code, IDEs, etc.).

> **Status:** private preview. Not yet published to npm.

## Features

- OAuth 2.0 Authorization Code flow with secure token storage (OS credential store via `keytar`)
- Automatic token refresh
- Rate-limit aware (8 req/s client-side throttle, respects `Retry-After`)
- Curated tool set covering bookings, slots, employees, customers, statistics, coupons
- Write operations default to `dryRun: true` for safety

## Configuration

Environment variables:

| Variable | Default | Description |
|---|---|---|
| `QUINBOOK_API_BASE_URL` | `https://api.quinbook.com` | Base URL of the quinbook API. Use `https://api3.quinbook.com` for the dev environment. |
| `QUINBOOK_OAUTH_CLIENT_ID` | _(required)_ | OAuth client id, issued by quinbook |
| `QUINBOOK_OAUTH_CLIENT_SECRET` | _(required)_ | OAuth client secret |

## Claude Desktop / Claude Code config

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

On first call the server opens a browser window for OAuth login. Tokens are stored in the OS credential store and auto-refreshed.

## Development

```bash
npm install
npm run build
npm start
```
