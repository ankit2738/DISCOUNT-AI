from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(512))
    full_name: Mapped[str] = mapped_column(String(200), default="")
    phone: Mapped[str | None] = mapped_column(String(20))
    role: Mapped[str] = mapped_column(String(20), default="user", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verification_token: Mapped[str | None] = mapped_column(String(128))
    reset_token: Mapped[str | None] = mapped_column(String(128))
    reset_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    profile: Mapped[UserProfile | None] = relationship(back_populates="user", uselist=False)
    preferences: Mapped[Preference | None] = relationship(back_populates="user", uselist=False)


class UserProfile(Base, TimestampMixin):
    __tablename__ = "user_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    city: Mapped[str | None] = mapped_column(String(120))
    state: Mapped[str | None] = mapped_column(String(120))
    pincode: Mapped[str | None] = mapped_column(String(10))
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    date_of_birth: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    shopping_persona: Mapped[str | None] = mapped_column(String(120))

    user: Mapped[User] = relationship(back_populates="profile")


class Preference(Base, TimestampMixin):
    __tablename__ = "preferences"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    preferred_brands: Mapped[list] = mapped_column(JSON, default=list)
    categories: Mapped[list] = mapped_column(JSON, default=list)
    preferred_retailers: Mapped[list] = mapped_column(JSON, default=list)
    budget_min: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    budget_max: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    personalization_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_in_app: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_email: Mapped[bool] = mapped_column(Boolean, default=False)
    notify_push: Mapped[bool] = mapped_column(Boolean, default=False)
    notify_telegram: Mapped[bool] = mapped_column(Boolean, default=False)
    notify_whatsapp: Mapped[bool] = mapped_column(Boolean, default=False)
    telegram_chat_id: Mapped[str | None] = mapped_column(String(64))
    whatsapp_number: Mapped[str | None] = mapped_column(String(20))
    consent_analytics: Mapped[bool] = mapped_column(Boolean, default=True)
    consent_marketing: Mapped[bool] = mapped_column(Boolean, default=False)

    user: Mapped[User] = relationship(back_populates="preferences")


class Product(Base, TimestampMixin):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(300), index=True)
    brand: Mapped[str] = mapped_column(String(120), index=True)
    model: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(120), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    specs: Mapped[dict] = mapped_column(JSON, default=dict)
    image_url: Mapped[str | None] = mapped_column(String(500))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True, index=True)

    variants: Mapped[list[ProductVariant]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )
    listings: Mapped[list[ProductListing]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )


class ProductVariant(Base, TimestampMixin):
    __tablename__ = "product_variants"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    sku: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    variant_name: Mapped[str] = mapped_column(String(200))
    attributes: Mapped[dict] = mapped_column(JSON, default=dict)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)

    product: Mapped[Product] = relationship(back_populates="variants")
    listings: Mapped[list[ProductListing]] = relationship(back_populates="variant")


class ProductSpecification(Base, TimestampMixin):
    __tablename__ = "product_specifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    variant_id: Mapped[int | None] = mapped_column(ForeignKey("product_variants.id", ondelete="CASCADE"))
    spec_group: Mapped[str] = mapped_column(String(120), default="General")
    name: Mapped[str] = mapped_column(String(200))
    value: Mapped[str] = mapped_column(String(500))
    source: Mapped[str] = mapped_column(String(200), default="demo_catalog")
    verified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)


class Retailer(Base, TimestampMixin):
    __tablename__ = "retailers"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    website: Mapped[str] = mapped_column(String(300))
    adapter_key: Mapped[str] = mapped_column(String(80))
    integration_status: Mapped[str] = mapped_column(String(40), default="demo")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)
    terms_note: Mapped[str] = mapped_column(Text, default="")
    affiliate_disclosure: Mapped[str] = mapped_column(Text, default="")


