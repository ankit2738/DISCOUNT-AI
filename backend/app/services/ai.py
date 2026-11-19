from __future__ import annotations

import json
import re
from decimal import Decimal
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Product, ProductListing
from app.services.matching import search_catalog
from app.services.pricing import effective_price
from app.services.serializers import money

CATEGORY_KEYWORDS = {
    "smartphone": "Smartphones",
    "phone": "Smartphones",
    "iphone": "Smartphones",
    "mobile": "Smartphones",
    "laptop": "Laptops",
    "notebook": "Laptops",
    "programming": "Laptops",
    "gaming": "Laptops",
    "headphone": "Audio",
    "earbud": "Audio",
    "audio": "Audio",
    "tv": "Televisions",
    "television": "Televisions",
    "shoe": "Footwear",
    "running": "Footwear",
    "watch": "Wearables",
    "washing": "Home Appliances",
    "air fryer": "Kitchen Appliances",
    "kitchen": "Kitchen Appliances",
}


def parse_budget(message: str) -> Decimal | None:
    pattern = re.compile(r"(?:under|below|around|upto|up to|budget(?: of)?|₹|rs\.?)\s*₹?\s*([\d,]{3,9})", re.I)
    match = pattern.search(message)
    if not match:
        match = re.search(r"₹\s*([\d,]{3,9})", message)
    if not match:
        return None
    try:
        return Decimal(match.group(1).replace(",", ""))
    except Exception:  # noqa: BLE001
        return None


def detect_category(message: str) -> str | None:
    lowered = message.lower()
    for keyword, category in CATEGORY_KEYWORDS.items():
        if keyword in lowered:
            return category
    return None


def grounded_products(db: Session, budget: Decimal | None, category: str | None, query: str = "") -> list[dict]:
    result = search_catalog(
        db,
        query=query,
        category=category,
        max_price=budget,
        limit=8,
    )
    grounded = []
    for product in result["items"]:
        product_obj = db.get(Product, product["id"])
        if product_obj is None:
            continue
        listing_objs = [
            listing
            for listing in product_obj.listings
            if budget is None or listing.price <= budget
        ]
        if not listing_objs:
            continue
        priced = []
        for listing in listing_objs:
            effective = effective_price(db, listing)
            priced.append(
                {
                    "listing_id": listing.id,
                    "variant_id": listing.variant_id,
                    "variant": next(
                        (v.variant_name for v in product_obj.variants if v.id == listing.variant_id),
                        "",
                    ),
                    "retailer_id": listing.retailer_id,
                    "price": money(listing.price),
                    "delivery": money(listing.delivery_charge),
                    "effective_price": effective["effective_price"],
                    "coupon": effective["coupon"]["code"] if effective["coupon"] else None,
                    "availability": listing.availability,
                    "is_demo": listing.is_demo,
                }
            )
        priced.sort(key=lambda item: item["effective_price"])
        grounded.append(
            {
                "id": product_obj.id,
                "name": product_obj.name,
                "brand": product_obj.brand,
                "category": product_obj.category,
                "specs": product_obj.specs,
                "best_listing": priced[0],
                "all_listings": priced,
                "is_demo": product_obj.is_demo,
            }
        )
    return grounded[:5]


def rule_based_reply(
    db: Session,
    message: str,
    budget: Decimal | None = None,
    category: str | None = None,
    context: dict | None = None,
) -> dict:
    budget = budget or parse_budget(message)
    category = category or detect_category(message)
    query_terms = "" if category else message
    products = grounded_products(db, budget, category, query_terms)
    context = context or {}
    context_used = {
        key: context.get(key)
        for key in ("memory", "saved_products", "active_alerts", "recurring_purchases")
        if context.get(key)
    }

    if not products:
        return {
            "provider": "rule_based_fallback",
            "grounded": True,
            "reply": (
                "I could not find any tracked product matching that request"
                + (f" under Rs {money(budget):,.0f}" if budget else "")
                + ". I will not invent products or prices. Try relaxing the budget or category, or search the catalogue directly."
            ),
            "recommendations": [],
            "limitations": [
                "Only demo/verified catalogue records in this deployment are searched.",
                "No external AI provider is configured; this answer is rule-based.",
            ],
            "context_used": context_used,
            "is_demo": True,
        }

    lines = []
    target = f" under Rs {money(budget):,.0f}" if budget else ""
    lines.append(f"Here are tracked {category or 'products'} options{target}, based only on catalogue records:")
    recommendations = []
    for index, product in enumerate(products, start=1):
        best = product["best_listing"]
        line = (
            f"{index}. {product['name']} — effective Rs {best['effective_price']:,.0f} "
            f"at tracking ID {best['listing_id']} ({best['variant']})"
        )
        if best.get("coupon"):
            line += f", eligible coupon {best['coupon']}"
        lines.append(line)
        recommendations.append(
            {
                "product_id": product["id"],
                "name": product["name"],
                "category": product["category"],
                "specs": product["specs"],
                "listing_id": best["listing_id"],
                "effective_price": best["effective_price"],
                "variant": best["variant"],
                "coupon": best.get("coupon"),
                "is_demo": product["is_demo"],
            }
        )
    lines.append("Prices include tracked delivery charges and the best verified platform coupon. Bank offers are additional and depend on card eligibility.")
    lines.append("All seeded catalogue data is marked demo data; verify on the retailer site before purchase.")
    return {
        "provider": "rule_based_fallback",
        "grounded": True,
        "reply": "\n".join(lines),
        "recommendations": recommendations,
        "limitations": [
            "No external AI provider is configured, so this response is deterministic and rule-based.",
            "Recommendations do not account for live stock beyond the last verified timestamp.",
        ],
        "context_used": context_used,
        "is_demo": True,
    }


