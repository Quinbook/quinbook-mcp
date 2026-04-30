---
name: quinbook-multi-tenant
description: How to safely work across multiple quinbook companies (tenants) with quinbook-mcp. Use this when the user has access to more than one company and asks to operate on a specific one, or when an operation touched the wrong tenant.
allowed-tools:
  - mcp__quinbook__me_whoami
  - mcp__quinbook__me_companies
  - mcp__quinbook__me_switch_company
---

# Multi-tenant safety

quinbook users may have access to multiple companies. Tools always run against the **currently active company**, which is encoded in the access token's `icompany` claim. The active company can change in three ways:

1. **Explicit switch** via `me_switch_company` (intended)
2. **Token refresh** after ~30 min of access-token expiry — with older refresh tokens this can revert to a default company (`FirstOrDefault`)
3. **Process restart** (e.g. `/mcp` reconnect) — depending on the keytar state and refresh-token age

The MCP server has a defensive auto-correction: after every refresh it checks whether the resulting company matches the active pointer in keytar; if not, it immediately calls `switch_company` to restore. **Still: write operations should be guarded.**

## When to call `me_whoami`

- Before **every** writing operation if the user mentioned a specific company name
- When a previous call returned data from an unexpected company (look at `orderNumber` prefix or `iCompany` field in responses)
- After a `/mcp` reconnect at the start of a session

`me_whoami` is local-only (decodes the JWT, no API call) — it's free to use as often as needed.

## Workflow when the user names a company

```
User: "list the bookings for Wunderbar GmbH from last week"
```

1. `me_whoami` → check current `iCompany`
2. If it matches Wunderbar's id, proceed. If not:
3. `me_companies({ search: "Wunderbar" })` → get the list
4. Pick the right `iCustomer` from the result
5. `me_switch_company({ iCompany: <picked> })` — confirms with `{ ok: true, activeCompany }`
6. Now run the actual operation (`orders_list`, etc.)

## Workflow when the user says "switch to X"

Even more direct:

```
User: "switch to Woizzer please"
```

1. `me_companies({ search: "Woizzer" })` → confirm there's a single match
2. `me_switch_company({ iCompany: <found> })`
3. Confirm to user: *"Active company is now Woizzer AG (id 3)."*

## When the user has many companies

If `me_whoami` runs against an account with hundreds of companies (typical for support / partner accounts), `me_companies()` without filter is too large. **Always pass a `search` filter** in that case. If the user asks for "all companies", ask back which substring they want first.

## Read-only safety net

For any read tool you can detect tenant mismatch by inspecting the response:

- `orders_*` responses include `orderNumber` — the prefix `00000003.` means company id 3 (Woizzer), `00000001.` means company 1 (Quinbook)
- `slots_calendar` events have a `locationName` field that often hints at the tenant
- `contacts_search` results are scoped by `iCompany` server-side

If the prefix or location doesn't match what the user asked for, abort and run `me_switch_company` first.
