# Database Schema

Current Alembic revision: `2f6a9c31b7d4` (`backend/alembic/versions/2f6a9c31b7d4_memory_warranty_marketplace.py`), building on initial revision `8d4ca53678ff`.

PostgreSQL is used in Docker/production; SQLite is supported for local tests. All monetary columns use SQLAlchemy `Numeric`/`Decimal` handling. Seeded rows carry `is_demo=true` where the table supports it.

## Identity and access

| Table | Key fields | Relationships / notes |
| --- | --- | --- |
| `users` | `id`, `email` unique, `password_hash`, `full_name`, `phone`, `role`, `is_active`, `is_verified`, `verification_token`, `reset_token`, `reset_expires_at`, `last_login_at`, `deleted_at` | Roles: `user`, `seller`, `admin`. scrypt hashes. |
| `user_profiles` | `id`, `user_id`, `city`, `state`, `pincode`, `avatar_url`, `date_of_birth`, `shopping_persona` | One profile per user. |
| `preferences` | `id`, `user_id`, `preferred_brands/categories/retailers`, budgets, notification and consent flags, Telegram/WhatsApp IDs | Personalisation and consent. |
| `admin_users` | `id`, `user_id`, `permissions`, `is_superadmin` | Optional granular admin metadata. |
| `audit_logs` | `id`, `actor_id`, `action`, `entity_type`, `entity_id`, `before_data`, `after_data`, `ip_address` | Admin/security audit trail. |

## Catalogue and retailer data

| Table | Key fields | Relationships / notes |
| --- | --- | --- |
| `products` | `id`, `slug` unique, `name`, `brand`, `model`, `category`, `description`, `specs` JSON, `image_url`, `is_demo` | Parent product. |
| `product_variants` | `id`, `product_id`, `sku` unique, `variant_name`, `attributes` JSON, `is_demo` | Exact variant (storage/size/colour). |
| `retailers` | `id`, `slug` unique, `name`, `website`, `adapter_key`, `integration_status`, `is_active`, `is_demo`, `terms_note`, `affiliate_disclosure` | `integration_status` currently `demo` for all seeded retailers. |
| `product_listings` | `id`, `product_id`, `variant_id`, `retailer_id`, `external_id`, `title`, `url`, `price`, `mrp`, `delivery_charge`, `availability`, `rating`, `seller_name`, `is_demo`, `source`, `verified_at`, `last_checked_at` | Exact-variant store offer. |
| `price_history` | `id`, `listing_id`, `price`, `mrp`, `recorded_at`, `is_demo`, `source` | Daily/period snapshots. |
| `price_sources` | `id`, `listing_id`, `source_type`, `source_url`, `observed_at`, `is_demo`, `notes` | Provenance for price observations. |
| `product_specifications` | `id`, `product_id`, `variant_id`, `spec_group`, `name`, `value`, `source`, `verified_at`, `is_demo` | Structured specs. |
| `warranty_records` | `id`, `user_id`, `purchase_id`, `product_id`, `variant_id`, `retailer_id`, `warranty_months`, `provider`, `coverage`, `source_url`, `verified_at`, `is_demo` | Warranty evidence. Owner-scoped; `user_id IS NULL` records are the public demo comparison set. |
| `return_policies` | `id`, `retailer_id`, `category`, `return_days`, `replacement_allowed`, `refund_policy`, `conditions`, `source_url`, `verified_at`, `is_demo` | Retailer/category policies. |

## Offers and intelligence

| Table | Key fields | Relationships / notes |
| --- | --- | --- |
| `coupons` | `id`, `code`, `title`, `description`, `retailer_id`, `product_id`, `discount_type`, `discount_value`, `max_discount`, `min_order`, `expires_at`, `is_verified`, `verification_source`, `is_demo`, `is_stackable`, `terms` | Coupon eligibility uses decimal amounts. |
| `coupon_verifications` | `id`, `coupon_id`, `user_id`, `status`, `evidence_url`, `verified_at`, `notes` | Community/admin verification evidence. |
| `bank_offers` | `id`, `bank_name`, `card_type`, `title`, `discount_type`, `discount_value`, `max_discount`, `min_transaction`, `is_cashback`, `emi_only`, `no_cost_emi`, `min_tenure_months`, `retailer_id`, dates, `is_active`, `is_demo`, `terms`, `source` | Card-specific benefits; cashback/EMI flags. |
| `offer_eligibility` | `id`, `bank_offer_id`, `user_id`, `listing_id`, `eligible`, `reason`, `evaluated_at` | Eligibility audit. |
| `deal_scores` | `id`, `listing_id`, `score`, `grade`, `confidence`, `factors` JSON, `explanation` JSON, `computed_at`, `is_demo` | Evidence-backed score. |
| `deal_evidence` | `id`, `deal_score_id`, `evidence_type`, `description`, `value`, `weight` | Individual score factors. |

