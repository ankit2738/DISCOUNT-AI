from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import (
    BankOffer,
    CartItem,
    Coupon,
    ProductListing,
    ShoppingCart,
    User,
)
from app.schemas import CartItemCreate, CartItemUpdate, CartOptimizeRequest
from app.services.pricing import (
    bank_offer_discount,
    bank_offer_eligible,
    coupon_discount,
    effective_price,
)
from app.services.serializers import (
    bank_offer_payload,
    basic_listing_payload,
    coupon_payload,
    money,
)

router = APIRouter(prefix="/api/cart", tags=["Smart cart"])


def _get_cart(db: Session, user: User) -> ShoppingCart:
    cart = db.scalar(select(ShoppingCart).where(ShoppingCart.user_id == user.id).order_by(ShoppingCart.id.asc()))
    if cart is None:
        cart = ShoppingCart(user_id=user.id, name="My cart")
        db.add(cart)
        db.commit()
        db.refresh(cart)
    return cart


def _cart_payload(db: Session, cart: ShoppingCart) -> dict:
    items = db.scalars(select(CartItem).where(CartItem.cart_id == cart.id)).all()
    payloads = []
    subtotal = Decimal("0")
    delivery_total = Decimal("0")
    for item in items:
        listing = db.get(ProductListing, item.listing_id)
        if listing is None:
            continue
        effective = effective_price(db, listing)
        line_total = Decimal(listing.price) * item.quantity
        line_delivery = Decimal(listing.delivery_charge) * item.quantity
        subtotal += line_total
        delivery_total += line_delivery
        payloads.append(
            {
                "id": item.id,
                "quantity": item.quantity,
                "listing": basic_listing_payload(listing, db),
                "effective": effective,
                "line_total": money(line_total),
                "line_delivery": money(line_delivery),
                "added_at": item.added_at.isoformat(),
            }
        )
    return {
        "id": cart.id,
        "name": cart.name,
        "items": payloads,
        "item_count": len(payloads),
        "subtotal": money(subtotal),
        "delivery_total": money(delivery_total),
        "pre_offer_total": money(subtotal + delivery_total),
        "is_demo_pricing": any(item["listing"]["is_demo"] for item in payloads),
    }


