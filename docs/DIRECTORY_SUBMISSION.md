# Anthropic Directory Submission — Reviewer Guide & Checklist

This document is for submitting **quinbook-mcp** as a local MCP server (`.mcpb` desktop
extension) to the Anthropic / Claude software directory. It contains (1) the reviewer
setup instructions and (2) the pre-submission checklist.

---

## 1. Reviewer setup instructions

> **The reviewer needs nothing but Claude Desktop and a test login.** No website access,
> no backoffice/admin UI, no VPN, no server access. The connector authenticates with the
> ordinary quinbook OAuth login — the same self-service login any quinbook user has — and
> is scoped to the single test account whose credentials we provide.

### What to install

1. Download the bundle `quinbook-0.2.8.mcpb` (attached to the submission).
2. In **Claude Desktop → Settings → Extensions**, choose **Install from file** and pick the
   `.mcpb` (double-clicking the file works too).
3. When prompted for **API server**, leave the default `https://api.quinbook.com`.
4. Restart/enable the extension. On first tool use, the connector opens a browser window for
   the **OAuth login** — sign in with the test credentials below.

### Test credentials (fill in before submitting)

```
Login URL is opened automatically by the connector (OAuth).
Email:    <REVIEWER TEST EMAIL>
Password: <REVIEWER TEST PASSWORD>
Company:  <demo company name> (the account is scoped to this company only)
```

> These credentials belong to a **dedicated demo seller** populated with throwaway data —
> no real customers, no real money. quinbook runs a single production system (there is no
> separate sandbox), so the demo account is a real but isolated company used only for review.

### What the reviewer can try

| Action | Tool(s) | Notes |
|---|---|---|
| See who you are / switch company | `me_whoami`, `me_companies`, `me_switch_company` | Scoped to the demo company |
| List & inspect bookings | `orders_list`, `orders_get` | Read-only |
| Browse availability | `slots_calendar`, `slots_event`, `slots_get` | Read-only |
| Look up contacts / coupons | `contacts_search`, `coupons_find`, `get_tax_groups` | Read-only |
| Build a cart & check out a **test** booking | `cart_add_item`, `cart_checkout` | Offline payment only — no card is charged |
| Cancel an **unpaid** booking | `orders_cancel` | Just releases the slots |

### What the connector deliberately cannot do (financial-transaction boundary)

Per the directory policy (no outbound financial transactions), this connector:

- has **no refund tool** (`orders_refund_payment` was removed), and
- **refuses to cancel a paid order** — `orders_cancel` loads the order first and, if it has
  received any payment (`totalPayed > 0`), returns an error pointing to the backoffice
  instead of issuing a refund.

So a reviewer cannot move real money, even by trying. Cancelling/refunding a paid order is a
staff action in the quinbook backoffice, outside this connector.

---

## 2. Pre-submission checklist

### Technical (in the bundle) — ✅ done

- [x] `manifest.json` `manifest_version: 0.2` (≥0.2 required for `privacy_policies`)
- [x] `privacy_policies: ["https://quinbook.com/de/privacy"]` (HTTPS)
- [x] **Privacy Policy** section in `README.md` (collection, usage, local token storage,
      third parties, retention, contact)
- [x] Every tool carries `title` + `readOnlyHint`/`destructiveHint` annotations
      (enforced by `annotations.test.ts`)
- [x] All tool names ≤ 64 characters
- [x] OAuth 2.0 (Authorization Code + PKCE) for authentication
- [x] `icon.png` (512×512) referenced in the manifest
- [x] Author / legal entity = **Woizzer AG**; LICENSE consistent
- [x] No outbound financial transactions (refund tool removed, paid-cancel guard)
- [x] Manifest API-server description does not mislead (no fake "Beta/test" server)
- [x] Build green, tests green (`npm run test:ci`)
- [x] `.mcpb` built with `--omit=dev` (no vitest/build stack shipped)

### Needs attention before submitting — ⚠️

- [ ] **Dependency vulnerabilities.** `npm audit --omit=dev` reports 2 high (axios, fast-uri)
      + 4 moderate in shipped prod deps. The directory expects "reasonably current
      dependencies." Run `npm audit fix`, rebuild the bundle, re-run tests. Decide whether a
      breaking `axios` major bump is needed (review changelog first).

### Organizational (only the quinbook team can do) — ☐

- [ ] Make the GitHub repo `Quinbook/quinbook-mcp` **public** (homepage, docs and repo URLs
      in the manifest must resolve publicly by the publish date)
- [ ] Create the **demo seller / test account** and fill in the credentials in Section 1
- [ ] Verify the privacy policy URL <https://quinbook.com/de/privacy> is reachable
      (note: quinbook.**de** has a TLS cert mismatch — use quinbook.**com**)
- [ ] Submit via the **desktop extension submission form** and accept the
      Anthropic Software Directory Terms
- [ ] (Recommended) A short public doc/blog/help page describing the connector, live by the
      publish date

---

## 3. Rebuilding the bundle

```
npm run build
rm -rf .mcpb-staging && mkdir .mcpb-staging
cp -r dist manifest.json package.json package-lock.json README.md LICENSE CHANGELOG.md icon.png .mcpb-staging/
cp -r skills .mcpb-staging/skills
( cd .mcpb-staging && npm ci --omit=dev )
npx @anthropic-ai/mcpb@2.1.2 pack .mcpb-staging quinbook-<version>.mcpb
```

The `.mcpb` works on Windows and macOS from a single build: token storage uses the OS
credential store via `keytar` where its native module loads, and automatically falls back to
a 0600 file (`~/.quinbook-mcp/secrets.json`) where it does not.