class ProductListing(Base, TimestampMixin):
    __tablename__ = "product_listings"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    variant_id: Mapped[int] = mapped_column(
        ForeignKey("product_variants.id", ondelete="CASCADE"), index=True
    )
    retailer_id: Mapped[int] = mapped_column(ForeignKey("retailers.id"), index=True)
    external_id: Mapped[str] = mapped_column(String(160), index=True)
    title: Mapped[str] = mapped_column(String(300))
    url: Mapped[str] = mapped_column(String(600))
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    mrp: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    delivery_charge: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0"))
    availability: Mapped[str] = mapped_column(String(40), default="in_stock")
    rating: Mapped[Decimal | None] = mapped_column(Numeric(2, 1))
    seller_name: Mapped[str] = mapped_column(String(160), default="")
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    source: Mapped[str] = mapped_column(String(120), default="demo_adapter")
    verified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    product: Mapped[Product] = relationship(back_populates="listings")
    variant: Mapped[ProductVariant] = relationship(back_populates="listings")
    retailer: Mapped[Retailer] = relationship()
    price_history: Mapped[list[PriceHistory]] = relationship(
        back_populates="listing", cascade="all, delete-orphan"
    )


class PriceHistory(Base):
    __tablename__ = "price_history"
    __table_args__ = (
        UniqueConstraint("listing_id", "recorded_at", name="uq_price_history_listing_time"),
        Index("ix_price_history_listing_recorded", "listing_id", "recorded_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    listing_id: Mapped[int] = mapped_column(
        ForeignKey("product_listings.id", ondelete="CASCADE"), index=True
    )
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    mrp: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)
    source: Mapped[str] = mapped_column(String(120), default="demo_history")

    listing: Mapped[ProductListing] = relationship(back_populates="price_history")


class PriceSource(Base):
    __tablename__ = "price_sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("product_listings.id", ondelete="CASCADE"))
    source_type: Mapped[str] = mapped_column(String(80), default="demo_feed")
    source_url: Mapped[str] = mapped_column(String(600))
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str] = mapped_column(Text, default="")


class DealScore(Base):
    __tablename__ = "deal_scores"

    id: Mapped[int] = mapped_column(primary_key=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("product_listings.id", ondelete="CASCADE"), index=True)
    score: Mapped[int] = mapped_column(Integer)
    grade: Mapped[str] = mapped_column(String(20))
    confidence: Mapped[int] = mapped_column(Integer, default=50)
    factors: Mapped[dict] = mapped_column(JSON, default=dict)
    explanation: Mapped[list] = mapped_column(JSON, default=list)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)

    evidence: Mapped[list[DealEvidence]] = relationship(
        back_populates="deal_score", cascade="all, delete-orphan"
    )


class DealEvidence(Base):
    __tablename__ = "deal_evidence"

    id: Mapped[int] = mapped_column(primary_key=True)
    deal_score_id: Mapped[int] = mapped_column(
        ForeignKey("deal_scores.id", ondelete="CASCADE"), index=True
    )
    evidence_type: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(Text)
    value: Mapped[str | None] = mapped_column(String(120))
    weight: Mapped[int] = mapped_column(Integer, default=0)

    deal_score: Mapped[DealScore] = relationship(back_populates="evidence")


class PriceAlert(Base, TimestampMixin):
    __tablename__ = "price_alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    variant_id: Mapped[int | None] = mapped_column(ForeignKey("product_variants.id", ondelete="CASCADE"))
    target_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    status: Mapped[str] = mapped_column(String(30), default="active", index=True)
    channel: Mapped[str] = mapped_column(String(30), default="in_app")
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    triggered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Coupon(Base, TimestampMixin):
    __tablename__ = "coupons"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(80), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    retailer_id: Mapped[int] = mapped_column(ForeignKey("retailers.id"))
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"))
    discount_type: Mapped[str] = mapped_column(String(20), default="percent")
    discount_value: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    max_discount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    min_order: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verification_source: Mapped[str] = mapped_column(String(200), default="community")
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    is_stackable: Mapped[bool] = mapped_column(Boolean, default=False)
    terms: Mapped[str] = mapped_column(Text, default="")


class CouponVerification(Base):
    __tablename__ = "coupon_verifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    coupon_id: Mapped[int] = mapped_column(ForeignKey("coupons.id", ondelete="CASCADE"))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(30))
    evidence_url: Mapped[str | None] = mapped_column(String(600))
    verified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    notes: Mapped[str] = mapped_column(Text, default="")


