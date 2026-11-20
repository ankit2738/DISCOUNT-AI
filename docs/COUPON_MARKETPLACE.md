# Coupon Marketplace

## Buyer flow

1. Browse `/dashboard/marketplace` or `GET /api/marketplace/listings` with retailer, brand, category, coupon-value and selling-price filters.
2. Compare coupon value, estimated saving, minimum order, expiry, restrictions and seller reputation.
3. Purchase through the sandbox provider. No card/CVV/UPI credentials are accepted.
4. Open `/dashboard/marketplace` → **My coupon wallet** or `GET /api/marketplace/wallet` to view the decrypted code, instructions and expiry.
5. Mark the coupon redeemed to count verified savings, leave one verified-purchase review, report an invalid coupon, or request a sandbox refund before redemption.
6. View aggregate verified vs estimated savings at `/dashboard/savings`.

## Seller flow

1. Apply at `POST /api/marketplace/seller/apply`; an admin must approve the seller.
2. Create a listing with retailer, brand, coupon value, selling price, minimum order, applicable products, restrictions, redemption instructions, evidence URL, expiry and issuer transfer terms.
3. The API rejects listings whose issuer terms do not permit transfer, expired listings, duplicate coupon codes and codes embedded in public listing text.
4. Pending listings are admin-moderated. Sellers can edit (which resets to pending) or withdraw unsold listings.
5. `GET /api/marketplace/seller/me` returns listings, sandbox sales, platform fees, payout, reviews and reports.

## Security and fraud controls

- Coupon codes are encrypted with Fernet using a key derived from `SECRET_KEY`; codes are never included in public payloads, logs or unauthorised order responses.
- A deterministic fingerprint detects duplicate listings without exposing the raw code.
- Buyer-only reveal is audited; the code is copied to the order at purchase time.
- Admins must verify transfer permission before approval; non-transferable listings cannot be approved.
- Invalid-coupon reports can suspend a listing. Disputes and refunds are sandbox records with audit entries.
- Seller ratings come only from verified-purchase reviews. A seller with no reviews is shown as unrated, not with a fabricated score.

## Sandbox payment boundary

The marketplace records `paid_sandbox` transactions and a 5% demo platform fee. It does not process live payments, settle real money, or claim seller payouts. Live operation requires an authorised payment provider, KYC/merchant onboarding, webhook verification and reconciliation.
