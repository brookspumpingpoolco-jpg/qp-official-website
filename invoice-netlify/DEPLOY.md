# Invoice site deploy (single source of truth)

Production Netlify site: **aesthetic-kataifi-88ba27**
(`https://aesthetic-kataifi-88ba27.netlify.app`)

## Canonical files

| What | Path | Notes |
| --- | --- | --- |
| Netlify config | `invoice-netlify/netlify.toml` | Redirects, functions dir, headers, Node 20 |
| Repo-root toml | `netlify.toml` | Pointer only: `[build] base = "invoice-netlify"`. No redirects. |
| gas-proxy | `invoice-netlify/netlify/functions/gas-proxy.mjs` | Only live proxy. Scheduling / liner / SR / 55s timeout / targetUrl allowlist. |
| Stripe / Telegram | `invoice-netlify/netlify/functions/create-stripe-checkout.mjs`, `send-telegram.mjs` | Unchanged. |

Do **not** add a second `netlify.toml` with `[[redirects]]` or a second `gas-proxy.mjs`. Those duplicates previously caused `/` to serve either `Login_Embed.html` or `InvoiceEstimateUI.html` depending on CLI vs Git, and an older proxy (main/acct/payment/auth only, different DEFAULT main/auth URLs) could ship if functions were taken from the repo root.

## Routes

| Path | Serves | Why |
| --- | --- | --- |
| `/` | `Login_Embed.html` | Auth gate for the Pool Co invoice workflow (matches CLI deploys from this folder). |
| `/invoice` | `InvoiceEstimateUI.html` | Invoice/estimate UI after login (or bookmark). |
| `/dashboard` | `Dashboard_Embed.html` | Quotes dashboard embed. |
| `/weekly`, `/weekly-service` | `WeeklyService.html` | Weekly service pages. |

HTML filenames still work directly (e.g. `/InvoiceEstimateUI.html`).

## How to deploy

**CLI (historical production path):**

```bash
cd invoice-netlify
netlify deploy --prod
```

**Git:** in the Netlify UI for aesthetic-kataifi-88ba27 set **Base directory** = `invoice-netlify` (Publish directory `.` relative to that folder). The repo-root `netlify.toml` `base` is a safety net if Git is connected at the repo root without that UI setting.

Do not drag-and-drop zip deploys; they skip functions (`gas-proxy`, Stripe, Telegram).

## Environment variables (Netlify UI only — never commit secrets)

Use the names the live proxy already reads:

- `GAS_MAIN_URL`
- `GAS_ACCT_URL`
- `GAS_PAYMENT_URL`
- `GAS_AUTH_URL`
- `GAS_SCHEDULING_URL`
- `GAS_LINER_URL`
- `GAS_SR_URL`
- `STRIPE_SECRET_KEY`

Login_Embed calls `/.netlify/functions/gas-proxy?t=auth`. Env vars override the DEFAULT `/exec` URLs in `gas-proxy.mjs`; those DEFAULTS are public Apps Script web-app URLs, not secrets.
