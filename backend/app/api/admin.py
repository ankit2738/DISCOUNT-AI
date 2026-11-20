from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.adapters.registry import all_adapter_statuses, get_adapter
from app.core.config import settings
from app.db import get_db
from app.deps import require_admin
from app.models import (
    MarketplaceCouponReport,
    AffiliateClick,
    AuditLog,
    BankOffer,
    CommunityReport,
    Coupon,
    Dispute,
    MarketplaceListing,
    MarketplaceSeller,
    PriceHistory,
    Product,
    ProductListing,
    ProductVariant,
    Retailer,
    SaleCampaign,
    User,
    Watchlist,
)
from app.schemas import (
    BankOfferCreate,
    CampaignCreate,
    CouponCreate,
    CouponReportResolve,
    ListingCreate,
    ListingPriceUpdate,
    ModerationRequest,
    ProductCreate,
    ProductUpdate,
    RetailerCreate,
    RetailerUpdate,
    UserRoleUpdate,
    VariantCreate,
)
from app.api.marketplace import resolve_dispute_admin
from app.schemas import DisputeResolution
from app.services.audit import record_audit
from app.services.serializers import (
    bank_offer_payload,
    basic_listing_payload,
    coupon_payload,
    money,
    product_payload,
    retailer_payload,
)
from app.api.analytics import compute_metrics

router = APIRouter(prefix="/api/admin", tags=["Admin"])


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


