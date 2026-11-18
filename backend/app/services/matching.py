from __future__ import annotations

import re
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Product, ProductListing, ProductVariant, Retailer
from app.services.pricing import effective_price
from app.services.serializers import money, product_payload


def normalize_tokens(text: str) -> list[str]:
    return [token for token in re.split(r"[^a-z0-9]+", text.lower()) if token]


def product_text(product: Product) -> str:
    return " ".join(
        [
            product.name,
            product.brand,
            product.model,
            product.category,
            product.description,
        ]
    ).lower()


def variant_text(variant: ProductVariant) -> str:
    attrs = " ".join(f"{key} {value}" for key, value in (variant.attributes or {}).items())
    return f"{variant.variant_name} {variant.sku} {attrs}".lower()


def variant_matches(variant: ProductVariant, tokens: list[str]) -> bool:
    text = variant_text(variant)
    return all(token in text for token in tokens)


def exact_variant_match(product: Product, variant: ProductVariant, tokens: list[str]) -> bool:
    return all(token in product_text(product) or token in variant_text(variant) for token in tokens)


def search_catalog(
    db: Session,
    query: str = "",
    category: str | None = None,
    brand: str | None = None,
    min_price: Decimal | None = None,
    max_price: Decimal | None = None,
    retailer_slug: str | None = None,
    min_rating: Decimal | None = None,
    availability: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> dict:
    tokens = normalize_tokens(query)
    products = db.scalars(select(Product).order_by(Product.id.asc())).all()
    retailer_id = None
    if retailer_slug:
        retailer = db.scalar(select(Retailer).where(Retailer.slug == retailer_slug))
        retailer_id = retailer.id if retailer else -1

    results = []
    for product in products:
        if category and category.lower() not in product.category.lower():
            continue
        if brand and brand.lower() != product.brand.lower():
            continue

        matched_variants = []
        if tokens:
            for variant in product.variants:
                if exact_variant_match(product, variant, tokens):
                    matched_variants.append(variant)
            if not matched_variants:
                continue
        else:
            matched_variants = list(product.variants)

        variant_ids = {variant.id for variant in matched_variants}
        listings = db.scalars(
            select(ProductListing).where(
                ProductListing.product_id == product.id,
                ProductListing.variant_id.in_(variant_ids),
            )
        ).all()
        filtered = []
        for listing in listings:
            if retailer_id is not None and listing.retailer_id != retailer_id:
                continue
            if min_price is not None and listing.price < min_price:
                continue
            if max_price is not None and listing.price > max_price:
                continue
            if min_rating is not None and (listing.rating is None or listing.rating < min_rating):
                continue
            if availability and listing.availability != availability:
                continue
            filtered.append(listing)
        if not filtered:
            continue

        cheapest = min(filtered, key=lambda item: item.price)
        results.append(
            {
                **product_payload(product),
                "variants": [
                    {
                        "id": variant.id,
                        "sku": variant.sku,
                        "name": variant.variant_name,
                        "attributes": variant.attributes,
                        "is_demo": variant.is_demo,
                    }
                    for variant in matched_variants
                ],
                "matched_variant_ids": sorted(variant_ids),
                "exact_variant_match": bool(tokens),
                "lowest_price": money(cheapest.price),
                "lowest_effective_price": effective_price(db, cheapest)["effective_price"],
                "retailer_count": len({listing.retailer_id for listing in filtered}),
                "listing_count": len(filtered),
                "sort_price": cheapest.price,
            }
        )

    results.sort(key=lambda item: (item["lowest_effective_price"], item["sort_price"]))
    total = len(results)
    page = results[offset : offset + limit]
    for item in page:
        item.pop("sort_price", None)
    return {"items": page, "total": total, "limit": limit, "offset": offset, "query": query}


def competitor_lowest(db: Session, product_id: int, variant_id: int, exclude_listing_id: int) -> Decimal | None:
    listings = db.scalars(
        select(ProductListing).where(
            ProductListing.product_id == product_id,
            ProductListing.variant_id == variant_id,
            ProductListing.id != exclude_listing_id,
        )
    ).all()
    if not listings:
        return None
    return min(item.price for item in listings)