class BankOffer(Base, TimestampMixin):
    __tablename__ = "bank_offers"

    id: Mapped[int] = mapped_column(primary_key=True)
    bank_name: Mapped[str] = mapped_column(String(80), index=True)
    card_type: Mapped[str] = mapped_column(String(20), default="credit")
    title: Mapped[str] = mapped_column(String(200))
    discount_type: Mapped[str] = mapped_column(String(20), default="percent")
    discount_value: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    max_discount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    min_transaction: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    is_cashback: Mapped[bool] = mapped_column(Boolean, default=False)
    emi_only: Mapped[bool] = mapped_column(Boolean, default=False)
    no_cost_emi: Mapped[bool] = mapped_column(Boolean, default=False)
    min_tenure_months: Mapped[int | None] = mapped_column(Integer)
    retailer_id: Mapped[int | None] = mapped_column(ForeignKey("retailers.id"))
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)
    terms: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(200), default="demo_offer")


class OfferEligibility(Base):
    __tablename__ = "offer_eligibility"

    id: Mapped[int] = mapped_column(primary_key=True)
    bank_offer_id: Mapped[int] = mapped_column(ForeignKey("bank_offers.id", ondelete="CASCADE"))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    listing_id: Mapped[int | None] = mapped_column(ForeignKey("product_listings.id", ondelete="CASCADE"))
    eligible: Mapped[bool] = mapped_column(Boolean)
    reason: Mapped[str] = mapped_column(Text, default="")
    evaluated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ShoppingCart(Base, TimestampMixin):
    __tablename__ = "shopping_carts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120), default="My cart")


class CartItem(Base):
    __tablename__ = "cart_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    cart_id: Mapped[int] = mapped_column(ForeignKey("shopping_carts.id", ondelete="CASCADE"), index=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("product_listings.id", ondelete="CASCADE"))
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Watchlist(Base, TimestampMixin):
    __tablename__ = "watchlists"
    __table_args__ = (
        UniqueConstraint("user_id", "product_id", "list_type", name="uq_watchlist_user_product_type"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    list_type: Mapped[str] = mapped_column(String(20), default="saved")
    notes: Mapped[str] = mapped_column(Text, default="")


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(60), default="price_drop")
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    channel: Mapped[str] = mapped_column(String(30), default="in_app")
    status: Mapped[str] = mapped_column(String(30), default="in_app")
    provider_message_id: Mapped[str | None] = mapped_column(String(200))
    error: Mapped[str | None] = mapped_column(Text)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SaleCampaign(Base, TimestampMixin):
    __tablename__ = "sale_campaigns"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    retailer_id: Mapped[int | None] = mapped_column(ForeignKey("retailers.id"))
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    banner_url: Mapped[str | None] = mapped_column(String(500))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)


class CommunityReport(Base, TimestampMixin):
    __tablename__ = "community_reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    report_type: Mapped[str] = mapped_column(String(40), index=True)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"))
    listing_id: Mapped[int | None] = mapped_column(ForeignKey("product_listings.id", ondelete="SET NULL"))
    retailer_id: Mapped[int | None] = mapped_column(ForeignKey("retailers.id"))
    coupon_id: Mapped[int | None] = mapped_column(ForeignKey("coupons.id", ondelete="SET NULL"))
    claimed_value: Mapped[str] = mapped_column(String(200), default="")
    evidence_url: Mapped[str | None] = mapped_column(String(600))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    duplicate_of_id: Mapped[int | None] = mapped_column(ForeignKey("community_reports.id"))
    moderated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    moderation_note: Mapped[str] = mapped_column(Text, default="")


