from __future__ import annotations

import re
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Product, ProductListing, ProductVariant, Retailer
from app.services.pricing import effective_price
from app.services.serializers import basic_listing_payload, variant_payload

ATTRIBUTE_PATTERNS = {
    "storage": r"\b(?:64|128|256|512)\s?gb\b|\b1\s?tb\b",
    "ram": r"\b(?:4|6|8|12|16|24|32)\s?gb\s?ram\b|\bram\s?(?:4|6|8|12|16|24|32)\s?gb\b",
    "size": r"\b(?:uk|us|eu)\s?\d{1,2}(?:\.\d)?\b",
    "capacity": r"\b\d{1,2}(?:\.\d)?\s?kg\b",
    "color": r"\b(?:black|blue|white|silver|grey|gray|green|pink|purple|gold|titanium|red|midnight|starlight)\b",
}
MODEL_NOISE = {
    "buy",
    "online",
    "price",
    "india",
    "with",
    "and",
    "the",
    "new",
    "latest",
    "amazon",
    "flipkart",
    "in",
    "at",
    "best",
    "offer",
    "offers",
    "free",
    "delivery",
}


def _tokens(text: str) -> set[str]:
    return {token for token in re.split(r"[^a-z0-9]+", text.lower()) if token and token not in MODEL_NOISE}


def _attributes(text: str) -> dict[str, str]:
    lowered = text.lower().replace("-", " ")
    found: dict[str, str] = {}
    for name, pattern in ATTRIBUTE_PATTERNS.items():
        match = re.search(pattern, lowered)
        if match:
            found[name] = re.sub(r"\s+", "", match.group(0))
    return found


def _variant_score(product: Product, variant: ProductVariant, tokens: set[str], attributes: dict[str, str]) -> tuple[float, list[str]]:
    text = (
        f"{product.name} {product.brand} {product.model} {variant.variant_name} "
        f"{variant.sku} {' '.join(str(value) for value in (variant.attributes or {}).values())}"
    ).lower()
    text_tokens = _tokens(text)
    matched = sorted(tokens.intersection(text_tokens))
    score = float(len(matched))
    reasons = [f"title token matched: {token}" for token in sorted(matched)[:8]]
    attrs = {key.lower(): str(value).lower().replace(" ", "") for key, value in (variant.attributes or {}).items()}
    for key, expected in attributes.items():
        actual = attrs.get(key, "")
        if key == "ram" and "storage" not in attrs:
            actual = attrs.get("ram", "")
        if not actual:
            continue
        if expected in actual:
            score += 5
            reasons.append(f"{key} matched: {actual}")
        else:
            score -= 6
            reasons.append(f"{key} mismatch: page={expected}, variant={actual}")
    model_tokens = _tokens(product.model)
    if model_tokens and model_tokens.issubset(tokens):
        score += 8
        reasons.append(f"model matched: {product.model}")
    return score, reasons


def resolve_listing(
    db: Session,
    title: str,
    retailer_slug: str | None,
    external_id: str | None,
    variant_hint: str = "",
) -> dict | None:
    products = db.scalars(select(Product)).all()
    tokens = _tokens(f"{title} {variant_hint}")
    attributes = _attributes(f"{title} {variant_hint}")
    best: tuple[float, Product, ProductVariant, list[str]] | None = None
    for product in products:
        for variant in product.variants:
            score, reasons = _variant_score(product, variant, tokens, attributes)
            if best is None or score > best[0]:
                best = (score, product, variant, reasons)
    if best is None or best[0] < 3:
        return None
    score, product, variant, reasons = best

    query = select(ProductListing).where(
        ProductListing.product_id == product.id,
        ProductListing.variant_id == variant.id,
    )
    if retailer_slug:
        retailer = db.scalar(select(Retailer).where(Retailer.slug == retailer_slug))
        if retailer is not None:
            query = query.where(ProductListing.retailer_id == retailer.id)
    if external_id:
        exact = db.scalar(
            select(ProductListing).where(
                ProductListing.product_id == product.id,
                ProductListing.variant_id == variant.id,
                ProductListing.external_id.ilike(external_id),
            )
        )
        if exact is not None:
            query = query.where(ProductListing.id == exact.id)
    listings = db.scalars(query).all()
    if not listings:
        query = select(ProductListing).where(
            ProductListing.product_id == product.id,
            ProductListing.variant_id == variant.id,
        )
        listings = db.scalars(query).all()
    listings = sorted(
        listings,
        key=lambda item: Decimal(str(effective_price(db, item)["effective_price"])),
    )
    listing = listings[0] if listings else None
    confidence = min(99, max(35, int(score * 6)))
    return {
        "matched": True,
        "confidence": confidence,
        "match_reasons": reasons,
        "match_method": "exact_external_id" if external_id and listing and listing.external_id.lower() == external_id.lower() else "variant_attribute_scoring",
        "product": {
            "id": product.id,
            "slug": product.slug,
            "name": product.name,
            "brand": product.brand,
            "model": product.model,
            "category": product.category,
            "is_demo": product.is_demo,
        },
        "variant": variant_payload(variant),
        "listing": basic_listing_payload(listing, db) if listing else None,
        "listings": [basic_listing_payload(item, db) for item in listings],
        "exact_variant_required": True,
        "disclaimer": "The extension must show this exact variant. Never imply that a different storage, colour or configuration was compared.",
    }
