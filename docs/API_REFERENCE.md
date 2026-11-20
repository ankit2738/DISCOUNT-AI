# API Reference

Base URL: `http://127.0.0.1:8000` locally, or same-origin `/api/*` through the frontend proxy.

Interactive schema: `/docs` (Swagger UI) and `/openapi.json`.

Unless stated otherwise, authenticated routes expect:

```http
Authorization: Bearer <JWT>
```

Admin routes require role `admin`. Errors use FastAPI’s `{"detail": ...}` shape.

## Health and root

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/health` | — | Exact contract: `{"status":"ok","service":"discount-ai-backend"}`. |
| GET | `/api/health` | — | DB status, actual entity counts, demo mode and integration configuration status. |
| GET | `/` | — | Service name, tagline, docs/health links. |

## Authentication and account

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | — | Create shopper account. |
| POST | `/api/auth/login` | — | Returns JWT and user payload. |
| GET | `/api/auth/me` | User | Current user. |
| POST | `/api/auth/verify-email` | — | Consume verification token. |
| POST | `/api/auth/request-password-reset` | — | Generates reset response; no external email claim in console mode. |
| POST | `/api/auth/reset-password` | — | Reset with token. |
| POST | `/api/auth/change-password` | User | Change current password. |
| GET | `/api/auth/preferences` | User | Notification/personalisation preferences. |
| PUT | `/api/auth/preferences` | User | Update consent and preferences. |
| PUT | `/api/auth/profile` | User | Update profile fields. |
| DELETE | `/api/auth/account` | User | Soft-delete account and personal data. |
| POST | `/api/auth/logout` | User | Audit/logout acknowledgement. |

## Catalogue, variant comparison and intelligence

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/products` | — | Browse/filter catalogue. |
| GET | `/api/products/search` | Optional | Search with category/brand/price/retailer/rating/availability filters; records search event. |
| GET | `/api/products/categories` | — | Category counts. |
| GET | `/api/products/slug/{slug}` | Optional | Product detail by slug. |
| GET | `/api/products/{product_id}` | Optional | Product detail by ID, including specs, listings, coupons, offers, price range. |
| GET | `/api/products/{product_id}/alternatives` | — | Same-category alternatives. |
| GET | `/api/comparison` | Optional | `product_id` + optional `variant_id`; exact-variant listings sorted by effective price. Rejects wrong-product variants. |
| GET | `/api/deals` | — | Deal list ranked by drop from tracked average. |
| GET | `/api/price-history` or `/api/prices/history` | — | `listing_id`, `days` (30/90/365); labelled demo history. |
| GET | `/api/prices/current` | — | Current price snapshot for a listing. |
| GET | `/api/deal-score` | — | Score 0–100 with grade, confidence, factors/explanation. |
| GET | `/api/fake-discount` | — | Risk signals with evidence and “not an accusation” disclaimer. |
| GET | `/api/buy-or-wait` | — | `buy`, `wait` or `monitor` with reasons and limitations. |
| GET | `/api/warranty/compare` | — | Retailer warranty and return-policy comparison. |

## Coupons, bank offers and price calculation

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/coupons` | — | Verified/public coupons and filters. |
| GET | `/api/coupons/{coupon_id}` | — | Coupon detail. |
| POST | `/api/coupons/{coupon_id}/verify` | User | Submit verification evidence. |
| GET | `/api/bank-offers` | — | Bank/card offer list. |
| GET | `/api/offers` | — | Combined offers view. |
| POST | `/api/price-calculator` | — | Compute coupon/bank/delivery final price using decimal money. |
| GET | `/api/price-calculator` | — | Calculator metadata/help. |

## Cart and watchlist

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/cart` | User | Current cart with optimisation data. |
| POST | `/api/cart/items` | User | Add listing. |
| PATCH | `/api/cart/items/{item_id}` | User | Change quantity. |
| DELETE | `/api/cart/items/{item_id}` | User | Remove item. |
| DELETE | `/api/cart/clear` | User | Clear cart. |
| POST | `/api/cart/optimize` | User | Suggest cheaper exact-variant replacements. |
| GET | `/api/watchlist` | User | Saved/wishlist/watchlist items. |
| POST | `/api/watchlist` | User | Add item. |
| DELETE | `/api/watchlist/{item_id}` | User | Remove item. |

