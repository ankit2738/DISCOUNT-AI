# DISCOUNT AI — Agent Guide

## Purpose

Build and maintain a production-minded Indian shopping-intelligence platform: exact-variant price comparison, deal intelligence, coupons, alerts, AI Copilot, community evidence, a sandbox coupon marketplace, admin operations and a Chrome extension.

Tagline: **Buy Smarter. Not Just Cheaper.**

## Non-negotiable product rules

- Never fabricate live retailer data, verification, savings, user activity or integration success.
- All seeded data must stay visibly labelled `is_demo` / “Demo”.
- Affiliate commission must never affect ranking. The primary product metric is cheaper-store click-through rate.
- Price comparisons must use the same product **variant** (for example iPhone 15 128GB, not iPhone 15 generally).
- Use `Decimal`/numeric currency handling in the backend. Never use floats for money.
- Buy/wait advice, deal scores and fake-discount signals must include evidence and limitations.
- Do not accuse a retailer of fraud. Present risk signals as prompts to verify.
- Payments are sandbox-only. Reject raw card, CVV and UPI values.
- Never expose secrets, tokens or full payment details in logs, responses or client bundles.

## Stack

- Frontend: Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Radix/shadcn primitives, Recharts, React Hook Form + Zod.
- Backend: FastAPI, SQLAlchemy 2, Pydantic 2, Alembic, JWT, scrypt password hashing.
- Data: PostgreSQL in Docker/production; SQLite for fast local tests.
- Async: Redis + Celery worker and beat.
- Extension: Chrome Manifest V3, service worker, content script, popup.
- Tests: Pytest, Vitest + Testing Library, Playwright.

## Layout

```
backend/app/api/          FastAPI routers
backend/app/adapters/     Retailer adapter fixtures/status
backend/app/services/     Pricing, intelligence, matching, AI, seed, notifications
backend/app/models.py     SQLAlchemy schema
backend/tests/            Pytest suite
frontend/app/             Public, dashboard and admin routes
frontend/components/      Shells, product UI, UI primitives
frontend/lib/             Typed API client, types, formatting, wallet
frontend/e2e/             Playwright smoke tests
extension/                Chrome MV3 extension
docs/                     Architecture, API, schema, status, tests
```

## Commands

Run from the repository root unless noted.

```bash
# Backend tests
cd backend && ../.venv/bin/python -m pytest -q

# Backend dev server
cd backend && ../.venv/bin/python -m uvicorn app.main:app --reload --port 8000

# Frontend checks
cd frontend && npm run typecheck
cd frontend && npm test
cd frontend && npm run build
cd frontend && npm run test:e2e

# Full Docker stack
docker compose up --build -d
docker compose ps
docker compose logs -f backend
docker compose down
```

The Playwright config starts the backend and frontend itself. It uses `/tmp/discount-ai-e2e.db`, so it does not touch local development data.

## Environment

- Local backend defaults to `sqlite:///./discount_ai.db`, demo seed enabled.
- Docker uses PostgreSQL and Redis. Copy `.env.example` to `.env` only for local Docker use; never commit `.env`.
- `SECRET_KEY` must be at least 32 random bytes outside development.
- `FRONTEND_ORIGINS` is comma-separated. Chrome extension origins are allowed by regex for the extension API client.

## Demo credentials

| Role | Email | Password |
| --- | --- | --- |
| Shopper | `demo@discountai.in` | `DemoPass123!` |
| Admin | `admin@discountai.in` | `AdminPass123!` |
| Seller | `seller@discountai.in` | `SellerPass123!` |

These are seeded, local-only demo accounts.

## Engineering conventions

- Backend routers live in `backend/app/api/`; business logic belongs in `backend/app/services/`.
- Use the existing `apiFetch` client and shared types in `frontend/lib/`.
- Preserve the `/health` contract exactly: `{"status":"ok","service":"discount-ai-backend"}`.
- Public catalogue routes are `/api/products`, `/api/products/search`, `/api/products/slug/{slug}`, `/api/products/{id}`, `/api/deals`.
- Comparison pages use `product` and `variant` query parameters.
- Retailer outbound links must go through `/api/affiliate/click/{listing_id}?source_page=...` so attribution is recorded.
- Coupon wallet data is local to the browser; do not imply server persistence.
- Add demo disclosures to new seeded or simulated surfaces.
- Do not add comments unless they explain non-obvious intent.
- Keep UI consistent with existing shadcn-style primitives and Tailwind tokens.

## Verification expectations

Before claiming completion:

1. Run backend Pytest.
2. Run frontend typecheck, Vitest and production build.
3. Run Playwright smoke tests when routes or auth change.
4. Rebuild Docker and verify `/health`, `/api/health`, frontend `/` and `/api` proxy.
5. Update `docs/IMPLEMENTATION_STATUS.md`, `docs/INTEGRATION_STATUS.md` and `docs/TEST_REPORT.md` with actual results.
6. Do not claim an unconfigured external integration is live.

## Git

Do not commit, amend, push or create a PR unless explicitly requested.
