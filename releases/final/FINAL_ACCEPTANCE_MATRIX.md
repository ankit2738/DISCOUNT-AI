# DISCOUNT AI — Final Acceptance Matrix

Verified: 2026-11-20 (Asia/Kolkata). Environment: local macOS/Apple silicon, Node 22, Python 3.14 test runner, Docker Compose with PostgreSQL 17 and Redis 7.

Grade definitions:

- **A** — Implemented, connected end to end and automatically tested.
- **B** — Functional with explicit demo, sandbox, console or manual-install boundary.
- **C** — Requires external credentials, authorization or provider onboarding.
- **D** — Incomplete.

## Authentication, account and privacy

| Requirement | Grade | Evidence / boundary |
| --- | --- | --- |
| Registration, login, JWT sessions and logout acknowledgement | A | Pytest auth coverage; Playwright shopper/admin/seller login |
| Password reset and change password | A | Pytest reset/change-password flows; console email mode does not claim external delivery |
| Email verification workflow | B | Tokens and APIs work; `EMAIL_PROVIDER=console` means no external email is sent |
| Role-based access for user, seller and admin | A | API guards, role-aware shells, admin E2E |
| Seller approval updates account role | A | Ownership/role Pytest coverage |
| Account deletion and privacy export | A | Soft-delete/de-identification; AI chats, memory, warranty and tracking records removed |
| Coupon wallet privacy | A | Browser localStorage only, cross-tab sync, no server persistence claim |

## Catalogue, variants and price intelligence

| Requirement | Grade | Evidence / boundary |
| --- | --- | --- |
| Product catalogue, search, filters and categories | A | Pytest and Playwright search flow |
| Exact product-variant matching | A | Variant-aware search/comparison tests; wrong variants rejected |
| Retailer price comparison sorted by effective price | A | Pytest and Playwright comparison flow |
| Historical prices | B | Working history APIs/charts; seeded history clearly labelled demo |
| Deal Score with evidence and confidence | A | Score, grade, factors, explanation and limitations tested |
| Fake-discount risk detection | A | Evidence-based risk signals; never presented as fraud accusation |
| Buy/wait/monitor recommendation | A | Valid recommendation plus reasons and limitations tested |
| Same-category alternatives | A | Pytest alternatives coverage |
| Warranty comparison and owner-scoped records | A | Public demo comparison plus private owner records tested |
| Decimal money handling | A | SQLAlchemy `Numeric` and `Decimal` calculations; no float money fields |

## Offers, cart and tracking

| Requirement | Grade | Evidence / boundary |
| --- | --- | --- |
| Coupons and copyable wallet metadata | A | Pytest pricing/wallet coverage |
| Bank/card offers and eligibility guidance | A | Eligibility, caps and cashback separation tested |
| Price calculator with coupons, delivery and bank offer | A | Decimal total and expiry/min-order tests |
| Smart cart add/update/delete/clear | A | Pytest cart workflow |
| Cart optimizer and exact-variant replacement | A | Pytest optimization and delivery/pre-offer invariants |
| Coupon non-duplication and bank-offer sequencing | A | Targeted regression tests |
| Watchlist/saved products | A | Pytest and dashboard UI |
| Purchase tracking and recurring reminders | A | Pytest purchases/recurring coverage |
| Price alerts and in-app notifications | A | Pytest creation, ownership and notification records |
| External email/Telegram/WhatsApp delivery | C | Interfaces/status exist; credentials and delivery are not configured or claimed |

## AI Copilot and shopping memory

| Requirement | Grade | Evidence / boundary |
| --- | --- | --- |
| Grounded deterministic Copilot fallback | A | Pytest grounded/no-invention coverage; Docker smoke AI response |
| External AI provider | C | Optional OpenAI-compatible interface; no key configured or live claim |
| Persistent authenticated conversations | A | Create/list/detail/delete, privacy and account-deletion tests |
| Personal shopping memory | A | Consent, upsert, delete, clear confirmation and context tests |
| Consent-filtered personal context | A | Only consented, unexpired memory is passed to Copilot |
| Opt-out and data deletion | A | Individual delete, clear-all and account deletion |

## Community and marketplace

