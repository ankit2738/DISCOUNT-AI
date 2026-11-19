from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=200)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict[str, Any]


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class EmailVerifyRequest(BaseModel):
    token: str


class PreferenceUpdate(BaseModel):
    preferred_brands: list[str] | None = None
    categories: list[str] | None = None
    preferred_retailers: list[str] | None = None
    budget_min: Decimal | None = Field(default=None, ge=0)
    budget_max: Decimal | None = Field(default=None, ge=0)
    personalization_enabled: bool | None = None
    notify_in_app: bool | None = None
    notify_email: bool | None = None
    notify_push: bool | None = None
    notify_telegram: bool | None = None
    notify_whatsapp: bool | None = None
    telegram_chat_id: str | None = None
    whatsapp_number: str | None = None
    consent_analytics: bool | None = None
    consent_marketing: bool | None = None


class PriceCalculatorRequest(BaseModel):
    price: Decimal = Field(gt=0)
    delivery_charge: Decimal = Field(default=Decimal("0"), ge=0)
    platform_discount: Decimal = Field(default=Decimal("0"), ge=0)
    coupon_code: str | None = None
    bank_offer_id: int | None = None
    card_type: Literal["credit", "debit", "any"] = "credit"
    retailer_id: int | None = None
    quantity: int = Field(default=1, ge=1, le=20)


class ChatRequest(BaseModel):
    message: str = Field(min_length=2, max_length=2000)
    budget: Decimal | None = Field(default=None, gt=0)
    category: str | None = None
    session_id: str | None = Field(default=None, max_length=120)
    use_personal_context: bool = True


class CartItemCreate(BaseModel):
    listing_id: int
    quantity: int = Field(default=1, ge=1, le=20)


class CartOptimizeItem(BaseModel):
    listing_id: int
    quantity: int = Field(default=1, ge=1, le=20)


class CartOptimizeRequest(BaseModel):
    items: list[CartOptimizeItem] | None = None
    bank_offer_id: int | None = None
    card_type: Literal["credit", "debit", "any"] = "credit"


class AlertCreate(BaseModel):
    product_id: int
    variant_id: int | None = None
    target_price: Decimal = Field(gt=0)
    channel: Literal["in_app", "email", "push", "telegram", "whatsapp"] = "in_app"


class WatchlistCreate(BaseModel):
    product_id: int
    list_type: Literal["saved", "wishlist", "watchlist"] = "saved"
    notes: str = Field(default="", max_length=1000)


class CommunityReportCreate(BaseModel):
    report_type: Literal[
        "price", "coupon", "bank_offer", "fake_discount", "expired_offer"
    ]
    product_id: int | None = None
    listing_id: int | None = None
    retailer_id: int | None = None
    coupon_id: int | None = None
    claimed_value: str = Field(default="", max_length=200)
    evidence_url: str | None = Field(default=None, max_length=600)
    description: str = Field(default="", max_length=4000)


class VoteCreate(BaseModel):
    vote: Literal[-1, 1]


class ModerationRequest(BaseModel):
    status: Literal["approved", "rejected", "duplicate", "pending"]
    note: str = Field(default="", max_length=2000)
    duplicate_of_id: int | None = None


class SellerApplyRequest(BaseModel):
    display_name: str = Field(min_length=2, max_length=160)
    bio: str = Field(default="", max_length=2000)


class MarketplaceListingCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(default="", max_length=4000)
    category: str = Field(default="coupon", max_length=80)
    price: Decimal = Field(gt=0)
    proof_url: str | None = Field(default=None, max_length=600)
    expires_at: datetime | None = None
    is_transfer_allowed: bool = False


class MarketplaceOrderCreate(BaseModel):
    listing_id: int
    delivery_details: dict[str, Any] = Field(default_factory=dict)
    idempotency_key: str | None = Field(default=None, min_length=8, max_length=80)


class DisputeCreate(BaseModel):
    order_id: int
    reason: str = Field(min_length=5, max_length=4000)
    evidence_url: str | None = Field(default=None, max_length=600)


class DisputeResolution(BaseModel):
    status: Literal["resolved_rejected", "resolved_refunded"]
    resolution: str = Field(min_length=2, max_length=2000)


class PurchaseCreate(BaseModel):
    listing_id: int
    quantity: int = Field(default=1, ge=1, le=20)
    purchased_at: datetime | None = None


class RecurringPurchaseCreate(BaseModel):
    product_id: int
    label: str = Field(min_length=2, max_length=120)
    interval_days: int = Field(default=30, ge=1, le=365)
    last_price: Decimal = Field(gt=0)


class WarrantyCreate(BaseModel):
    purchase_id: int | None = None
    product_id: int
    retailer_id: int
    variant_id: int | None = None
    warranty_months: int = Field(ge=0, le=120)
    provider: str = Field(min_length=2, max_length=120)
    coverage: str = Field(default="", max_length=2000)
    source_url: str | None = Field(default=None, max_length=600)


class MemoryUpsert(BaseModel):
    memory_type: Literal["preference", "budget", "category", "brand", "note", "shopping_goal"]
    memory_key: str = Field(min_length=1, max_length=160)
    memory_value: str = Field(default="", max_length=2000)
    context: dict[str, Any] = Field(default_factory=dict)
    consent: bool = True


