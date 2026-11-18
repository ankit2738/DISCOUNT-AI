from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    DealEvidence,
    DealScore,
    PriceHistory,
    Product,
    ProductListing,
    SaleCampaign,
)
from app.services.matching import competitor_lowest
from app.services.pricing import effective_price
from app.services.serializers import history_stats, money

ZERO = Decimal("0.00")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def compute_deal_score(db: Session, listing: ProductListing) -> dict:
    stats = history_stats(listing.id, db, 365)
    effective = effective_price(db, listing)
    current = Decimal(str(effective["effective_price"]))
    explanations: list[str] = []
    evidence: list[dict] = []

    completeness = float(stats["completeness"])
    if stats["days_covered"] >= 180:
        confidence = 90
    elif stats["days_covered"] >= 90:
        confidence = 75
    elif stats["days_covered"] >= 30:
        confidence = 55
    else:
        confidence = 30

    score = 0.0
    if stats["min"] is None:
        explanations.append("No price history is available, so the score relies on current pricing only.")
    else:
        historical_min = Decimal(str(stats["min"]))
        historical_avg = Decimal(str(stats["average"]))
        if current <= historical_min * Decimal("1.01"):
            points = 30
            explanations.append("Current effective price is at or near the lowest price recorded in the last year.")
        elif current <= historical_avg:
            ratio = (historical_avg - current) / max(historical_avg - historical_min, Decimal("1"))
            points = int(15 + float(ratio) * 15)
            explanations.append("Current effective price is below the one-year average but above the historical low.")
        else:
            points = max(0, int(15 - float((current / historical_avg - 1) * 100)))
            explanations.append("Current effective price is above the one-year average.")
        score += points
        evidence.append(
            {
                "evidence_type": "historical_price",
                "description": f"One-year range Rs {stats['min']:,.0f} - Rs {stats['max']:,.0f}; average Rs {stats['average']:,.0f}.",
                "value": f"low {stats['min']:.0f}",
                "weight": points,
            }
        )

    competitor = competitor_lowest(db, listing.product_id, listing.variant_id, listing.id)
    if competitor is None:
        score += 12
        explanations.append("No other retailer listing exists for this exact variant, so competitor comparison is limited.")
        evidence.append(
            {
                "evidence_type": "competitor_price",
                "description": "No comparable listing for the exact variant.",
                "value": None,
                "weight": 12,
            }
        )
    else:
        competitor_effective = competitor + Decimal(listing.delivery_charge)
        if current <= competitor_effective:
            score += 25
            explanations.append("This is the cheapest verified listing for the exact variant among tracked retailers.")
        else:
            gap = (current - competitor_effective) / competitor_effective
            points = max(0, int(25 - float(gap * 200)))
            score += points
            explanations.append("A competing retailer lists this exact variant at a lower price.")
        evidence.append(
            {
                "evidence_type": "competitor_price",
                "description": f"Cheapest competing listing is Rs {money(competitor):,.0f} before store offers.",
                "value": f"{money(competitor)}",
                "weight": 25,
            }
        )

    mrp = Decimal(listing.mrp)
    discount_pct = float((mrp - Decimal(listing.price)) / mrp * 100) if mrp > 0 else 0
    discount_points = min(20, max(0, int(discount_pct / 2)))
    score += discount_points
    if discount_pct > 0:
        explanations.append(f"Advertised MRP discount is {discount_pct:.1f}% (subject to fake-discount checks).")
    evidence.append(
        {
            "evidence_type": "mrp_discount",
            "description": f"Current listing price is Rs {money(listing.price):,.0f} against MRP Rs {money(mrp):,.0f}.",
            "value": f"{discount_pct:.1f}%",
            "weight": discount_points,
        }
    )

    age_hours = (_now() - _aware(listing.last_checked_at)).total_seconds() / 3600 if listing.last_checked_at else 999
    if age_hours <= 6:
        freshness_points = 15
    elif age_hours <= 24:
        freshness_points = 12
    elif age_hours <= 72:
        freshness_points = 6
    else:
        freshness_points = 0
        explanations.append("Price data is more than three days old; verify the retailer page before buying.")
    score += freshness_points
    evidence.append(
        {
            "evidence_type": "data_freshness",
            "description": f"Price last checked {age_hours:.1f} hours ago.",
            "value": f"{age_hours:.1f}h",
            "weight": freshness_points,
        }
    )

    if listing.rating is None:
        seller_points = 5
        explanations.append("Seller rating is unavailable; seller reliability was not fully assessed.")
    else:
        seller_points = int(float(listing.rating) / 5 * 10)
        score += seller_points
    evidence.append(
        {
            "evidence_type": "seller_reliability",
            "description": f"Listed seller rating {listing.rating}/5 where available.",
            "value": str(listing.rating),
            "weight": seller_points,
        }
    )

    final_score = int(max(0, min(100, round(score))))
    if final_score >= 85:
        grade = "excellent"
    elif final_score >= 70:
        grade = "good"
    elif final_score >= 50:
        grade = "fair"
    else:
        grade = "poor"

    explanations.append(
        f"Confidence is {confidence}% based on {stats['days_covered']} days of history ({completeness * 100:.0f}% completeness)."
    )

    deal = DealScore(
        listing_id=listing.id,
        score=final_score,
        grade=grade,
        confidence=confidence,
        factors={
            "historical": stats,
            "current_effective_price": effective["effective_price"],
            "competitor_price": money(competitor),
            "mrp_discount_pct": round(discount_pct, 2),
            "freshness_hours": round(age_hours, 1),
        },
        explanation=explanations,
        is_demo=listing.is_demo,
    )
    db.add(deal)
    db.flush()
    for item in evidence:
        db.add(DealEvidence(deal_score_id=deal.id, **item))
    db.commit()
    db.refresh(deal)

    return {
        "listing_id": listing.id,
        "score": deal.score,
        "grade": deal.grade,
        "confidence": deal.confidence,
        "factors": deal.factors,
        "explanation": deal.explanation,
        "evidence": evidence,
        "computed_at": deal.computed_at.isoformat(),
        "is_demo": deal.is_demo,
    }