| Requirement | Grade | Evidence / boundary |
| --- | --- | --- |
| Community reports, duplicate detection and votes | A | Pytest report/vote flow |
| Owner privacy for pending reports | A | Pending reports restricted; owner/non-approved vote rules tested |
| Admin community moderation | A | Approve/reject/duplicate with audit note |
| Contributor leaderboard | A | Pytest leaderboard |
| Seller application, evidence and admin approval | A | Seller lifecycle Pytest coverage and admin verification UI |
| Marketplace listing fields, filters and sorting | A | Retailer, brand, category, value/price filters, expiry/discount/price sorts verified against PostgreSQL |
| Coupon code encryption, masking and buyer-only reveal | A | Fernet encryption, public masking, buyer-only reveal audit, wallet tests |
| Duplicate coupon detection | A | Fingerprint-based duplicate rejection tested |
| Non-transferable coupon prevention | A | Creation and admin approval reject non-transferable listings; purchase re-checks |
| Listing edit and withdrawal | A | Seller-owned edit resets to pending; unsold withdrawal tested |
| Seller reputation and verified-purchase reviews | A | One review per order; rating shown as unrated until verified reviews exist |
| Invalid-coupon reports and listing suspension | A | Report creation, duplicate protection and admin suspension tested |
| Sandbox order purchase, wallet and idempotency | B | Sandbox records only; fee/idempotency/wallet tests |
| Redemption tracking and verified savings | A | Buyer redemption updates listing/order and the savings dashboard |
| 5% demo fee and seller payout reporting | B | Decimal fee split tested; no real settlement |
| Disputes, duplicate prevention and sandbox refund | B | Pytest dispute/refund flow; admin resolution |
| Expired listing rejection | A | Expiry validation tested |
| Raw card/CVV/UPI rejection | A | API validation plus marketplace UI disclosure |
| Coupon expiry reminders | A | Purchased-coupon reminders are idempotent; saved local coupons show a 3-day warning |
| Smart Coupon Matcher and Better Deal Alternative | A | Eligibility/net-saving ranking and lowest valid payable APIs plus UI |
| Savings dashboard | A | Verified vs estimated savings, retailer and monthly history tested |

## Admin, analytics and attribution

| Requirement | Grade | Evidence / boundary |
| --- | --- | --- |
| Admin overview and operational metrics | A | API smoke and Pytest |
| Product/variant/retailer/listing management | A | Admin lifecycle Pytest |
| Coupon, bank-offer and campaign management | A | CRUD and moderation Pytest |
| Community/marketplace moderation | A | Queue and resolution tests |
| Affiliate click recording and redirect | A | Attribution/redirect tests; no affiliate postback configured |
| Cheaper-store click-through metric | A | Operator metric exposed; commission cannot affect ranking |
| Analytics consent and event capture | A | Consent and summary tests |
| Audit log | A | Admin audit APIs and dedicated page |
| Dedicated admin pages | A | `/admin/products`, `/retailers`, `/prices`, `/analytics`, `/integrations`, `/audit`; Playwright route checks |

## Chrome extension

| Requirement | Grade | Evidence / boundary |
| --- | --- | --- |
| Chrome Manifest V3 package | B | Valid manifest and icons; manual unpacked installation, not store-published |
| Amazon and Flipkart parsers | A | Fixture-based Playwright parser tests |
| Generic page fallback | B | Conservative parser path; retailer DOM changes may require updates |
| External-ID and variant resolution | A | Exact-match and unrelated-page rejection tests |
| Extension intelligence payload | A | Price, deal, fake-discount, buy/wait, history, comparison and disclosures |
| Popup and side panel | B | Functional client UI; no Chrome Web Store review |
| Affiliate handoff and alert creation | B | Uses authenticated APIs; live affiliate network not configured |

## PWA and frontend

| Requirement | Grade | Evidence / boundary |
| --- | --- | --- |
| Public, dashboard and admin routes | A | 45-route production build including `/dashboard/savings` |
| Mobile search and responsive shells | A | Header/search implementation and Playwright viewport smoke |
| Functional compare, cart, offers, memory, AI and marketplace actions | A | Playwright and API smoke |
| PWA manifest and PNG icons | B | Installable assets present; no browser install prompt automation |
| Service worker and offline page | B | App-shell/static caching; `/api` and private routes bypassed; live data unavailable offline |

## Infrastructure, testing and delivery

| Requirement | Grade | Evidence / boundary |
| --- | --- | --- |
| PostgreSQL schema and Alembic migration | A | Docker DB at head `9b7d1a2c4e5f` |
| SQLite local/test mode | A | Backend suite uses isolated SQLite |
| Redis/Celery worker and beat | B | Containers healthy; schedules locally exercised, no production observability |
| Docker Compose stack | A | DB/Redis/backend healthy; frontend/worker/beat up |
| `/health` contract and `/api/health` | A | Exact contract and PostgreSQL connectivity verified |
| Backend tests | A | 85 passed |
| Frontend unit tests | A | 16 passed in 4 files |
| Playwright | A | 12 passed Chromium tests |
| Extension-focused Playwright | A | 3 passed parser/resolve tests |
| TypeScript and production build | A | Typecheck passed; 45 routes built |
| Permissions and persistence | A | 11 checks passed, including PostgreSQL memory persistence across backend restart |
| Retailer/affiliate live integrations | C | Authorized feeds/agreements/credentials required |
| Live payment and external notification providers | C | Sandbox/console/fallback only; no real delivery or money movement claimed |
| Documentation and final packages | A | API/schema/architecture/status/test/integration docs plus coupon marketplace guide, verified source/extension/documentation ZIPs and final PDF |

## Remaining limitations

- Amazon, Flipkart, Meesho, Myntra, Croma and Reliance Digital remain demo adapters until authorized credentials/feeds are supplied.
- Affiliate postbacks, live AI, SMTP/email delivery, Telegram/WhatsApp delivery and real payment settlement require external onboarding.
- The Chrome extension is delivered as an unpacked MV3 package, not a Chrome Web Store release.
- The PWA provides an offline shell only; prices and offers always require connectivity.
- No load/performance, penetration, formal accessibility or production observability audit was performed.