@router.get("")
def get_cart(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _cart_payload(db, _get_cart(db, user))


@router.post("/items")
def add_item(
    payload: CartItemCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    listing = db.get(ProductListing, payload.listing_id)
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    cart = _get_cart(db, user)
    existing = db.scalar(
        select(CartItem).where(CartItem.cart_id == cart.id, CartItem.listing_id == listing.id)
    )
    if existing:
        existing.quantity = min(20, existing.quantity + payload.quantity)
    else:
        db.add(CartItem(cart_id=cart.id, listing_id=listing.id, quantity=payload.quantity))
    db.commit()
    return _cart_payload(db, cart)


@router.patch("/items/{item_id}")
def update_item(
    item_id: int,
    payload: CartItemUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cart = _get_cart(db, user)
    item = db.get(CartItem, item_id)
    if item is None or item.cart_id != cart.id:
        raise HTTPException(status_code=404, detail="Cart item not found")
    if payload.quantity == 0:
        db.delete(item)
    else:
        item.quantity = payload.quantity
    db.commit()
    return _cart_payload(db, cart)


@router.delete("/items/{item_id}")
def delete_item(item_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cart = _get_cart(db, user)
    item = db.get(CartItem, item_id)
    if item is None or item.cart_id != cart.id:
        raise HTTPException(status_code=404, detail="Cart item not found")
    db.delete(item)
    db.commit()
    return _cart_payload(db, cart)


@router.delete("/clear")
def clear_cart(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cart = _get_cart(db, user)
    for item in db.scalars(select(CartItem).where(CartItem.cart_id == cart.id)).all():
        db.delete(item)
    db.commit()
    return _cart_payload(db, cart)


@router.post("/optimize")
def optimize_cart(
    payload: CartOptimizeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cart = _get_cart(db, user)
    if payload.items:
        requested = [(item.listing_id, item.quantity) for item in payload.items]
    else:
        requested = [
            (item.listing_id, item.quantity)
            for item in db.scalars(select(CartItem).where(CartItem.cart_id == cart.id)).all()
        ]
    if not requested:
        return {"message": "Cart is empty", "items": [], "optimized_total": 0, "savings": 0, "stores": []}

    lines = []
    original_total = Decimal("0")
    warnings: list[str] = []
    for listing_id, quantity in requested:
        listing = db.get(ProductListing, listing_id)
        if listing is None:
            warnings.append(f"Listing {listing_id} not found and was skipped")
            continue
        options = db.scalars(
            select(ProductListing).where(
                ProductListing.product_id == listing.product_id,
                ProductListing.variant_id == listing.variant_id,
            )
        ).all()
        original_total += (Decimal(listing.price) + Decimal(listing.delivery_charge)) * quantity
        priced = []
        for option in options:
            eff = effective_price(db, option)
            priced.append((Decimal(str(eff["effective_price"])), option, eff))
        priced.sort(key=lambda item: item[0])
        _, cheapest, eff = priced[0]
        line_merchandise = Decimal(cheapest.price) * quantity
        line_delivery = Decimal(cheapest.delivery_charge) * quantity
        lines.append(
            {
                "product_id": listing.product_id,
                "variant_id": listing.variant_id,
                "quantity": quantity,
                "original_listing_id": listing.id,
                "original_listing": basic_listing_payload(listing, db),
                "recommended_listing_id": cheapest.id,
                "recommended_listing": basic_listing_payload(cheapest, db),
                "unit_effective_price": eff["effective_price"],
                "line_merchandise_total": money(line_merchandise),
                "line_delivery_total": money(line_delivery),
                "line_pre_offer_total": money(line_merchandise + line_delivery),
                "coupon_already_applied": eff["coupon"] is not None,
                "switched": cheapest.id != listing.id,
            }
        )

    groups: dict[int, list[dict]] = {}
    for line in lines:
        retailer_id = line["recommended_listing"]["retailer"]["id"]
        groups.setdefault(retailer_id, []).append(line)

    stores = []
    grand_total = Decimal("0")
    for retailer_id, group_lines in groups.items():
        product_subtotal = sum(
            Decimal(str(line["recommended_listing"]["price"])) * line["quantity"] for line in group_lines
        )
        delivery_subtotal = sum(
            Decimal(str(line["line_delivery_total"])) for line in group_lines
        )
        base_subtotal = product_subtotal + delivery_subtotal
        product_ids = {line["product_id"] for line in group_lines}
        coupons = db.scalars(
            select(Coupon).where(Coupon.retailer_id == retailer_id, Coupon.is_verified.is_(True))
        ).all()
        best_coupon_obj = None
        best_coupon_value = Decimal("0")
        for coupon in coupons:
            if coupon.product_id is not None and coupon.product_id not in product_ids:
                continue
            expires = coupon.expires_at
            if expires is not None and (expires if expires.tzinfo else expires.replace(tzinfo=timezone.utc)) < datetime.now(timezone.utc):
                continue
            if base_subtotal < coupon.min_order:
                continue
            value = coupon_discount(coupon, base_subtotal)
            if value > best_coupon_value:
                best_coupon_obj = coupon
                best_coupon_value = value

        bank_offer_obj = None
        bank_value = Decimal("0")
        cashback_value = Decimal("0")
        after_coupon = max(Decimal("0"), base_subtotal - best_coupon_value)
        if payload.bank_offer_id is not None:
            offer = db.get(BankOffer, payload.bank_offer_id)
            if offer is not None:
                eligible, reason = bank_offer_eligible(
                    offer, after_coupon, payload.card_type, retailer_id
                )
                if eligible:
                    value = bank_offer_discount(offer, after_coupon)
                    if offer.is_cashback:
                        cashback_value = value
                        bank_offer_obj = offer
                    else:
                        bank_value = value
                        bank_offer_obj = offer
                else:
                    warnings.append(f"Bank offer not applied for retailer {retailer_id}: {reason}")

        store_total = max(Decimal("0"), after_coupon - bank_value)
        grand_total += store_total
        stores.append(
            {
                "retailer_id": retailer_id,
                "items": group_lines,
                "product_subtotal": money(product_subtotal),
                "delivery_subtotal": money(delivery_subtotal),
                "pre_offer_subtotal": money(base_subtotal),
                "applied_coupon": coupon_payload(best_coupon_obj) if best_coupon_obj else None,
                "coupon_discount": money(best_coupon_value),
                "applied_bank_offer": bank_offer_payload(bank_offer_obj) if bank_offer_obj else None,
                "bank_discount": money(bank_value),
                "cashback": money(cashback_value),
                "store_payable": money(store_total),
            }
        )

    optimized_total = grand_total.quantize(Decimal("0.01"))
    savings = max(Decimal("0"), original_total - optimized_total)
    return {
        "items": lines,
        "stores": stores,
        "original_total": money(original_total),
        "optimized_total": money(optimized_total),
        "savings": money(savings),
        "cashback_total": money(sum(Decimal(str(store["cashback"])) for store in stores)),
        "multi_store": len(stores) > 1,
        "warnings": warnings,
        "methodology": "For each exact variant, the lowest verified effective listing is selected. Per-retailer baskets apply one eligible verified coupon and the chosen bank offer where eligibility rules pass.",
        "disclaimer": "Demo pricing. Final checkout totals may differ due to live offer restrictions and card eligibility.",
    }