def fake_discount_analysis(db: Session, listing: ProductListing) -> dict:
    rows = db.scalars(
        select(PriceHistory)
        .where(PriceHistory.listing_id == listing.id)
        .order_by(PriceHistory.recorded_at.asc())
    ).all()
    evidence: list[dict] = []
    risk = 0
    current = Decimal(listing.price)
    claimed_mrp = Decimal(listing.mrp)
    claimed_discount = float((claimed_mrp - current) / claimed_mrp * 100) if claimed_mrp > 0 else 0

    if not rows:
        return {
            "listing_id": listing.id,
            "risk_score": 50,
            "risk_level": "unknown",
            "claimed_mrp": money(claimed_mrp),
            "claimed_discount_pct": round(claimed_discount, 2),
            "evidence": [{"signal": "no_history", "detail": "No historical prices are available to validate the claimed MRP."}],
            "summary": "Insufficient price history to assess the claimed discount.",
            "disclaimer": "This is an automated evidence summary, not an accusation of fraud.",
            "is_demo": listing.is_demo,
        }

    max_historical_mrp = max(row.mrp for row in rows)
    if claimed_mrp > max_historical_mrp * Decimal("1.05"):
        risk += 40
        evidence.append(
            {
                "signal": "inflated_mrp",
                "detail": f"Claimed MRP Rs {money(claimed_mrp):,.0f} is higher than the maximum MRP recorded historically (Rs {money(max_historical_mrp):,.0f}).",
                "weight": 40,
            }
        )

    historical_min = min(row.price for row in rows)
    historical_avg = sum(row.price for row in rows) / len(rows)
    if current > historical_min * Decimal("1.10"):
        risk += 15
        evidence.append(
            {
                "signal": "above_historical_low",
                "detail": f"Current price is more than 10% above the historical low of Rs {money(historical_min):,.0f}.",
                "weight": 15,
            }
        )

    recent = [row for row in rows if _aware(row.recorded_at) >= _now() - timedelta(days=45)]
    if recent:
        recent_high = max(row.price for row in recent)
        recent_low = min(row.price for row in recent)
        if recent_high > current * Decimal("1.12"):
            risk += 25
            evidence.append(
                {
                    "signal": "recent_spike_then_drop",
                    "detail": f"Price moved from a recent high of Rs {money(recent_high):,.0f} to Rs {money(current):,.0f} within 45 days.",
                    "weight": 25,
                }
            )
        elif recent_high > recent_low * Decimal("1.03"):
            risk += 8
            evidence.append(
                {
                    "signal": "recent_volatility",
                    "detail": "Price has fluctuated recently, so the displayed discount may be temporary.",
                    "weight": 8,
                }
            )

    typical_discounts = [
        float((row.mrp - row.price) / row.mrp * 100) for row in rows if row.mrp and row.mrp > 0
    ]
    typical_max = max(typical_discounts) if typical_discounts else 0
    if claimed_discount > 65 and claimed_discount > typical_max + 15:
        risk += 25
        evidence.append(
            {
                "signal": "unusual_discount_depth",
                "detail": f"Claimed discount of {claimed_discount:.1f}% is far deeper than historical discounts (max ~{typical_max:.1f}%).",
                "weight": 25,
            }
        )

    if claimed_mrp <= max_historical_mrp * Decimal("1.05") and current <= historical_avg:
        evidence.append(
            {
                "signal": "consistent_history",
                "detail": "Claimed MRP and current price are broadly consistent with historical records.",
                "weight": 0,
            }
        )

    risk = int(max(0, min(100, risk)))
    level = "low" if risk < 25 else "medium" if risk < 55 else "high"
    summary = {
        "low": "No strong fake-discount signals were found in the recorded price history.",
        "medium": "Some pricing patterns warrant caution. Verify the claimed MRP on the retailer page.",
        "high": "Multiple signals suggest the claimed discount may be misleading. Treat the advertised MRP with caution.",
    }[level]
    return {
        "listing_id": listing.id,
        "risk_score": risk,
        "risk_level": level,
        "claimed_mrp": money(claimed_mrp),
        "claimed_discount_pct": round(claimed_discount, 2),
        "historical_min_price": money(historical_min),
        "historical_max_mrp": money(max_historical_mrp),
        "evidence": evidence,
        "summary": summary,
        "disclaimer": "This is an automated evidence summary based on recorded data, not an accusation of fraud or a legal finding.",
        "is_demo": listing.is_demo,
        "history_days": (rows[-1].recorded_at - rows[0].recorded_at).days,
    }


