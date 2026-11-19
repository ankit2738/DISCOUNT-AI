# Integration Status

Last verified: 2026-11-19 (local macOS + Docker Desktop/Colima).

Legend:

- **Demo** — implemented with labelled fixture data; not live retailer data.
- **Functional local** — works against the local backend; not a third-party production integration.
- **Configured** — credentials/environment present. Configuration is not delivery proof.
- **Not configured** — intentionally requires credentials/onboarding.

## Retailer adapters

| Retailer | Status | Live-ready | Data | Required for live activation |
| --- | --- | --- | --- | --- |
| Amazon India | Demo | No | Labelled demo fixtures | `AMAZON_PAAPI_ACCESS_KEY`, `AMAZON_PAAPI_SECRET_KEY`, `AMAZON_PARTNER_TAG` + authorized agreement |
| Flipkart | Demo | No | Labelled demo fixtures | `FLIPKART_AFFILIATE_ID`, `FLIPKART_AFFILIATE_TOKEN` + authorized feed |
| Meesho | Demo | No | Labelled demo fixtures | `MEESHO_PARTNER_CREDENTIALS` + authorized feed |
| Myntra | Demo | No | Labelled demo fixtures | `MYNTRA_PARTNER_CREDENTIALS` + authorized feed |
| Croma | Demo | No | Labelled demo fixtures | `CROMA_FEED_CREDENTIALS` + authorized feed |
| Reliance Digital | Demo | No | Labelled demo fixtures | `RELIANCE_FEED_CREDENTIALS` + authorized feed |

No unauthorized scraping is performed. `/api/integrations/status` and `/api/admin/integrations` report this exact posture. The demo refresh action only changes labelled demo listings.

## Service integrations

| Integration | Status | Details |
| --- | --- | --- |
| Affiliate click redirect | Functional local | `/api/affiliate/click/{listing_id}` records click, cheapest flag, effective price and source page, then redirects. No affiliate network/postback is configured. |
| AI Copilot | Fallback | Deterministic rule-based fallback works without keys; authenticated conversations persist and consenting shopping-memory context is included. External provider only when `AI_PROVIDER` and `AI_API_KEY` are configured. No external AI is claimed live. |
| Telegram alerts | Not configured | Configuration status reported. No bot token in the checked environment. In-app alert records still work. |
| WhatsApp alerts | Not configured | Requires token and phone-number ID. No messages are claimed delivered. |
| Email | Console | `EMAIL_PROVIDER=console`; verification/reset responses do not claim external delivery. |
| Payments | Sandbox | `PAYMENT_PROVIDER=sandbox`; marketplace orders/transactions are records. Raw card, CVV and UPI values are rejected. |
| Redis/Celery | Functional local Docker | `worker` and `beat` containers start; alert and demo-refresh schedules are registered. No production broker/TLS setup. |
| PostgreSQL | Functional local Docker | Alembic migration applied; health reports `postgresql+psycopg`. |
| Chrome extension | Functional local/manual load | MV3 package in `extension/` with Amazon/Flipkart/generic parser, exact-variant resolve/intelligence calls and parser/API Playwright coverage. Not published to the Chrome Web Store. |
| PWA | Functional local | Manifest, PNG icons, service worker and `/offline`; private routes and `/api` are never cached. |
| Final delivery packages | Verified | Source, extension and documentation ZIPs passed `unzip -t`; final PDF present; external integrations remain unconfigured. |

## Admin integration view

`/admin/system` fetches:

- `/api/admin/health` — DB, environment, adapter states.
- `/api/admin/integrations` — AI/notification/payment/email configuration.
- `/api/admin/affiliate` — click attribution and cheaper-store CTR.
- `/api/admin/audit-logs` — operational audit events.

## Honesty rules

- “Demo” is not the same as “live”.
- “Configured” is not the same as “delivered”.
- A seeded savings figure is not a market claim.
- Fake-discount output is a risk indicator requiring verification, never an accusation.
- Commission must not influence ranking.
