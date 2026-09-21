# Deprecated — do not use this folder for the invoice site

The live Netlify function for the A Quality Pool Company invoice site is:

**`invoice-netlify/netlify/functions/gas-proxy.mjs`**

That copy is the one shipped by CLI deploys from `invoice-netlify/` and by Git deploys with Base directory = `invoice-netlify`. It includes scheduling / liner / SR targets, a 55s abort timeout, empty-body handling, and optional `targetUrl` allowlisting.

The older `gas-proxy.mjs` that used to live here (main/acct/payment/auth only, different DEFAULT main/auth URLs, no timeout) was removed so it cannot silently diverge or ship if a deploy accidentally used the repo-root functions directory.

Stripe checkout and Telegram live under `invoice-netlify/netlify/functions/` as well.

See `invoice-netlify/DEPLOY.md`.