def buy_or_wait(db: Session, listing: ProductListing) -> dict:
    stats = history_stats(listing.id, db, 365)
    effective = effective_price(db, listing)
    current = Decimal(str(effective["effective_price"]))
    now = _now()
    campaigns = db.scalars(
        select(SaleCampaign).where(
            SaleCampaign.is_active.is_(True),
            SaleCampaign.ends_at >= now,
        )
    ).all()
    active_campaign = None
    upcoming_campaign = None
    for campaign in campaigns:
        starts = _aware(campaign.starts_at)
        ends = _aware(campaign.ends_at)
        if starts and ends and starts <= now <= ends:
            active_campaign = campaign
        elif starts and now < starts <= now + timedelta(days=45):
            upcoming_campaign = campaign

    reasons: list[str] = []
    limitations = [
        "Recommendations use recorded history and configured sale windows; retailer prices can change without notice.",
        "Bank-specific eligibility and coupon restrictions can change the final amount.",
    ]
    confidence = 40
    if stats["days_covered"] >= 180:
        confidence = 85
    elif stats["days_covered"] >= 90:
        confidence = 70
    elif stats["days_covered"] >= 30:
        confidence = 55

    if stats["min"] is None:
        recommendation = "monitor"
        reasons.append("No historical baseline exists, so a buy/wait decision cannot be grounded.")
        confidence = 20
    else:
        historical_min = Decimal(str(stats["min"]))
        historical_avg = Decimal(str(stats["average"]))
        last_30 = db.scalars(
            select(PriceHistory)
            .where(PriceHistory.listing_id == listing.id, PriceHistory.recorded_at >= now - timedelta(days=30))
            .order_by(PriceHistory.recorded_at.asc())
        ).all()
        trend = "flat"
        if len(last_30) >= 2:
            change = (last_30[-1].price - last_30[0].price) / last_30[0].price * 100
            if change <= -2:
                trend = "falling"
            elif change >= 2:
                trend = "rising"

        if current <= historical_min * Decimal("1.02"):
            recommendation = "buy"
            reasons.append("The current effective price is within 2% of the one-year historical low.")
        elif active_campaign and current <= historical_avg * Decimal("1.02"):
            recommendation = "buy"
            reasons.append(f"{active_campaign.name} is active and the current price is at or below the one-year average.")
        elif upcoming_campaign is not None and current > historical_avg * Decimal("0.98"):
            recommendation = "wait"
            reasons.append(f"{upcoming_campaign.name} starts within 45 days; waiting may offer a better price.")
        elif current > historical_avg * Decimal("1.05") and trend != "falling":
            recommendation = "wait"
            reasons.append("The current effective price is more than 5% above the one-year average.")
        elif trend == "falling":
            recommendation = "monitor"
            reasons.append("Prices have fallen over the last 30 days; monitor for a deeper drop.")
        else:
            recommendation = "monitor"
            reasons.append("The price is near typical levels without a clear sale catalyst.")

        if active_campaign:
            reasons.append(f"Active sale event: {active_campaign.name} (demo-verified={active_campaign.is_verified}).")
        if upcoming_campaign:
            reasons.append(f"Upcoming sale event: {upcoming_campaign.name}.")
        if stats["days_covered"] < 90:
            limitations.append("Less than 90 days of history limits confidence.")

    return {
        "listing_id": listing.id,
        "recommendation": recommendation,
        "confidence": confidence,
        "current_effective_price": effective["effective_price"],
        "historical": {
            "min": stats["min"],
            "max": stats["max"],
            "average": stats["average"],
            "days_covered": stats["days_covered"],
        },
        "reasons": reasons,
        "limitations": limitations,
        "active_campaign": active_campaign.name if active_campaign else None,
        "upcoming_campaign": upcoming_campaign.name if upcoming_campaign else None,
        "is_demo": listing.is_demo,
    }


