from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import PriceHistory, ProductListing, Retailer


class IntegrationNotConfigured(RuntimeError):
    pass


class RetailerAdapter:
    slug = "base"
    name = "Base"
    requires_credentials: list[str] = []
    live_ready = False

    def __init__(self, db: Session) -> None:
        self.db = db

    def retailer(self) -> Retailer | None:
        return self.db.scalar(select(Retailer).where(Retailer.slug == self.slug))

    def status(self) -> dict:
        retailer = self.retailer()
        return {
            "slug": self.slug,
            "name": self.name,
            "retailer_id": retailer.id if retailer else None,
            "integration_status": "demo",
            "live_ready": self.live_ready,
            "requires_credentials": self.requires_credentials,
            "demo_data": True,
            "note": (
                "This adapter serves labelled demo fixtures. Live activation requires an authorized "
                "API/feed agreement and the listed credentials."
            ),
        }

    def listings(self) -> list[ProductListing]:
        retailer = self.retailer()
        if retailer is None:
            return []
        return list(
            self.db.scalars(
                select(ProductListing).where(ProductListing.retailer_id == retailer.id)
            ).all()
        )

    def refresh_demo_prices(self, seed: int) -> int:
        listings = self.listings()
        now = datetime.now(timezone.utc)
        for listing in listings:
            delta = Decimal(((seed + listing.id) % 7 - 3) * 25)
            new_price = max(Decimal("99"), listing.price + delta)
            historical_mrp = self.db.scalar(
                select(func.max(PriceHistory.mrp)).where(PriceHistory.listing_id == listing.id)
            )
            record_mrp = min(listing.mrp, historical_mrp) if historical_mrp is not None else listing.mrp
            listing.price = new_price
            listing.last_checked_at = now
            listing.verified_at = now
            self.db.add(
                PriceHistory(
                    listing_id=listing.id,
                    price=new_price,
                    mrp=record_mrp,
                    recorded_at=now,
                    is_demo=True,
                    source="demo_adapter_refresh",
                )
            )
        self.db.commit()
        return len(listings)


class AmazonAdapter(RetailerAdapter):
    slug = "amazon"
    name = "Amazon India"
    requires_credentials = ["AMAZON_PAAPI_ACCESS_KEY", "AMAZON_PAAPI_SECRET_KEY", "AMAZON_PARTNER_TAG"]


class FlipkartAdapter(RetailerAdapter):
    slug = "flipkart"
    name = "Flipkart"
    requires_credentials = ["FLIPKART_AFFILIATE_ID", "FLIPKART_AFFILIATE_TOKEN"]


class MeeshoAdapter(RetailerAdapter):
    slug = "meesho"
    name = "Meesho"
    requires_credentials = ["MEESHO_PARTNER_CREDENTIALS"]


class MyntraAdapter(RetailerAdapter):
    slug = "myntra"
    name = "Myntra"
    requires_credentials = ["MYNTRA_PARTNER_CREDENTIALS"]


class CromaAdapter(RetailerAdapter):
    slug = "croma"
    name = "Croma"
    requires_credentials = ["CROMA_FEED_CREDENTIALS"]


class RelianceAdapter(RetailerAdapter):
    slug = "reliance"
    name = "Reliance Digital"
    requires_credentials = ["RELIANCE_FEED_CREDENTIALS"]