## Alerts, notifications and purchases

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/alerts` | User | Price alerts. |
| POST | `/api/alerts` | User | Create alert (`product_id`, optional `variant_id`, `target_price`, `channel`). |
| PATCH | `/api/alerts/{alert_id}` | User | Update target/status/channel. |
| DELETE | `/api/alerts/{alert_id}` | User | Delete alert. |
| POST | `/api/alerts/check` | User | Evaluate alerts immediately. |
| GET | `/api/notifications` | User | Notification history. |
| PATCH | `/api/notifications/{notification_id}/read` | User | Mark read. |
| POST | `/api/notifications/read-all` | User | Mark all read. |
| DELETE | `/api/notifications/{notification_id}` | User | Delete notification. |
| GET | `/api/notifications/providers` | User | Honest channel configuration status. |
| POST | `/api/notifications/test` | User | Create a test in-app notification. |
| GET | `/api/purchases` | User | Tracked purchases. |
| POST | `/api/purchases` | User | Track purchase. |
| GET | `/api/purchases/{purchase_id}/tracking` | User | Purchase/warranty tracking. |
| GET | `/api/recurring-purchases` | User | Recurring purchase reminders. |
| POST | `/api/recurring-purchases` | User | Create reminder. |
| DELETE | `/api/recurring-purchases/{record_id}` | User | Delete reminder. |
| GET | `/api/warranty` | User | Owner-only warranty records. |
| POST | `/api/warranty` | User | Add a warranty record owned by the current user. |
| GET | `/api/privacy/export` | User | User data export. |

## Shopping memory

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/memory` | User | List the current user's shopping-memory entries. |
| POST | `/api/memory` | User | Create/update a memory entry, including consent. |
| DELETE | `/api/memory/{memory_id}` | User | Delete an owned memory entry. |
| DELETE | `/api/memory?confirm=true` | User | Clear all owned memory; confirmation required. |
| GET | `/api/memory/context` | User | Consent-filtered context counts and Copilot context. |

## AI Copilot

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/ai/chat` | Optional | Cart/memory-aware shopping answer; external provider only when configured, otherwise deterministic fallback. Authenticated chats persist a conversation. |
| GET | `/api/ai/conversations` | User | Own persisted conversations. |
| GET | `/api/ai/conversations/{conversation_id}` | User | Own conversation with messages. |
| DELETE | `/api/ai/conversations/{conversation_id}` | User | Delete an owned conversation. |
| GET | `/api/ai/recommendations` | Optional | Evidence-backed recommendations. |
| GET | `/api/ai/providers` | — | Provider/fallback status. |

## Browser extension

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/extension/resolve` | — | Resolve a retailer page by title, retailer, external ID and variant hint; returns `matched=false` when no exact variant is justified. |
| GET | `/api/extension/intelligence` | — | Effective price, deal/fake-discount/buy-wait evidence, history, exact-variant comparison, coupons, alternatives and disclosures for a listing. |

## Community evidence

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/community/reports` | Optional | Approved/pending reports with filters. |
| POST | `/api/community/reports` | User | Submit price/coupon/bank/fake-discount/expired-offer report. |
| GET | `/api/community/reports/{report_id}` | Optional | Report detail. |
| POST | `/api/community/reports/{report_id}/vote` | User | Vote on report. |
| GET | `/api/community/leaderboard` | — | Contributor leaderboard. |
| POST | `/api/contact` | Optional | Store contact message; explicitly does not claim external email delivery. |

## Coupon intelligence additions

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/coupons/match` | Optional | Smart Coupon Matcher: expiry, minimum order, product eligibility, verified and marketplace listings, net-savings ranking. |
| GET | `/api/better-deal/{listing_id}` | Optional | Better Deal Alternative: direct purchase with eligible coupon/bank offer versus marketplace coupon options and lowest valid final payable. |
| GET | `/api/account/savings` | User | Savings dashboard with verified vs estimated savings, coupons purchased/redeemed, price drops, retailer and monthly history. |
| GET | `/api/retailers` | Optional | Retailer options for marketplace filters and listing forms. |

## Marketplace (sandbox)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/marketplace/listings` | Optional | Approved, transferable listings with search, retailer/brand/category filters, price/value filters and sort. |
| GET | `/api/marketplace/listings/{listing_id}` | Optional | Public listing detail; coupon code is masked only. |
| POST | `/api/marketplace/listings` | Seller/admin | Create listing; validates issuer transfer permission, expiry, duplicate code fingerprint, encrypts the code and hides it from public text. |
| PATCH | `/api/marketplace/listings/{listing_id}` | Seller | Edit own pending/rejected/approved listing; resets to pending for re-verification. |
| POST | `/api/marketplace/listings/{listing_id}/withdraw` | Seller | Withdraw own unsold listing. |
| POST | `/api/marketplace/seller/apply` | User | Apply as seller with optional verification evidence. |
| GET | `/api/marketplace/seller/me` | User | Seller workspace: listings, orders, sandbox fees/payout, reviews and reports. |
| PATCH | `/api/marketplace/seller/me` | Seller | Update seller profile. |
| GET | `/api/marketplace/sellers/{seller_id}` | Optional | Public seller reputation and verified-purchase reviews. |
| GET | `/api/marketplace/wallet` | User | Buyer coupon wallet with decrypted codes, redemption state and expiry reminders. |
| GET | `/api/marketplace/orders` | User | Buyer/seller sandbox orders. |
| POST | `/api/marketplace/orders` | User | Create sandbox order; copies the encrypted code to the buyer-only order record and rejects raw payment details. |
| GET | `/api/marketplace/orders/{order_id}/coupon` | Buyer | Authorised reveal; audits access and never exposes codes publicly. |
| POST | `/api/marketplace/orders/{order_id}/redeem` | Buyer | Mark purchased coupon redeemed for verified savings. |
| POST | `/api/marketplace/orders/{order_id}/refund-request` | Buyer | Request sandbox refund/dispute for an unredeemed order. |
| POST | `/api/marketplace/reviews` | Buyer | One verified-purchase review per order; updates seller rating and reputation. |
| POST | `/api/marketplace/reports` | User | Report invalid/already-used coupon with duplicate-open-report protection. |
| GET | `/api/marketplace/reports` | User | Own reports and resolution status. |
| POST | `/api/marketplace/reminders/expiry` | User | Create in-app expiry reminders for purchased coupons expiring within 7 days. |
| GET | `/api/marketplace/disputes` | User | Own disputes. |
| POST | `/api/marketplace/disputes` | User | Open dispute; duplicate open disputes are rejected. |