def product_alternatives(db: Session, product: Product, limit: int = 5) -> dict:
    target_listings = db.scalars(
        select(ProductListing).where(ProductListing.product_id == product.id).order_by(ProductListing.price.asc())
    ).all()
    if not target_listings:
        return {"product_id": product.id, "alternatives": [], "note": "No listings for this product."}
    target = target_listings[0]
    target_effective = Decimal(str(effective_price(db, target)["effective_price"]))
    candidates = db.scalars(
        select(Product).where(Product.category == product.category, Product.id != product.id)
    ).all()
    scored = []
    for candidate in candidates:
        listings = db.scalars(
            select(ProductListing)
            .where(ProductListing.product_id == candidate.id)
            .order_by(ProductListing.price.asc())
        ).all()
        if not listings:
            continue
        cheapest = listings[0]
        price = Decimal(cheapest.price)
        if price > target_effective * Decimal("1.45") or price < target_effective * Decimal("0.55"):
            continue
        rating = float(cheapest.rating or 0)
        spec_count = len(candidate.specs or {})
        value_score = round((1 - float(price / target_effective)) * 40 + rating * 8 + spec_count * 2 + 20, 1)
        reasons = []
        if price < target_effective:
            reasons.append(f"Costs Rs {money(target_effective - price):,.0f} less at the cheapest tracked listing.")
        else:
            reasons.append(f"Costs Rs {money(price - target_effective):,.0f} more.")
        if rating >= float(target.rating or 0):
            reasons.append("Comparable or better seller rating on the cheapest listing.")
        if len(candidate.specs or {}) > len(product.specs or {}):
            reasons.append("Lists more documented specifications to compare.")
        scored.append(
            {
                "product_id": candidate.id,
                "slug": candidate.slug,
                "name": candidate.name,
                "brand": candidate.brand,
                "category": candidate.category,
                "lowest_price": money(price),
                "lowest_effective_price": effective_price(db, cheapest)["effective_price"],
                "rating": money(cheapest.rating),
                "specs": candidate.specs,
                "value_score": value_score,
                "reasons": reasons,
                "is_demo": candidate.is_demo,
            }
        )
    scored.sort(key=lambda item: item["value_score"], reverse=True)
    return {
        "product_id": product.id,
        "reference_price": money(target_effective),
        "alternatives": scored[:limit],
        "methodology": "Ranking combines relative price, seller rating, documented specifications and value score. Promotions never influence ranking.",
    }