class CommunityVote(Base):
    __tablename__ = "community_votes"
    __table_args__ = (
        UniqueConstraint("report_id", "user_id", name="uq_community_vote_report_user"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("community_reports.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    vote: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MarketplaceSeller(Base, TimestampMixin):
    __tablename__ = "marketplace_sellers"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    display_name: Mapped[str] = mapped_column(String(160))
    bio: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    rating: Mapped[Decimal] = mapped_column(Numeric(2, 1), default=Decimal("0"))
    total_sales: Mapped[int] = mapped_column(Integer, default=0)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    review_count: Mapped[int] = mapped_column(Integer, default=0)
    dispute_count: Mapped[int] = mapped_column(Integer, default=0)
    disputes_lost: Mapped[int] = mapped_column(Integer, default=0)
    reputation_score: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("50"))
    verification_evidence_url: Mapped[str | None] = mapped_column(String(600))


class MarketplaceListing(Base, TimestampMixin):
    __tablename__ = "marketplace_listings"

    id: Mapped[int] = mapped_column(primary_key=True)
    seller_id: Mapped[int] = mapped_column(ForeignKey("marketplace_sellers.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(80), default="coupon")
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    proof_url: Mapped[str | None] = mapped_column(String(600))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    is_transfer_allowed: Mapped[bool] = mapped_column(Boolean, default=False)
    retailer_id: Mapped[int | None] = mapped_column(ForeignKey("retailers.id", ondelete="SET NULL"))
    brand: Mapped[str] = mapped_column(String(120), default="")
    coupon_code_encrypted: Mapped[str | None] = mapped_column(Text)
    coupon_code_hash: Mapped[str | None] = mapped_column(String(64), index=True)
    coupon_value: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    min_order: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    applicable_products: Mapped[str] = mapped_column(Text, default="")
    usage_restrictions: Mapped[str] = mapped_column(Text, default="")
    redemption_instructions: Mapped[str] = mapped_column(Text, default="")
    issuer_terms: Mapped[str] = mapped_column(Text, default="")
    usage_status: Mapped[str] = mapped_column(String(30), default="unused")
    duplicate_of_id: Mapped[int | None] = mapped_column(Integer)
    rejection_reason: Mapped[str] = mapped_column(Text, default="")
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class MarketplaceOrder(Base, TimestampMixin):
    __tablename__ = "marketplace_orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("marketplace_listings.id"))
    buyer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    seller_id: Mapped[int] = mapped_column(ForeignKey("marketplace_sellers.id"))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    platform_fee: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    seller_payout: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    idempotency_key: Mapped[str | None] = mapped_column(String(80), unique=True)
    status: Mapped[str] = mapped_column(String(40), default="pending", index=True)
    payment_provider: Mapped[str] = mapped_column(String(40), default="sandbox")
    delivery_details: Mapped[dict] = mapped_column(JSON, default=dict)
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    coupon_code_encrypted: Mapped[str | None] = mapped_column(Text)
    code_delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    redemption_status: Mapped[str] = mapped_column(String(30), default="not_redeemed")
    redeemed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("marketplace_orders.id", ondelete="CASCADE"))
    provider: Mapped[str] = mapped_column(String(60), default="sandbox")
    provider_reference: Mapped[str | None] = mapped_column(String(200))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    status: Mapped[str] = mapped_column(String(40))
    type: Mapped[str] = mapped_column(String(20), default="payment")
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Dispute(Base, TimestampMixin):
    __tablename__ = "disputes"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("marketplace_orders.id", ondelete="CASCADE"))
    opened_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    reason: Mapped[str] = mapped_column(Text)
    evidence_url: Mapped[str | None] = mapped_column(String(600))
    status: Mapped[str] = mapped_column(String(40), default="open", index=True)
    resolution: Mapped[str] = mapped_column(Text, default="")
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AffiliateClick(Base):
    __tablename__ = "affiliate_clicks"

    id: Mapped[int] = mapped_column(primary_key=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("product_listings.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    session_id: Mapped[str | None] = mapped_column(String(120), index=True)
    effective_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    comparison_cheapest: Mapped[bool] = mapped_column(Boolean, default=False)
    source_page: Mapped[str] = mapped_column(String(80), default="unknown")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Purchase(Base, TimestampMixin):
    __tablename__ = "purchases"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("product_listings.id"))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    retailer_id: Mapped[int] = mapped_column(ForeignKey("retailers.id"))
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    purchased_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class RecurringPurchase(Base, TimestampMixin):
    __tablename__ = "recurring_purchases"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    label: Mapped[str] = mapped_column(String(120))
    interval_days: Mapped[int] = mapped_column(Integer, default=30)
    last_purchased_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    next_reminder_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class ShoppingMemory(Base, TimestampMixin):
    __tablename__ = "shopping_memory"
    __table_args__ = (
        UniqueConstraint("user_id", "memory_type", "memory_key", name="uq_shopping_memory_user_type_key"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    memory_type: Mapped[str] = mapped_column(String(40), index=True)
    memory_key: Mapped[str] = mapped_column(String(160))
    memory_value: Mapped[str] = mapped_column(Text, default="")
    context: Mapped[dict] = mapped_column(JSON, default=dict)
    source: Mapped[str] = mapped_column(String(40), default="explicit")
    consent: Mapped[bool] = mapped_column(Boolean, default=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AIConversation(Base, TimestampMixin):
    __tablename__ = "ai_conversations"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    session_id: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(200), default="New conversation")
    context: Mapped[dict] = mapped_column(JSON, default=dict)


class AIMessage(Base):
    __tablename__ = "ai_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("ai_conversations.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class WarrantyRecord(Base):
    __tablename__ = "warranty_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    purchase_id: Mapped[int | None] = mapped_column(ForeignKey("purchases.id", ondelete="SET NULL"))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    variant_id: Mapped[int | None] = mapped_column(ForeignKey("product_variants.id"))
    retailer_id: Mapped[int] = mapped_column(ForeignKey("retailers.id"))
    warranty_months: Mapped[int] = mapped_column(Integer)
    provider: Mapped[str] = mapped_column(String(120))
    coverage: Mapped[str] = mapped_column(Text, default="")
    source_url: Mapped[str | None] = mapped_column(String(600))
    verified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)


class ReturnPolicy(Base):
    __tablename__ = "return_policies"

    id: Mapped[int] = mapped_column(primary_key=True)
    retailer_id: Mapped[int] = mapped_column(ForeignKey("retailers.id"), index=True)
    category: Mapped[str | None] = mapped_column(String(120))
    return_days: Mapped[int] = mapped_column(Integer, default=7)
    replacement_allowed: Mapped[bool] = mapped_column(Boolean, default=True)
    refund_policy: Mapped[str] = mapped_column(Text, default="")
    conditions: Mapped[str] = mapped_column(Text, default="")
    source_url: Mapped[str | None] = mapped_column(String(600))
    verified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)


class AnalyticsEvent(Base):
    __tablename__ = "analytics_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    session_id: Mapped[str | None] = mapped_column(String(120), index=True)
    event_type: Mapped[str] = mapped_column(String(60), index=True)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"))
    listing_id: Mapped[int | None] = mapped_column(ForeignKey("product_listings.id", ondelete="SET NULL"))
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, default=utcnow)


class AdminUser(Base):
    __tablename__ = "admin_users"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    permissions: Mapped[list] = mapped_column(JSON, default=list)
    is_superadmin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    action: Mapped[str] = mapped_column(String(120), index=True)
    entity_type: Mapped[str] = mapped_column(String(80))
    entity_id: Mapped[str | None] = mapped_column(String(80))
    before_data: Mapped[dict] = mapped_column(JSON, default=dict)
    after_data: Mapped[dict] = mapped_column(JSON, default=dict)
    ip_address: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SellerReview(Base, TimestampMixin):
    __tablename__ = "seller_reviews"

    id: Mapped[int] = mapped_column(primary_key=True)
    seller_id: Mapped[int] = mapped_column(ForeignKey("marketplace_sellers.id", ondelete="CASCADE"), index=True)
    buyer_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    order_id: Mapped[int] = mapped_column(ForeignKey("marketplace_orders.id", ondelete="CASCADE"), unique=True)
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str] = mapped_column(Text, default="")
    is_verified_purchase: Mapped[bool] = mapped_column(Boolean, default=True)


class MarketplaceCouponReport(Base, TimestampMixin):
    __tablename__ = "marketplace_coupon_reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("marketplace_listings.id", ondelete="CASCADE"), index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("marketplace_orders.id", ondelete="SET NULL"))
    reporter_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    reason: Mapped[str] = mapped_column(Text)
    evidence_url: Mapped[str | None] = mapped_column(String(600))
    status: Mapped[str] = mapped_column(String(30), default="open", index=True)
    resolution: Mapped[str] = mapped_column(Text, default="")
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
