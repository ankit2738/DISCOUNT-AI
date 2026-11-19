# Test Report

Last verified: 2026-11-19 (Asia/Kolkata local machine, macOS, Apple silicon).

## Summary

| Suite | Command | Result |
| --- | --- | --- |
| Backend API/unit | `cd backend && ../.venv/bin/python -m pytest -q` | **81 passed**, 1 warning, ~1.6s |
| Frontend typecheck | `cd frontend && npm run typecheck` | **Passed** |
| Frontend unit | `cd frontend && npm test` | **16 passed** in 4 files |
| Frontend production build | `cd frontend && npm run build` | **Passed**, 44 routes |
| Browser smoke | `cd frontend && npm run test:e2e` | **12 passed** Chromium |
| Extension-focused Playwright | `npx playwright test e2e/extension.spec.ts` | **3 passed** Chromium |
| Persistence and permissions | Authenticated Docker PostgreSQL/restart script | **11 checks passed** |
| Docker build | `docker compose build` | Backend, worker, beat, frontend built |
| Docker runtime | `docker compose up -d` | db/redis/backend healthy; worker/beat/frontend up |
| Final workflow smoke | Authenticated API script through frontend proxy | **14 checks passed** |
| Final archives | `unzip -t` on all release ZIPs | **Passed** |

## Backend

Coverage areas exercised by the suite:

- Legacy and API health contracts, DB status, counts, integrations.
- Registration/login/me/password/preferences/privacy.
- Search and exact-variant filtering, comparison sorting/rejection.
- Price history, deal score, fake-discount signals, buy/wait, alternatives, warranty.
- Coupon/bank-offer pricing and decimal calculation.
- Cart, watchlist, alerts/notifications, purchases.
- AI fallback and provider status.
- Community reports/votes/leaderboard/moderation.
- Marketplace sellers/listings/orders/disputes.
- Campaigns, analytics, affiliate click redirect.
- Admin users/catalogue/offers/integrations/audit.
- New public contracts: slug detail, deals ordering, contact message, affiliate redirect, comparison slug.
- Shopping memory consent/clear/context, persisted AI conversations, conversation privacy and deletion with account removal.
- Warranty ownership, seller-role approval, extension exact-variant matching and unrelated-page rejection.
- Marketplace fee split, order idempotency, duplicate-dispute rejection, seller earnings and refund state.
- Cart delivery/pre-offer totals and coupon non-duplication.

Observed warning:

```
StarletteDeprecationWarning: Using `httpx` with `starlette.testclient` is deprecated; install `httpx2` instead.
```

This is from FastAPI’s test client dependency, not application code. No test failures.

## Frontend unit tests

Files:

- `lib/format.test.ts` — INR/date/title formatting.
- `lib/api.test.ts` — query building, headers, FastAPI detail extraction, network errors.
- `lib/coupon-wallet.test.ts` — localStorage wallet add/remove and corrupt data handling.
- `components/ui/feedback.test.tsx` — Alert/Badge accessibility and variants.

Result: **4 files, 16 tests passed**. Test cleanup is registered in `vitest.setup.ts`.

## Playwright

Command: `npm run test:e2e`. Playwright starts its own backend on port 8100 and Next dev server on port 3100 by default; these differ from the Docker stack ports. Backend uses `/tmp/discount-ai-e2e.db`, seeded with demo data. The config accepts `E2E_BACKEND_PORT`/`E2E_FRONTEND_PORT` overrides and always starts fresh test servers.

Passing scenarios:

1. Home page promise and demo disclosure.
2. Search → iPhone product page → exact-variant comparison.
3. Demo shopper login → dashboard and alerts navigation.
4. Anonymous admin blocked; seeded admin login → `/admin`.
5. `/compare?product=<id>` renders saving/retailer data.
6. Shopping-memory add/delete flow.
7. Seller workspace and marketplace safety.
8. Dedicated admin product/analytics/audit routes.
9. Offline fallback route.
10. Amazon and Flipkart parser fixtures.
11. Extension resolve/intelligence API path (exact variant, price history, comparison).

Result: **12 passed**. Chromium `159.0.8154.6` installed via `npx playwright install chromium`.

## Persistence and permissions

A Docker-backed script verified invalid-password rejection, shopper/seller denial from admin APIs, admin access, seller workspace access, demo user persistence, shopping-memory creation and PostgreSQL persistence across a backend restart, followed by test-record deletion. All 11 checks passed.

## Final workflow smoke

An authenticated smoke script exercised the running Docker stack through the frontend proxy and passed: demo/seller/admin login, product search, exact-variant comparison, offers, price history, alerts, grounded AI conversation, shopping memory, extension resolve, extension intelligence, marketplace listings, seller workspace, admin overview and admin integrations.

## Docker verification

Commands:

```bash
docker compose build
docker compose up -d
docker compose ps
```

Verified:

- `/health` → exact `{"status":"ok","service":"discount-ai-backend"}`.
- `/api/health` → status ok; PostgreSQL connected; counts: 12 products, 34 listings, 6 retailers.
- Frontend `/` → HTTP 200.
- Frontend `/api/products/search?q=iphone` proxy → total ≥ 1.
- Frontend `/dashboard/memory`, `/offline` and `/api/extension/resolve` → HTTP 200 after rebuild.
- Demo login through proxy → JWT issued.
- Comparison through proxy → iPhone 15 128GB, 3 listings.
- Affiliate click through proxy → HTTP 307 to labelled demo URL.
- Worker registered both Celery tasks and connected to Redis.
- Beat dispatched `check-price-alerts`.
- Backend containers run as non-root `appuser`.
- CORS preflight from `chrome-extension://…` returned the extension origin, enabling the popup/background API client.

## Build/runtime notes

- Next.js production build generated 44 routes; `/products/[slug]`, `/sale-events/[slug]` and `/admin/[section]` are dynamic; others static.
- Next.js rewrites `/api/:path*` to `BACKEND_URL`; Docker uses `http://backend:8000`.
- `allowedDevOrigins` includes localhost/127.0.0.1 for Playwright dev-server stability.
- Docker health checks use Python stdlib for the backend and `pg_isready`/`redis-cli` for dependencies.
- Backend container command runs `alembic upgrade head` before Uvicorn.
- PostgreSQL Alembic current/head was verified as `2f6a9c31b7d4`.
- All final release ZIPs were checked with `unzip -t` and inspected for excluded secrets/caches. The source archive was also extracted and its backend suite rerun successfully.

## Not tested / not claimed

- No live Amazon/Flipkart/Meesho/Myntra/Croma/Reliance API or scraping.
- No real AI provider call, email delivery, Telegram/WhatsApp delivery or payment capture.
- Chrome extension parser/API paths are covered by Playwright; the full MV3 package was not loaded by an extension-aware browser harness or reviewed by the Chrome Web Store.
- No load/performance, penetration, accessibility audit or production observability testing.
- Mobile Safari/Firefox were not part of the Playwright smoke run.
