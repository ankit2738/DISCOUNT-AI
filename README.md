# DISCOUNT AI

DISCOUNT AI is a full-stack Indian shopping-intelligence and coupon-resale marketplace: exact-variant price comparison, price history, deal verification, AI Copilot, alerts, smart cart, savings tracking, a sandbox coupon marketplace and a Chrome MV3 extension.

## Stack

- Backend: FastAPI, SQLAlchemy 2, Alembic, PostgreSQL/SQLite, Celery/Redis.
- Frontend: Next.js App Router, React, TypeScript, Tailwind, PWA shell.
- Extension: Chrome Manifest V3 popup + side panel for Amazon.in and Flipkart.
- Tests: Pytest, Vitest, Playwright.

## Quick start with Docker

```bash
cp .env.example .env
# Replace SECRET_KEY and the database password before non-demo use.
docker compose up --build -d
docker compose ps
```

- Web app: http://localhost:3000
- API: http://localhost:8000
- API docs: http://localhost:8000/docs

The backend runs Alembic migrations at start-up. Demo data is seeded when `SEED_DEMO_DATA=true` and `DEMO_MODE=true`.

## Local development

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cd backend && alembic upgrade head && uvicorn app.main:app --reload --port 8000
```

```bash
cd frontend
npm install
npm run dev
```

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Shopper | `demo@discountai.in` | `DemoPass123!` |
| Seller | `seller@discountai.in` | `SellerPass123!` |
| Admin | `admin@discountai.in` | `AdminPass123!` |

Passwords are demo-only. Never reuse them in a live deployment.

## Coupon marketplace

Customers can apply as sellers, submit transferable coupons with evidence and conditions, and list them after admin approval. Coupon codes are encrypted at rest and masked in public APIs; the code is decrypted only for the authorised buyer of a paid order. Buyers get a wallet, redemption instructions, expiry reminders, invalid-coupon reporting and sandbox refunds/disputes. Sellers see listings, orders, fee/payout records, reviews and reports. See `docs/COUPON_MARKETPLACE.md`.

## Tests

```bash
cd backend && ../.venv/bin/python -m pytest -q
cd frontend && npm test && npm run typecheck && npm run build
cd frontend && npm run test:e2e
cd frontend && npx playwright test e2e/extension.spec.ts
```

## Chrome extension

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the `extension/` folder. Reload Amazon.in/Flipkart tabs after installation. The extension never completes checkout or purchases.

## Integration boundaries

- Retailer prices, coupons, bank offers and community evidence are demo data unless marked verified.
- AI uses a deterministic fallback when no provider key is configured.
- Payments are a sandbox record; no real money moves and no live payout is claimed.
- Email is console mode; Telegram/WhatsApp are used only when credentials and consent exist.
- PWA offline mode serves the app shell only; it does not claim live prices offline.

Never commit real `.env` files, API keys, passwords, payment credentials or private coupon codes.