class ProductCreate(BaseModel):
    name: str = Field(min_length=2, max_length=300)
    brand: str = Field(min_length=1, max_length=120)
    model: str = Field(min_length=1, max_length=200)
    category: str = Field(min_length=1, max_length=120)
    description: str = ""
    specs: dict[str, Any] = Field(default_factory=dict)
    image_url: str | None = None


class RetailerCreate(BaseModel):
    name: str
    slug: str
    website: str
    adapter_key: str = "demo"
    integration_status: Literal["demo", "live", "unavailable"] = "demo"
    terms_note: str = ""
    affiliate_disclosure: str = ""


class CouponCreate(BaseModel):
    code: str
    title: str
    retailer_id: int
    product_id: int | None = None
    discount_type: Literal["percent", "flat"] = "percent"
    discount_value: Decimal = Field(gt=0)
    max_discount: Decimal | None = Field(default=None, ge=0)
    min_order: Decimal = Field(default=Decimal("0"), ge=0)
    expires_at: datetime | None = None
    is_verified: bool = False
    is_stackable: bool = False
    terms: str = ""


class BankOfferCreate(BaseModel):
    bank_name: str
    card_type: Literal["credit", "debit", "any"] = "credit"
    title: str
    discount_type: Literal["percent", "flat"] = "percent"
    discount_value: Decimal = Field(gt=0)
    max_discount: Decimal | None = Field(default=None, ge=0)
    min_transaction: Decimal = Field(default=Decimal("0"), ge=0)
    is_cashback: bool = False
    emi_only: bool = False
    no_cost_emi: bool = False
    min_tenure_months: int | None = Field(default=None, ge=1)
    retailer_id: int | None = None
    starts_at: datetime | None = None
    expires_at: datetime | None = None
    is_active: bool = True
    terms: str = ""
    source: str = "demo_offer"


class CampaignCreate(BaseModel):
    slug: str
    retailer_id: int | None = None
    name: str
    description: str = ""
    starts_at: datetime
    ends_at: datetime
    is_active: bool = True
    is_verified: bool = False

    @field_validator("ends_at")
    @classmethod
    def validate_end(cls, value: datetime, info):
        starts_at = info.data.get("starts_at")
        if starts_at and value <= starts_at:
            raise ValueError("ends_at must be after starts_at")
        return value


class UserRoleUpdate(BaseModel):
    role: Literal["user", "seller", "admin"]


class ListingPriceUpdate(BaseModel):
    price: Decimal = Field(gt=0)
    mrp: Decimal | None = Field(default=None, gt=0)
    delivery_charge: Decimal | None = Field(default=None, ge=0)
    availability: Literal["in_stock", "out_of_stock", "limited"] | None = None


class AnalyticsEventCreate(BaseModel):
    event_type: str = Field(min_length=2, max_length=60)
    session_id: str | None = None
    product_id: int | None = None
    listing_id: int | None = None
    meta: dict[str, Any] = Field(default_factory=dict)


class AdminNoteRequest(BaseModel):
    note: str = Field(default="", max_length=2000)


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=200)
    phone: str | None = Field(default=None, max_length=20)
    city: str | None = None
    state: str | None = None
    pincode: str | None = Field(default=None, max_length=10)
    shopping_persona: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class DeleteAccountRequest(BaseModel):
    password: str


class AlertUpdate(BaseModel):
    target_price: Decimal | None = Field(default=None, gt=0)
    status: Literal["active", "paused", "deleted"] | None = None
    channel: Literal["in_app", "email", "push", "telegram", "whatsapp"] | None = None


class CartItemUpdate(BaseModel):
    quantity: int = Field(ge=0, le=20)


class CouponVerifyRequest(BaseModel):
    status: Literal["valid", "invalid", "expired"]
    evidence_url: str | None = Field(default=None, max_length=600)
    notes: str = Field(default="", max_length=2000)


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=300)
    brand: str | None = Field(default=None, min_length=1, max_length=120)
    model: str | None = Field(default=None, min_length=1, max_length=200)
    category: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    specs: dict[str, Any] | None = None
    image_url: str | None = None


class VariantCreate(BaseModel):
    sku: str = Field(min_length=2, max_length=120)
    variant_name: str = Field(min_length=1, max_length=200)
    attributes: dict[str, Any] = Field(default_factory=dict)


class ListingCreate(BaseModel):
    product_id: int
    variant_id: int
    retailer_id: int
    external_id: str = Field(min_length=2, max_length=160)
    title: str = Field(min_length=2, max_length=300)
    url: str = Field(min_length=4, max_length=600)
    price: Decimal = Field(gt=0)
    mrp: Decimal = Field(gt=0)
    delivery_charge: Decimal = Field(default=Decimal("0"), ge=0)
    availability: Literal["in_stock", "out_of_stock", "limited"] = "in_stock"
    rating: Decimal | None = Field(default=None, ge=0, le=5)
    seller_name: str = ""


class RetailerUpdate(BaseModel):
    name: str | None = None
    integration_status: Literal["demo", "live", "unavailable"] | None = None
    is_active: bool | None = None
    terms_note: str | None = None
    affiliate_disclosure: str | None = None


class ContactRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    subject: str = Field(default="General enquiry", max_length=200)
    message: str = Field(min_length=10, max_length=4000)