class AIProvider:
    name = "base"

    def chat(
        self,
        db: Session,
        message: str,
        budget: Decimal | None,
        category: str | None,
        context: dict | None = None,
    ) -> dict:
        raise NotImplementedError


class FallbackProvider(AIProvider):
    name = "rule_based_fallback"

    def chat(
        self,
        db: Session,
        message: str,
        budget: Decimal | None,
        category: str | None,
        context: dict | None = None,
    ) -> dict:
        return rule_based_reply(db, message, budget, category, context)


class OpenAICompatibleProvider(AIProvider):
    name = "openai_compatible"

    def __init__(self) -> None:
        self.base_url = settings.ai_base_url.rstrip("/")
        self.model = settings.ai_model

    def _retrieval_tool(self, db: Session, arguments: dict[str, Any]) -> list[dict]:
        budget = arguments.get("budget")
        return grounded_products(
            db,
            Decimal(str(budget)) if budget else None,
            arguments.get("category"),
            arguments.get("query", ""),
        )

    def chat(
        self,
        db: Session,
        message: str,
        budget: Decimal | None,
        category: str | None,
        context: dict | None = None,
    ) -> dict:
        budget = budget or parse_budget(message)
        category = category or detect_category(message)
        products = grounded_products(db, budget, category, "" if category else message)
        catalog_json = json.dumps(products, default=str)
        context_json = json.dumps(context or {}, default=str)
        headers = {"Authorization": f"Bearer {settings.ai_api_key}", "Content-Type": "application/json"}
        tool = {
            "type": "function",
            "function": {
                "name": "search_catalog",
                "description": "Search the grounded DISCOUNT AI product catalogue. Use before making recommendations.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"},
                        "category": {"type": "string"},
                        "budget": {"type": "number"},
                    },
                },
            },
        }
        messages = [
            {
                "role": "system",
                "content": (
                    "You are DISCOUNT AI, an Indian shopping intelligence assistant. "
                    "Only use the provided catalogue records. Never invent products, prices or specifications. "
                    "Mention that seeded data is demo data. Explain trade-offs and additional bank offer eligibility."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Question: {message}\n"
                    f"Grounded catalogue records (JSON): {catalog_json}\n"
                    f"User-approved shopping context (JSON): {context_json}"
                ),
            },
        ]
        try:
            response = httpx.post(
                f"{self.base_url}/chat/completions",
                headers=headers,
                json={
                    "model": self.model,
                    "messages": messages,
                    "tools": [tool],
                    "tool_choice": "auto",
                    "temperature": 0.2,
                },
                timeout=30,
            )
            response.raise_for_status()
            payload = response.json()
            content = payload["choices"][0]["message"].get("content") or ""
            if not content.strip():
                content = rule_based_reply(db, message, budget, category, context)["reply"]
            return {
                "provider": self.name,
                "grounded": True,
                "reply": content,
                "recommendations": [
                    {
                        "product_id": product["id"],
                        "name": product["name"],
                        "listing_id": product["best_listing"]["listing_id"],
                        "effective_price": product["best_listing"]["effective_price"],
                        "is_demo": product["is_demo"],
                    }
                    for product in products
                ],
                "limitations": ["AI output is grounded on the retrieved records but may still contain reasoning errors."],
                "is_demo": True,
            }
        except Exception as exc:  # noqa: BLE001
            fallback = rule_based_reply(db, message, budget, category, context)
            fallback["provider"] = "fallback_after_provider_error"
            fallback["limitations"].append(f"External AI provider call failed: {type(exc).__name__}")
            return fallback


def get_ai_provider() -> AIProvider:
    if settings.ai_provider in {"openai", "openai_compatible"} and settings.ai_api_key:
        return OpenAICompatibleProvider()
    return FallbackProvider()