Orders are sandbox-only, split a 5% demo platform fee, and accept an optional `Idempotency-Key` header to return the existing order instead of duplicating it. `GET /api/marketplace/seller/me` returns the seller workspace with gross sales, demo fees, payout and refunded-order totals.

## Campaigns and analytics

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/sale-campaigns` | — | Active campaign list. |
| GET | `/api/sale-campaigns/{slug}` | — | Campaign detail. |
| POST | `/api/analytics/events` | Optional | Record client event. |
| GET | `/api/analytics/summary` | Optional | User/general summary. |
| GET | `/api/analytics/metrics` | Optional | Metrics snapshot. |
| GET | `/api/analytics/admin` | Admin | Admin metrics. |
| GET | `/api/affiliate/click/{listing_id}` | Optional | Records click, cheapest flag and source, then 307 redirects to retailer. |

## Admin

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/admin/overview` | Admin | Dashboard totals and primary metric. |
| GET | `/api/admin/health` | Admin | DB/adapters/environment. |
| GET | `/api/admin/users` | Admin | User list. |
| PATCH | `/api/admin/users/{user_id}/role` | Admin | Change role. |
| PATCH | `/api/admin/users/{user_id}/active` | Admin | Activate/deactivate. |
| GET/POST | `/api/admin/products` | Admin | List/create products. |
| PATCH/DELETE | `/api/admin/products/{product_id}` | Admin | Update/delete product. |
| POST | `/api/admin/products/{product_id}/variants` | Admin | Create exact variant. |
| GET/POST | `/api/admin/retailers` | Admin | List/create retailers. |
| PATCH | `/api/admin/retailers/{retailer_id}` | Admin | Update retailer/integration status. |
| GET/POST | `/api/admin/listings` | Admin | List/create listings. |
| PATCH | `/api/admin/listings/{listing_id}/price` | Admin | Update price/availability. |
| POST | `/api/admin/retailers/{slug}/refresh-demo` | Admin | Refresh labelled demo fixtures. |
| GET/POST | `/api/admin/coupons` | Admin | List/create coupons. |
| PATCH | `/api/admin/coupons/{coupon_id}/verify` | Admin | Set verification. |
| GET/POST | `/api/admin/bank-offers` | Admin | List/create bank offers. |
| PATCH | `/api/admin/bank-offers/{offer_id}/active` | Admin | Activate/deactivate. |
| GET | `/api/admin/community/reports` | Admin | Moderation queue. |
| POST | `/api/admin/community/reports/{report_id}/moderate` | Admin | Approve/reject/duplicate with note. |
| GET | `/api/admin/marketplace/listings` | Admin | Listing queue. |
| PATCH | `/api/admin/marketplace/listings/{listing_id}` | Admin | Moderate listing. |
| GET | `/api/admin/marketplace/sellers` | Admin | Seller queue. |
| PATCH | `/api/admin/marketplace/sellers/{seller_id}` | Admin | Moderate seller. |
| GET | `/api/admin/marketplace/disputes` | Admin | Dispute queue. |
| POST | `/api/admin/marketplace/disputes/{dispute_id}/resolve` | Admin | Resolve sandbox dispute. |
| GET | `/api/admin/marketplace/reports` | Admin | Invalid-coupon report queue. |
| POST | `/api/admin/marketplace/reports/{report_id}/resolve` | Admin | Resolve report; invalid reports can suspend the listing. |
| GET/POST | `/api/admin/campaigns` | Admin | List/create campaigns. |
| PATCH/DELETE | `/api/admin/campaigns/{campaign_id}` | Admin | Update/delete campaign. |
| GET | `/api/admin/affiliate` | Admin | Click attribution and cheaper-store CTR. |
| GET | `/api/admin/audit-logs` | Admin | Audit trail. |
| GET | `/api/admin/integrations` | Admin | Adapter/AI/notification/payment configuration status. |
| GET | `/api/integrations/status` | — | Public honest integration status. |

## Example requests

```bash
curl http://127.0.0.1:8000/health

TOKEN=$(curl -s -X POST http://127.0.0.1:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@discountai.in","password":"DemoPass123!"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')

curl "http://127.0.0.1:8000/api/comparison?product_id=1" \
  -H "Authorization: Bearer $TOKEN"

curl -I "http://127.0.0.1:8000/api/affiliate/click/1?source_page=comparison"
```
