from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import BankOffer, Coupon, ProductListing
from app.schemas import PriceCalculatorRequest
from app.services.serializers import bank_offer_payload, coupon_payload, money

ZERO = Decimal("0.00")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def coupon_discount(coupon: Coupon, amount: Decimal) -> Decimal:
    if amount < coupon.min_order:
        return ZERO
    if coupon.discount_type == "percent":
        discount = amount * coupon.discount_value / Decimal("100")
    else:
        discount = coupon.discount_value
    if coupon.max_discount is not None:
        discount = min(discount, coupon.max_discount)
    return max(ZERO, min(discount, amount)).quantize(Decimal("0.01"))


def coupon_eligible(coupon: Coupon, amount: Decimal, retailer_id: int | None, product_id: int | None) -> tuple[bool, str]:
    expires = _aware(coupon.expires_at)
    if expires is not None and expires < _now():
        return False, "Coupon has expired"
    if retailer_id is not None and coupon.retailer_id != retailer_id:
        return False, "Coupon belongs to a different retailer"
    if coupon.product_id is not None and product_id is not None and coupon.product_id != product_id:
        return False, "Coupon does not apply to this product"
    if not coupon.is_verified:
        return False, "Coupon is not verified"
    if amount < coupon.min_order:
        return False, f"Minimum order value is Rs {money(coupon.min_order)}"
    return True, "Eligible"


def best_coupon(db: Session, listing: ProductListing, amount: Decimal) -> tuple[Coupon | None, Decimal]:
    coupons = db.scalars(
        select(Coupon).where(
            Coupon.retailer_id == listing.retailer_id,
            Coupon.is_verified.is_(True),
        )
    ).all()
    best: Coupon | None = None
    best_value = ZERO
    for coupon in coupons:
        if coupon.product_id is not None and coupon.product_id != listing.product_id:
            continue
        eligible, _ = coupon_eligible(coupon, amount, listing.retailer_id, listing.product_id)
        if not eligible:
            continue
        value = coupon_discount(coupon, amount)
        if value > best_value:
            best = coupon
            best_value = value
    return best, best_value


def bank_offer_eligible(
    offer: BankOffer,
    amount: Decimal,
    card_type: str,
    retailer_id: int | None,
) -> tuple[bool, str]:
    if not offer.is_active:
        return False, "Offer is inactive"
    expires = _aware(offer.expires_at)
    starts = _aware(offer.starts_at)
    now = _now()
    if starts is not None and starts > now:
        return False, "Offer has not started"
    if expires is not None and expires < now:
        return False, "Offer has expired"
    if offer.retailer_id is not None and retailer_id is not None and offer.retailer_id != retailer_id:
        return False, "Offer applies to a different retailer"
    if offer.card_type != "any" and card_type != "any" and offer.card_type != card_type:
        return False, f"Requires a {offer.card_type} card"
    if amount < offer.min_transaction:
        return False, f"Minimum transaction is Rs {money(offer.min_transaction)}"
    return True, "Eligible"


def bank_offer_discount(offer: BankOffer, amount: Decimal) -> Decimal:
    if offer.discount_type == "percent":
        value = amount * offer.discount_value / Decimal("100")
    else:
        value = offer.discount_value
    if offer.max_discount is not None:
        value = min(value, offer.max_discount)
    return max(ZERO, min(value, amount)).quantize(Decimal("0.01"))


def effective_price(db: Session, listing: ProductListing) -> dict:
    price = Decimal(listing.price)
    delivery = Decimal(listing.delivery_charge)
    coupon, discount = best_coupon(db, listing, price)
    payable = (price + delivery - discount).quantize(Decimal("0.01"))

    offers = db.scalars(
        select(BankOffer).where(BankOffer.is_active.is_(True))
    ).all()
    bank_options = []
    for offer in offers:
        if offer.emi_only:
            continue
        eligible, reason = bank_offer_eligible(offer, price + delivery, "credit", listing.retailer_id)
        if eligible and not offer.is_cashback:
            value = bank_offer_discount(offer, price + delivery)
            bank_options.append(
                {
                    **bank_offer_payload(offer),
                    "estimated_discount": money(value),
                    "final_price": money(payable - value),
                }
            )
    bank_options.sort(key=lambda item: item["final_price"])

    return {
        "price": money(price),
        "delivery_charge": money(delivery),
        "coupon": coupon_payload(coupon) if coupon else None,
        "coupon_discount": money(discount),
        "effective_price": money(payable),
        "best_bank_offer": bank_options[0] if bank_options else None,
        "verified": listing.verified_at is not None,
        "is_demo": listing.is_demo,
        "source": listing.source,
    }


def calculate_final_price(db: Session, request: PriceCalculatorRequest) -> dict:
    quantity = request.quantity
    base = (Decimal(request.price) * quantity).quantize(Decimal("0.01"))
    delivery = Decimal(request.delivery_charge).quantize(Decimal("0.01"))
    platform_discount = Decimal(request.platform_discount).quantize(Decimal("0.01"))
    platform_discount = max(ZERO, min(platform_discount, base))
    subtotal = (base + delivery).quantize(Decimal("0.01"))

    warnings: list[str] = []
    coupon = None
    coupon_value = ZERO
    if request.coupon_code:
        coupon = db.scalar(select(Coupon).where(Coupon.code == request.coupon_code.upper()))
        if coupon is None:
            warnings.append("Coupon code was not found")
        else:
            eligible, reason = coupon_eligible(
                coupon,
                subtotal - platform_discount,
                request.retailer_id,
                None,
            )
            if eligible:
                coupon_value = coupon_discount(coupon, subtotal - platform_discount)
            else:
                warnings.append(f"Coupon not applied: {reason}")

    immediate_discounts = platform_discount + coupon_value
    after_coupons = max(ZERO, subtotal - immediate_discounts)

    bank_offer = None
    bank_value = ZERO
    cashback_value = ZERO
    if request.bank_offer_id is not None:
        bank_offer = db.get(BankOffer, request.bank_offer_id)
        if bank_offer is None:
            warnings.append("Bank offer was not found")
        else:
            eligible, reason = bank_offer_eligible(
                bank_offer, after_coupons, request.card_type, request.retailer_id
            )
            if eligible:
                amount = bank_offer_discount(bank_offer, after_coupons)
                if bank_offer.is_cashback:
                    cashback_value = amount
                    warnings.append(
                        "Cashback is tracked separately and is not deducted from immediate payable amount"
                    )
                else:
                    bank_value = amount
            else:
                warnings.append(f"Bank offer not applied: {reason}")

    final_payable = max(ZERO, after_coupons - bank_value).quantize(Decimal("0.01"))
    total_savings = (base - final_payable + cashback_value).quantize(Decimal("0.01"))
    if total_savings < ZERO:
        total_savings = ZERO

    return {
        "breakdown": {
            "unit_price": money(Decimal(request.price)),
            "quantity": quantity,
            "product_total": money(base),
            "delivery_charge": money(delivery),
            "subtotal": money(subtotal),
            "platform_discount": money(platform_discount),
            "coupon_discount": money(coupon_value),
            "bank_discount": money(bank_value),
            "cashback": money(cashback_value),
            "final_payable": money(final_payable),
        },
        "coupon": coupon_payload(coupon) if coupon else None,
        "bank_offer": bank_offer_payload(bank_offer) if bank_offer else None,
        "total_savings": money(total_savings),
        "warnings": warnings,
        "disclaimer": "Estimates use demo offer data unless verified timestamps say otherwise. Bank terms and issuer eligibility must be confirmed at checkout.",
    }