@router.get("/overview")
def overview(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    def count(model) -> int:
        return int(db.scalar(select(func.count()).select_from(model)) or 0)

    return {
        "counts": {
            "users": count(User),
            "products": count(Product),
            "retailers": count(Retailer),
            "listings": count(ProductListing),
            "coupons": count(Coupon),
            "bank_offers": count(BankOffer),
            "pending_community_reports": int(
                db.scalar(
                    select(func.count()).select_from(CommunityReport).where(CommunityReport.status == "pending")
                )
                or 0
            ),
            "pending_marketplace_listings": int(
                db.scalar(
                    select(func.count()).select_from(MarketplaceListing).where(MarketplaceListing.status == "pending")
                )
                or 0
            ),
            "open_disputes": int(
                db.scalar(select(func.count()).select_from(Dispute).where(Dispute.status == "open")) or 0
            ),
            "active_campaigns": int(
                db.scalar(select(func.count()).select_from(SaleCampaign).where(SaleCampaign.is_active.is_(True))) or 0
            ),
        },
        "metrics": compute_metrics(db),
        "demo_mode": settings.demo_mode,
    }


@router.get("/health")
def admin_health(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    try:
        db.execute(select(1))
        db_status = "connected"
    except Exception as exc:  # noqa: BLE001
        db_status = f"error: {type(exc).__name__}"
    return {
        "status": "ok" if db_status == "connected" else "degraded",
        "database": {"status": db_status, "scheme": settings.database_url.split(":", 1)[0]},
        "adapters": all_adapter_statuses(db),
        "environment": settings.environment,
        "demo_mode": settings.demo_mode,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/users")
def list_users(
    q: str = "",
    limit: int = Query(default=50, ge=1, le=200),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = select(User)
    if q:
        query = query.where(User.email.ilike(f"%{q}%") | User.full_name.ilike(f"%{q}%"))
    users = db.scalars(query.order_by(User.id.asc()).limit(limit)).all()
    return {
        "items": [
            {
                "id": user.id,
                "email": user.email,
                "full_name": user.full_name,
                "role": user.role,
                "is_active": user.is_active,
                "is_verified": user.is_verified,
                "created_at": user.created_at.isoformat(),
                "deleted": user.deleted_at is not None,
            }
            for user in users
        ],
        "total": len(users),
    }


@router.patch("/users/{user_id}/role")
def update_role(
    user_id: int,
    payload: UserRoleUpdate,
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    before = {"role": user.role}
    user.role = payload.role
    record_audit(db, admin.id, "admin.user_role", "user", user.id, before, {"role": payload.role}, request.client.host if request.client else None)
    db.commit()
    return {"id": user.id, "role": user.role}


@router.patch("/users/{user_id}/active")
def toggle_user(user_id: int, active: bool, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = active
    db.commit()
    return {"id": user.id, "is_active": user.is_active}


@router.get("/products")
def admin_products(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    products = db.scalars(select(Product).order_by(Product.id.asc())).all()
    return {"items": [product_payload(product, include_listings=True, db=db) for product in products]}


@router.post("/products", status_code=201)
def create_product(
    payload: ProductCreate,
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    slug = _slugify(payload.name)
    base_slug = slug
    counter = 1
    while db.scalar(select(Product).where(Product.slug == slug)):
        counter += 1
        slug = f"{base_slug}-{counter}"
    product = Product(**payload.model_dump(), slug=slug, is_demo=False)
    db.add(product)
    record_audit(db, admin.id, "admin.product_create", "product", None, after=payload.model_dump(), ip_address=request.client.host if request.client else None)
    db.commit()
    db.refresh(product)
    return product_payload(product)


@router.patch("/products/{product_id}")
def update_product(
    product_id: int,
    payload: ProductUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    before = {key: getattr(product, key) for key in payload.model_dump(exclude_unset=True)}
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(product, key, value)
    record_audit(db, admin.id, "admin.product_update", "product", product.id, before, payload.model_dump(exclude_unset=True))
    db.commit()
    return product_payload(product)


@router.delete("/products/{product_id}")
def delete_product(product_id: int, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    record_audit(db, admin.id, "admin.product_delete", "product", product.id, before={"name": product.name}, ip_address=request.client.host if request.client else None)
    db.delete(product)
    db.commit()
    return {"status": "deleted", "id": product_id}


@router.post("/products/{product_id}/variants", status_code=201)
def create_variant(
    product_id: int,
    payload: VariantCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if db.get(Product, product_id) is None:
        raise HTTPException(status_code=404, detail="Product not found")
    if db.scalar(select(ProductVariant).where(ProductVariant.sku == payload.sku)):
        raise HTTPException(status_code=409, detail="SKU already exists")
    variant = ProductVariant(product_id=product_id, sku=payload.sku, variant_name=payload.variant_name, attributes=payload.attributes, is_demo=False)
    db.add(variant)
    db.commit()
    db.refresh(variant)
    return {"id": variant.id, "sku": variant.sku, "variant_name": variant.variant_name, "attributes": variant.attributes}


@router.get("/retailers")
def admin_retailers(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    retailers = db.scalars(select(Retailer).order_by(Retailer.id.asc())).all()
    return {"items": [retailer_payload(retailer) for retailer in retailers], "adapters": all_adapter_statuses(db)}


@router.post("/retailers", status_code=201)
def create_retailer(
    payload: RetailerCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if db.scalar(select(Retailer).where(Retailer.slug == payload.slug)):
        raise HTTPException(status_code=409, detail="Retailer slug already exists")
    retailer = Retailer(**payload.model_dump(), is_active=True, is_demo=payload.integration_status != "live")
    db.add(retailer)
    db.commit()
    db.refresh(retailer)
    return retailer_payload(retailer)


@router.patch("/retailers/{retailer_id}")
def update_retailer(
    retailer_id: int,
    payload: RetailerUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    retailer = db.get(Retailer, retailer_id)
    if retailer is None:
        raise HTTPException(status_code=404, detail="Retailer not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(retailer, key, value)
    record_audit(db, admin.id, "admin.retailer_update", "retailer", retailer.id, after=payload.model_dump(exclude_unset=True))
    db.commit()
    return retailer_payload(retailer)


@router.get("/listings")
def admin_listings(
    retailer_id: int | None = None,
    product_id: int | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = select(ProductListing)
    if retailer_id:
        query = query.where(ProductListing.retailer_id == retailer_id)
    if product_id:
        query = query.where(ProductListing.product_id == product_id)
    listings = db.scalars(query.order_by(ProductListing.id.asc()).limit(limit)).all()
    return {
        "items": [
            {
                **basic_listing_payload(listing, db),
                "product_name": listing.product.name if listing.product else None,
            }
            for listing in listings
        ],
        "total": len(listings),
    }


@router.post("/listings", status_code=201)
def create_listing(
    payload: ListingCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    product = db.get(Product, payload.product_id)
    variant = db.get(ProductVariant, payload.variant_id)
    retailer = db.get(Retailer, payload.retailer_id)
    if product is None or variant is None or retailer is None:
        raise HTTPException(status_code=404, detail="Product, variant or retailer not found")
    if variant.product_id != product.id:
        raise HTTPException(status_code=400, detail="Variant does not belong to product")
    listing = ProductListing(**payload.model_dump(), is_demo=retailer.integration_status != "live", source=f"{retailer.adapter_key}_admin")
    db.add(listing)
    db.flush()
    db.add(
        PriceHistory(
            listing_id=listing.id,
            price=listing.price,
            mrp=listing.mrp,
            recorded_at=datetime.now(timezone.utc),
            is_demo=listing.is_demo,
            source=listing.source,
        )
    )
    db.commit()
    db.refresh(listing)
    return basic_listing_payload(listing, db)


@router.patch("/listings/{listing_id}/price")
def update_listing_price(
    listing_id: int,
    payload: ListingPriceUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    listing = db.get(ProductListing, listing_id)
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    before = {"price": money(listing.price), "mrp": money(listing.mrp)}
    listing.price = payload.price
    if payload.mrp is not None:
        listing.mrp = payload.mrp
    if payload.delivery_charge is not None:
        listing.delivery_charge = payload.delivery_charge
    if payload.availability is not None:
        listing.availability = payload.availability
    listing.last_checked_at = datetime.now(timezone.utc)
    listing.verified_at = datetime.now(timezone.utc)
    db.add(
        PriceHistory(
            listing_id=listing.id,
            price=listing.price,
            mrp=listing.mrp,
            recorded_at=datetime.now(timezone.utc),
            is_demo=listing.is_demo,
            source="admin_manual_update",
        )
    )
    record_audit(db, admin.id, "admin.listing_price_update", "listing", listing.id, before, {"price": money(listing.price)})
    db.commit()
    return {"id": listing.id, "price": money(listing.price), "updated": True}


@router.post("/retailers/{slug}/refresh-demo")
def refresh_demo_retailer(
    slug: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    adapter = get_adapter(slug, db)
    if adapter.retailer() is None:
        raise HTTPException(status_code=404, detail="Retailer not found")
    if adapter.retailer().integration_status == "live":
        raise HTTPException(status_code=400, detail="Live integrations cannot be refreshed through the demo adapter")
    updated = adapter.refresh_demo_prices(int(datetime.now(timezone.utc).timestamp()) % 97)
    record_audit(db, admin.id, "admin.demo_refresh", "retailer", slug, after={"updated_listings": updated})
    return {"slug": slug, "updated_listings": updated, "note": "Demo prices updated and marked as demo records."}


@router.get("/coupons")
def admin_coupons(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    coupons = db.scalars(select(Coupon).order_by(Coupon.id.desc())).all()
    return {"items": [coupon_payload(coupon) for coupon in coupons], "total": len(coupons)}


@router.post("/coupons", status_code=201)
def create_coupon(
    payload: CouponCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if db.get(Retailer, payload.retailer_id) is None:
        raise HTTPException(status_code=404, detail="Retailer not found")
    coupon = Coupon(**payload.model_dump(), is_demo=False, verification_source=f"admin:{admin.id}")
    db.add(coupon)
    db.commit()
    db.refresh(coupon)
    return coupon_payload(coupon)


@router.patch("/coupons/{coupon_id}/verify")
def verify_coupon_admin(
    coupon_id: int,
    verified: bool,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    coupon = db.get(Coupon, coupon_id)
    if coupon is None:
        raise HTTPException(status_code=404, detail="Coupon not found")
    coupon.is_verified = verified
    coupon.verification_source = f"admin:{admin.id}"
    record_audit(db, admin.id, "admin.coupon_verify", "coupon", coupon.id, after={"verified": verified})
    db.commit()
    return coupon_payload(coupon)


@router.get("/bank-offers")
def admin_bank_offers(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    offers = db.scalars(select(BankOffer).order_by(BankOffer.id.desc())).all()
    return {"items": [bank_offer_payload(offer) for offer in offers]}


@router.post("/bank-offers", status_code=201)
def create_bank_offer(
    payload: BankOfferCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    offer = BankOffer(**payload.model_dump(), is_demo=False)
    db.add(offer)
    db.commit()
    db.refresh(offer)
    return bank_offer_payload(offer)


@router.patch("/bank-offers/{offer_id}/active")
def toggle_bank_offer(
    offer_id: int,
    active: bool,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    offer = db.get(BankOffer, offer_id)
    if offer is None:
        raise HTTPException(status_code=404, detail="Bank offer not found")
    offer.is_active = active
    db.commit()
    return bank_offer_payload(offer)


@router.get("/community/reports")
def admin_community_reports(
    status_filter: str | None = None,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = select(CommunityReport)
    if status_filter:
        query = query.where(CommunityReport.status == status_filter)
    reports = db.scalars(query.order_by(CommunityReport.id.desc())).all()
    return {
        "items": [
            {
                "id": report.id,
                "user_id": report.user_id,
                "report_type": report.report_type,
                "product_id": report.product_id,
                "listing_id": report.listing_id,
                "claimed_value": report.claimed_value,
                "evidence_url": report.evidence_url,
                "description": report.description,
                "status": report.status,
                "duplicate_of_id": report.duplicate_of_id,
                "moderation_note": report.moderation_note,
                "created_at": report.created_at.isoformat(),
            }
            for report in reports
        ]
    }


@router.post("/community/reports/{report_id}/moderate")
def moderate_community_report(
    report_id: int,
    payload: ModerationRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    report = db.get(CommunityReport, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    report.status = payload.status
    report.moderation_note = payload.note
    report.moderated_by = admin.id
    report.duplicate_of_id = payload.duplicate_of_id
    record_audit(db, admin.id, "admin.community_moderate", "community_report", report.id, after=payload.model_dump())
    db.commit()
    return {"id": report.id, "status": report.status}


@router.get("/marketplace/listings")
def admin_marketplace_listings(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    listings = db.scalars(select(MarketplaceListing).order_by(MarketplaceListing.id.desc())).all()
    return {
        "items": [
            {
                "id": listing.id,
                "seller_id": listing.seller_id,
                "title": listing.title,
                "price": money(listing.price),
                "status": listing.status,
                "category": listing.category,
                "proof_url": listing.proof_url,
                "is_transfer_allowed": listing.is_transfer_allowed,
                "created_at": listing.created_at.isoformat(),
            }
            for listing in listings
        ]
    }


@router.get("/marketplace/reports")
def admin_marketplace_reports(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    reports = db.scalars(select(MarketplaceCouponReport).order_by(MarketplaceCouponReport.id.desc())).all()
    return {
        "items": [
            {
                "id": report.id,
                "listing_id": report.listing_id,
                "order_id": report.order_id,
                "reporter_id": report.reporter_id,
                "reason": report.reason,
                "evidence_url": report.evidence_url,
                "status": report.status,
                "resolution": report.resolution,
                "created_at": report.created_at.isoformat(),
            }
            for report in reports
        ]
    }


@router.post("/marketplace/reports/{report_id}/resolve")
def admin_resolve_marketplace_report(
    report_id: int,
    payload: CouponReportResolve,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    report = db.get(MarketplaceCouponReport, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.status != "open":
        raise HTTPException(status_code=409, detail="Report already resolved")
    report.status = payload.status
    report.resolution = payload.resolution
    report.resolved_at = datetime.now(timezone.utc)
    listing = db.get(MarketplaceListing, report.listing_id)
    if listing is not None and payload.status == "resolved_invalid":
        listing.status = "suspended"
        seller = db.get(MarketplaceSeller, listing.seller_id)
        if seller is not None:
            seller.dispute_count += 1
    record_audit(db, admin.id, "admin.marketplace_report_resolve", "marketplace_coupon_report", report.id, after=payload.model_dump())
    db.commit()
    return {"id": report.id, "status": report.status, "listing_status": listing.status if listing else None}


@router.patch("/marketplace/listings/{listing_id}")
def moderate_marketplace_listing(
    listing_id: int,
    payload: ModerationRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if payload.status not in {"approved", "rejected", "pending", "suspended"}:
        raise HTTPException(status_code=400, detail="Invalid listing moderation status")
    listing = db.get(MarketplaceListing, listing_id)
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    if payload.status == "approved" and not listing.is_transfer_allowed:
        raise HTTPException(status_code=400, detail="Issuer terms do not permit resale; listing cannot be approved")
    if payload.status == "approved" and listing.status != "approved":
        listing.approved_at = datetime.now(timezone.utc)
    if payload.status in {"rejected", "suspended"}:
        listing.rejection_reason = payload.note
    listing.status = payload.status
    record_audit(db, admin.id, "admin.marketplace_listing_moderate", "marketplace_listing", listing.id, after={"status": payload.status, "note": payload.note})
    db.commit()
    return {"id": listing.id, "status": listing.status, "rejection_reason": listing.rejection_reason}


@router.get("/marketplace/sellers")
def admin_sellers(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    sellers = db.scalars(select(MarketplaceSeller).order_by(MarketplaceSeller.id.desc())).all()
    return {
        "items": [
            {
                "id": seller.id,
                "user_id": seller.user_id,
                "display_name": seller.display_name,
                "status": seller.status,
                "rating": money(seller.rating) if seller.review_count else None,
                "total_sales": seller.total_sales,
                "is_verified": seller.is_verified,
                "review_count": seller.review_count,
                "dispute_count": seller.dispute_count,
            }
            for seller in sellers
        ]
    }


@router.patch("/marketplace/sellers/{seller_id}")
def moderate_seller(
    seller_id: int,
    payload: ModerationRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if payload.status not in {"approved", "rejected", "pending"}:
        raise HTTPException(status_code=400, detail="Invalid seller status")
    seller = db.get(MarketplaceSeller, seller_id)
    if seller is None:
        raise HTTPException(status_code=404, detail="Seller not found")
    seller.status = payload.status
    if payload.status == "approved":
        seller.is_verified = True
    seller_user = db.get(User, seller.user_id)
    role_updated = False
    if seller_user is not None and seller_user.role != "admin":
        if payload.status == "approved" and seller_user.role != "seller":
            seller_user.role = "seller"
            role_updated = True
        elif payload.status != "approved" and seller_user.role == "seller":
            seller_user.role = "user"
            role_updated = True
    record_audit(
        db,
        admin.id,
        "admin.marketplace_seller_moderate",
        "marketplace_seller",
        seller.id,
        after={"status": payload.status, "role_updated": role_updated},
    )
    db.commit()
    return {
        "id": seller.id,
        "status": seller.status,
        "user_id": seller.user_id,
        "user_role": seller_user.role if seller_user else None,
        "role_updated": role_updated,
    }


@router.get("/marketplace/disputes")
def admin_disputes(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    disputes = db.scalars(select(Dispute).order_by(Dispute.id.desc())).all()
    return {
        "items": [
            {
                "id": dispute.id,
                "order_id": dispute.order_id,
                "opened_by": dispute.opened_by,
                "reason": dispute.reason,
                "evidence_url": dispute.evidence_url,
                "status": dispute.status,
                "resolution": dispute.resolution,
                "created_at": dispute.created_at.isoformat(),
            }
            for dispute in disputes
        ]
    }


@router.post("/marketplace/disputes/{dispute_id}/resolve")
def admin_resolve_dispute(
    dispute_id: int,
    payload: DisputeResolution,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    dispute = db.get(Dispute, dispute_id)
    if dispute is None:
        raise HTTPException(status_code=404, detail="Dispute not found")
    return resolve_dispute_admin(db, dispute, payload, admin)


@router.get("/campaigns")
def admin_campaigns(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    campaigns = db.scalars(select(SaleCampaign).order_by(SaleCampaign.id.desc())).all()
    return {
        "items": [
            {
                "id": campaign.id,
                "slug": campaign.slug,
                "name": campaign.name,
                "description": campaign.description,
                "retailer_id": campaign.retailer_id,
                "starts_at": campaign.starts_at.isoformat(),
                "ends_at": campaign.ends_at.isoformat(),
                "is_active": campaign.is_active,
                "is_verified": campaign.is_verified,
                "is_demo": campaign.is_demo,
            }
            for campaign in campaigns
        ]
    }


@router.post("/campaigns", status_code=201)
def create_campaign(
    payload: CampaignCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if db.scalar(select(SaleCampaign).where(SaleCampaign.slug == payload.slug)):
        raise HTTPException(status_code=409, detail="Campaign slug already exists")
    campaign = SaleCampaign(**payload.model_dump(), is_demo=False)
    db.add(campaign)
    record_audit(db, admin.id, "admin.campaign_create", "sale_campaign", None, after=payload.model_dump())
    db.commit()
    db.refresh(campaign)
    return {"id": campaign.id, "slug": campaign.slug}


@router.patch("/campaigns/{campaign_id}")
def update_campaign(
    campaign_id: int,
    payload: dict[str, Any],
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    campaign = db.get(SaleCampaign, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    allowed = {"name", "description", "starts_at", "ends_at", "is_active", "is_verified"}
    unknown = set(payload) - allowed
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unsupported fields: {sorted(unknown)}")
    for key, value in payload.items():
        setattr(campaign, key, value)
    record_audit(db, admin.id, "admin.campaign_update", "sale_campaign", campaign.id, after=payload)
    db.commit()
    return {"id": campaign.id, "updated": sorted(payload)}


@router.delete("/campaigns/{campaign_id}")
def delete_campaign(campaign_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    campaign = db.get(SaleCampaign, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    db.delete(campaign)
    record_audit(db, admin.id, "admin.campaign_delete", "sale_campaign", campaign_id)
    db.commit()
    return {"status": "deleted"}


@router.get("/affiliate")
def affiliate_stats(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    clicks = db.scalars(select(AffiliateClick).order_by(AffiliateClick.id.desc()).limit(200)).all()
    total = len(clicks)
    cheapest = len([click for click in clicks if click.comparison_cheapest])
    by_retailer: dict[int, dict] = {}
    listings = {listing.id: listing for listing in db.scalars(select(ProductListing)).all()}
    for click in clicks:
        listing = listings.get(click.listing_id)
        if listing is None:
            continue
        entry = by_retailer.setdefault(
            listing.retailer_id, {"retailer_id": listing.retailer_id, "clicks": 0, "cheapest_clicks": 0}
        )
        entry["clicks"] += 1
        if click.comparison_cheapest:
            entry["cheapest_clicks"] += 1
    metrics = compute_metrics(db)
    return {
        "recent_clicks": [
            {
                "id": click.id,
                "listing_id": click.listing_id,
                "user_id": click.user_id,
                "session_id": click.session_id,
                "effective_price": money(click.effective_price),
                "comparison_cheapest": click.comparison_cheapest,
                "source_page": click.source_page,
                "created_at": click.created_at.isoformat(),
            }
            for click in clicks[:50]
        ],
        "total_clicks": total,
        "cheapest_clicks": cheapest,
        "by_retailer": list(by_retailer.values()),
        "primary_metric": metrics["primary_metric"],
        "disclosure": "Affiliate links are labelled. Rankings are based on effective price and intelligence scoring, never commission.",
    }


@router.get("/audit-logs")
def audit_logs(
    limit: int = Query(default=100, ge=1, le=500),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    logs = db.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(limit)).all()
    return {
        "items": [
            {
                "id": log.id,
                "actor_id": log.actor_id,
                "action": log.action,
                "entity_type": log.entity_type,
                "entity_id": log.entity_id,
                "before": log.before_data,
                "after": log.after_data,
                "ip_address": log.ip_address,
                "created_at": log.created_at.isoformat(),
            }
            for log in logs
        ]
    }


@router.get("/integrations")
def admin_integrations(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return {
        "adapters": all_adapter_statuses(db),
        "ai_provider": settings.ai_provider,
        "ai_configured": bool(settings.ai_api_key),
        "telegram_configured": bool(settings.telegram_bot_token),
        "whatsapp_configured": bool(settings.whatsapp_token and settings.whatsapp_phone_number_id),
        "payment_provider": settings.payment_provider,
        "email_provider": settings.email_provider,
        "note": "Update environment variables and restart to activate live providers. No paid service is activated automatically.",
    }
