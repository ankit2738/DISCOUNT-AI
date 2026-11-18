from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    BankOffer,
    Coupon,
    PriceHistory,
    Product,
    ProductListing,
    ProductVariant,
    Retailer,
)


def money(value: Decimal | float | int | None) -> float | None:
    if value is None:
        return None
    return float(Decimal(value).quantize(Decimal("0.01")))


def iso(value) -> str | None:
    return value.isoformat() if value is not None else None


def retailer_payload(retailer: Retailer) -> dict[str, Any]:
    return {
        "id": retailer.id,
        "slug": retailer.slug,
        "name": retailer.name,
        "website": retailer.website,
        "integration_status": retailer.integration_status,
        "is_demo": retailer.is_demo,
        "affiliate_disclosure": retailer.affiliate_disclosure,
        "terms_note": retailer.terms_note,
    }


def variant_payload(variant: ProductVariant) -> dict[str, Any]:
    return {
        "id": variant.id,
        "sku": variant.sku,
        "name": variant.variant_name,
        "attributes": variant.attributes,
        "is_demo": variant.is_demo,
    }


def coupon_payload(coupon: Coupon) -> dict[str, Any]:
    return {
        "id": coupon.id,
        "code": coupon.code,
        "title": coupon.title,
        "description": coupon.description,
        "retailer_id": coupon.retailer_id,
        "product_id": coupon.product_id,
        "discount_type": coupon.discount_type,
        "discount_value": money(coupon.discount_value),
        "max_discount": money(coupon.max_discount),
        "min_order": money(coupon.min_order),
        "expires_at": iso(coupon.expires_at),
        "is_verified": coupon.is_verified,
        "verification_source": coupon.verification_source,
        "is_demo": coupon.is_demo,
        "is_stackable": coupon.is_stackable,
        "terms": coupon.terms,
    }


def bank_offer_payload(offer: BankOffer) -> dict[str, Any]:
    return {
        "id": offer.id,
        "bank_name": offer.bank_name,
        "card_type": offer.card_type,
        "title": offer.title,
        "discount_type": offer.discount_type,
        "discount_value": money(offer.discount_value),
        "max_discount": money(offer.max_discount),
        "min_transaction": money(offer.min_transaction),
        "is_cashback": offer.is_cashback,
        "emi_only": offer.emi_only,
        "no_cost_emi": offer.no_cost_emi,
        "min_tenure_months": offer.min_tenure_months,
        "retailer_id": offer.retailer_id,
        "starts_at": iso(offer.starts_at),
        "expires_at": iso(offer.expires_at),
        "is_active": offer.is_active,
        "is_demo": offer.is_demo,
        "terms": offer.terms,
        "source": offer.source,
    }


def history_stats(listing_id: int, db: Session, days: int = 365) -> dict[str, Any]:
    rows = db.scalars(
        select(PriceHistory)
        .where(PriceHistory.listing_id == listing_id)
        .order_by(PriceHistory.recorded_at.asc())
    ).all()
    if not rows:
        return {
            "points": [],
            "count": 0,
            "min": None,
            "max": None,
            "average": None,
            "latest": None,
            "first": None,
            "days_covered": 0,
            "is_demo": True,
            "completeness": 0.0,
        }
    chronological = rows
    values = [row.price for row in rows]
    return {
        "points": [
            {
                "date": row.recorded_at.date().isoformat(),
                "price": money(row.price),
                "mrp": money(row.mrp),
                "is_demo": row.is_demo,
            }
            for row in chronological
        ],
        "count": len(rows),
        "min": money(min(values)),
        "max": money(max(values)),
        "average": money(sum(values) / len(values)),
        "latest": money(rows[-1].price),
        "first": money(rows[0].price),
        "days_covered": (rows[-1].recorded_at - rows[0].recorded_at).days,
        "is_demo": all(row.is_demo for row in rows),
        "completeness": round(min(1.0, len(rows) / max(days, 1)), 3),
    }


def product_payload(product: Product, include_listings: bool = False, db: Session | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": product.id,
        "slug": product.slug,
        "name": product.name,
        "brand": product.brand,
        "model": product.model,
        "category": product.category,
        "description": product.description,
        "specs": product.specs,
        "image_url": product.image_url,
        "is_demo": product.is_demo,
        "variants": [variant_payload(v) for v in product.variants],
    }
    if include_listings and db is not None:
        listings = db.scalars(
            select(ProductListing)
            .where(ProductListing.product_id == product.id)
            .order_by(ProductListing.price.asc())
        ).all()
        payload["listings"] = [basic_listing_payload(listing, db) for listing in listings]
        payload["lowest_price"] = min((money(l.price) for l in listings), default=None)
    return payload


def basic_listing_payload(listing: ProductListing, db: Session) -> dict[str, Any]:
    retailer = db.get(Retailer, listing.retailer_id)
    variant = db.get(ProductVariant, listing.variant_id)
    return {
        "id": listing.id,
        "product_id": listing.product_id,
        "variant_id": listing.variant_id,
        "variant": variant_payload(variant) if variant else None,
        "retailer": retailer_payload(retailer) if retailer else None,
        "title": listing.title,
        "url": listing.url,
        "price": money(listing.price),
        "mrp": money(listing.mrp),
        "delivery_charge": money(listing.delivery_charge),
        "availability": listing.availability,
        "rating": money(listing.rating),
        "seller_name": listing.seller_name,
        "source": listing.source,
        "is_demo": listing.is_demo,
        "verified_at": iso(listing.verified_at),
        "last_checked_at": iso(listing.last_checked_at),
    }