## Shopping and tracking

| Table | Key fields | Relationships / notes |
| --- | --- | --- |
| `shopping_carts` | `id`, `user_id`, `name`, timestamps | One or more carts per user. |
| `cart_items` | `id`, `cart_id`, `listing_id`, `quantity`, `added_at` | Unique cart/listing combination enforced in service. |
| `watchlists` | `id`, `user_id`, `product_id`, `list_type`, `notes`, timestamps | `saved`, `wishlist`, `watchlist`. |
| `price_alerts` | `id`, `user_id`, `product_id`, `variant_id`, `target_price`, `status`, `channel`, `last_checked_at`, `triggered_at` | Channels: in-app/email/push/Telegram/WhatsApp. |
| `notifications` | `id`, `user_id`, `type`, `title`, `body`, `channel`, `status`, `provider_message_id`, `error`, `read_at` | Provider status is not claimed as delivery. |
| `purchases` | `id`, `user_id`, `listing_id`, `product_id`, `retailer_id`, `price`, `quantity`, `purchased_at` | Price tracking/optimisation input. |
| `recurring_purchases` | `id`, `user_id`, `product_id`, `label`, `interval_days`, `last_purchased_at`, `last_price`, `next_reminder_at`, `active` | Reminder metadata. |

## Shopping memory and AI persistence

| Table | Key fields | Relationships / notes |
| --- | --- | --- |
| `shopping_memory` | `id`, `user_id`, `memory_type`, `memory_key`, `memory_value`, `context` JSON, `source`, `consent`, `expires_at`, timestamps | One row per user/type/key. Only `consent=true` rows feed Copilot context. |
| `ai_conversations` | `id`, `user_id`, `session_id` unique, `title`, `context` JSON, timestamps | Authenticated Copilot conversation. |
| `ai_messages` | `id`, `conversation_id`, `role`, `content`, `meta` JSON, `created_at` | Ordered user/assistant messages; no provider secrets stored. |

## Community

| Table | Key fields | Relationships / notes |
| --- | --- | --- |
| `community_reports` | `id`, `user_id`, `report_type`, `product_id`, `listing_id`, `retailer_id`, `coupon_id`, `claimed_value`, `evidence_url`, `description`, `status`, `duplicate_of_id`, `moderated_by`, `moderation_note` | Types: price, coupon, bank offer, fake discount, expired offer. |
| `community_votes` | `id`, `report_id`, `user_id`, `vote` | One vote per user/report. |

## Sandbox marketplace

| Table | Key fields | Relationships / notes |
| --- | --- | --- |
| `marketplace_sellers` | `id`, `user_id`, `display_name`, `bio`, `status`, `rating`, `total_sales` | Seller application/moderation. |
| `marketplace_listings` | `id`, `seller_id`, `title`, `description`, `category`, `price`, `proof_url`, `expires_at`, `status`, `is_transfer_allowed` | Coupons/vouchers only; moderated. |
| `marketplace_orders` | `id`, `listing_id`, `buyer_id`, `seller_id`, `amount`, `platform_fee`, `seller_payout`, `idempotency_key` unique, `status`, `payment_provider`, `delivery_details` JSON, `refunded_at`, timestamps | Sandbox payment records only; 5% demo fee split and optional idempotent creation. |
| `transactions` | `id`, `order_id`, `provider`, `provider_reference`, `amount`, `currency`, `status`, `type`, `meta` | Provider `sandbox`; no card data. |
| `disputes` | `id`, `order_id`, `opened_by`, `reason`, `evidence_url`, `status`, `resolution`, `resolved_at` | Admin resolution. |

## Campaigns, analytics and attribution

| Table | Key fields | Relationships / notes |
| --- | --- | --- |
| `sale_campaigns` | `id`, `slug` unique, `retailer_id`, `name`, `description`, dates, `is_active`, `is_verified`, `banner_url`, `is_demo` | Config-driven sale windows. |
| `analytics_events` | `id`, `user_id`, `session_id`, `event_type`, `product_id`, `listing_id`, `meta` JSON | Searches, comparisons, contact messages, clicks. |
| `affiliate_clicks` | `id`, `listing_id`, `product_id`, `user_id`, `session_id`, `effective_price`, `comparison_cheapest`, `source_page` | Primary cheaper-store CTR source. |

## Invariants

- A comparison uses one product + one variant; listings from other products/variants are rejected.
- Money is never stored or calculated as float.
- Affiliate commission has no schema field used in ranking.
- `is_demo` is surfaced in API payloads and UI badges wherever seeded data is displayed.
- Payment tables contain provider references only; no PAN/CVV/UPI secrets.
- Account deletion is soft deletion plus scrubbed personal fields per service logic; audit records may retain minimal operational metadata.
