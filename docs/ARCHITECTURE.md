# Architecture

## System overview

```
Browser / PWA / Chrome extension
        │  HTTPS JSON (Bearer JWT)
        ▼
Next.js 16 (App Router) ── /api proxy ──► FastAPI
        │                                   ├── PostgreSQL
        └── service worker/cache            ├── Redis ── Celery worker + beat
                                            ├── Retailer adapters (demo fixtures)
                                            └── Optional AI / Telegram / WhatsApp / email
```

The Next.js server proxies `/api/:path*` to `BACKEND_URL` (default `http://127.0.0.1:8000`). This keeps browser calls same-origin and avoids exposing internal service addresses. FastAPI CORS additionally allows configured frontend origins and `chrome-extension://` origins for the extension.

## Backend layers

- `app/main.py` — FastAPI app, lifespan DB init/seed, CORS, rate-limit middleware, routers.
- `app/api/` — HTTP contracts only, grouped by domain.
- `app/services/` — business logic:
  - `pricing.py` — `Decimal` price arithmetic, coupon/bank eligibility, effective price.
  - `matching.py` — catalogue search and exact-variant matching.
  - `intelligence.py` — deal score, fake-discount signals, buy/wait advice, alternatives.
  - `serializers.py` — stable API payload builders and money serialisation.
  - `ai.py` — optional external provider plus deterministic rule-based fallback.
  - `notifications.py` — alert evaluation, in-app records and channel status.
  - `seed.py` — idempotent labelled demo dataset.
- `app/adapters/` — retailer adapter contracts with fixture-only demo implementations and explicit credential/status reporting.
- `app/models.py` — 37 SQLAlchemy tables.
- `app/worker.py` — Celery tasks for alerts and demo price refresh.

## Data flow: price comparison

1. Search resolves products and variants. Variant filters exclude size/colour/storage mismatches.
2. `/api/comparison` requires a product and optional variant, rejects a variant belonging to another product, and selects only listings for the chosen variant.
3. Effective price = listing price + delivery − best eligible coupon. Bank offers are shown as optional reductions, not silently merged into the headline effective price.
4. Listings are sorted by effective price; exactly one can be cheapest. Commission is not a ranking factor.
5. `/api/affiliate/click/{listing_id}` records `effective_price`, `comparison_cheapest`, source page and optional session, then redirects to the retailer.
6. Primary metric = cheapest-listing clicks ÷ recorded comparison sessions. It is exposed only as a labelled operator metric.

## Frontend structure

- `app/` — public routes, `/dashboard/*`, `/admin/*`.
- `components/auth-provider.tsx` — restores JWT from `localStorage`, fetches `/api/auth/me`, exposes login/logout.
- `components/site-header.tsx`, `dashboard-shell.tsx`, `admin-shell.tsx` — role-aware shells.
- `lib/api.ts` — typed `apiFetch`, `ApiError`, query builder, abort support.
- `lib/types.ts` — shared API response types.
- `lib/coupon-wallet.ts` — browser-only coupon wallet.
- PWA: `public/manifest.webmanifest`, `public/sw.js`; service worker caches app shell/static assets and never caches `/api`.

Most interactive pages are client components that fetch browser-side through the proxy. Server components provide metadata/layout. `useSearchParams` is wrapped in Suspense where needed.

## Chrome extension

Manifest V3:

- `content.js` — reads JSON-LD Product/Offer, Open Graph/product metadata, then a conservative page fallback; never sends credentials.
- `background.js` — stores API/web URLs and JWT in `chrome.storage.local`, performs API requests, login and alert creation.
- `popup.html/js/css` — shows detected page product, exact-variant comparison, cheapest-store handoff through the affiliate endpoint, and price-alert creation.

The extension uses the same public APIs. It requires a reload of already-open tabs after installation so the content script is present.

## Background jobs

Celery with Redis:

- `check_alerts_task` every 15 minutes — evaluates active alerts and creates notifications.
- `refresh_prices_task` every 6 hours — refreshes labelled demo prices only while `DEMO_MODE=true`.

Docker Compose runs one worker and one beat process. Without Redis, the API still works; scheduled checks do not run.

## Security and honesty boundaries

- Passwords hashed with scrypt; JWTs signed with `SECRET_KEY`.
- Admin routes require role `admin`; seller/marketplace ownership checks apply.
- Rate-limit middleware defaults to 120 requests/minute; tests raise it.
- Sandbox payments are records only; no card/CVV/UPI fields are accepted.
- Retailer adapters are demo-only until authorized feeds and credentials exist. `/api/integrations/status` states this explicitly.
- AI uses deterministic fallback unless `AI_PROVIDER` and credentials are configured.
- Email is console-level; notification providers report configuration, not delivery success.
- Coupon wallet and extension preferences are local browser data, not server persistence.

## Deployment notes

- Backend image runs `alembic upgrade head` then Uvicorn.
- Frontend uses Next standalone output and proxies to `http://backend:8000`.
- PostgreSQL data and Redis AOF are Docker volumes.
- Use a random `SECRET_KEY`, strong database password and explicit `FRONTEND_ORIGINS` outside local demo use.
