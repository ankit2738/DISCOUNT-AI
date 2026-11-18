from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import BankOffer, Coupon, PriceHistory, Product, ProductListing, SaleCampaign
from app.services.pricing import effective_price
from app.services.serializers import bank_offer_payload, coupon_payload, money, product_payload

router = APIRouter(prefix="/api/sale-campaigns", tags=["Sale events"])


def _campaign_payload(campaign: SaleCampaign) -> dict:
    now = datetime.now(timezone.utc)
    starts = campaign.starts_at if campaign.starts_at.tzinfo else campaign.starts_at.replace(tzinfo=timezone.utc)
    ends = campaign.ends_at if campaign.ends_at.tzinfo else campaign.ends_at.replace(tzinfo=timezone.utc)
    state = "upcoming" if now < starts else "live" if now <= ends else "ended"
    return {
        "id": campaign.id,
        "slug": campaign.slug,
        "name": campaign.name,
        "description": campaign.description,
        "retailer_id": campaign.retailer_id,
        "starts_at": starts.isoformat(),
        "ends_at": ends.isoformat(),
        "state": state,
        "is_active": campaign.is_active,
        "is_verified": campaign.is_verified,
        "is_demo": campaign.is_demo,
        "authenticity_note": "Demo campaign dates. Verify official campaign dates with the retailer before relying on them.",
    }


@router.get("")
def list_campaigns(db: Session = Depends(get_db)):
    campaigns = db.scalars(select(SaleCampaign).order_by(SaleCampaign.starts_at.asc())).all()
    return {"items": [_campaign_payload(campaign) for campaign in campaigns], "total": len(campaigns)}


@router.get("/{slug}")
def campaign_detail(slug: str, db: Session = Depends(get_db)):
    campaign = db.scalar(select(SaleCampaign).where(SaleCampaign.slug == slug))
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    retailers = {listing.retailer_id for listing in db.scalars(select(ProductListing)).all()}
    if campaign.retailer_id is not None:
        listings = db.scalars(
            select(ProductListing).where(ProductListing.retailer_id == campaign.retailer_id)
        ).all()
    else:
        listings = db.scalars(select(ProductListing)).all()

    listings_by_product: dict[int, list[ProductListing]] = {}
    for listing in listings:
        listings_by_product.setdefault(listing.product_id, []).append(listing)

    trending = []
    for product_id, product_listings in listings_by_product.items():
        product = db.get(Product, product_id)
        if product is None:
            continue
        cheapest = min(product_listings, key=lambda item: item.price)
        history = db.scalars(
            select(PriceHistory).where(PriceHistory.listing_id == cheapest.id)
        ).all()
        average = sum((row.price for row in history), start=0) / len(history) if history else cheapest.price
        drop_from_average = float((average - cheapest.price) / average * 100) if average else 0
        trending.append(
            {
                "product": product_payload(product),
                "listing_id": cheapest.id,
                "price": money(cheapest.price),
                "effective_price": effective_price(db, cheapest)["effective_price"],
                "drop_from_average_pct": round(drop_from_average, 2),
                "is_demo": cheapest.is_demo,
            }
        )
    trending.sort(key=lambda item: (item["drop_from_average_pct"], -item["effective_price"]), reverse=True)

    retailer_id = campaign.retailer_id
    coupon_query = select(Coupon).where(Coupon.is_verified.is_(True))
    offer_query = select(BankOffer).where(BankOffer.is_active.is_(True))
    if retailer_id is not None:
        coupon_query = coupon_query.where(Coupon.retailer_id == retailer_id)
        offer_query = offer_query.where((BankOffer.retailer_id == retailer_id) | (BankOffer.retailer_id.is_(None)))
    coupons = db.scalars(coupon_query).all()
    offers = db.scalars(offer_query).all()

    return {
        "campaign": _campaign_payload(campaign),
        "trending_deals": trending[:12],
        "coupons": [coupon_payload(coupon) for coupon in coupons],
        "bank_offers": [bank_offer_payload(offer) for offer in offers],
        "authenticity_checks": [
            {"check": "campaign_dates_configurable", "passed": True},
            {"check": "official_dates_verified", "passed": campaign.is_verified},
            {"check": "demo_campaign", "passed": campaign.is_demo, "note": "Demo campaigns must be labelled in UI." if campaign.is_demo else ""},
            {"check": "price_history_available", "passed": any(item["drop_from_average_pct"] != 0 for item in trending)},
        ],
        "disclaimer": "Sale dates are configuration-driven. DISCOUNT AI does not guarantee that any product participates in a campaign.",
    }
