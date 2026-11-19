from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user, get_optional_user
from app.models import CommunityReport, CommunityVote, Product, ProductListing, User
from app.schemas import CommunityReportCreate, VoteCreate
from app.services.serializers import money

router = APIRouter(prefix="/api/community", tags=["Community verification"])


def _reputation(db: Session, user_id: int) -> int:
    approved = db.scalar(
        select(func.count(CommunityReport.id)).where(
            CommunityReport.user_id == user_id, CommunityReport.status == "approved"
        )
    ) or 0
    votes = db.scalar(
        select(func.coalesce(func.sum(CommunityVote.vote), 0))
        .join(CommunityReport, CommunityReport.id == CommunityVote.report_id)
        .where(CommunityReport.user_id == user_id)
    ) or 0
    return int(max(0, approved * 10 + votes * 2))


def _report_payload(db: Session, report: CommunityReport) -> dict:
    product = db.get(Product, report.product_id) if report.product_id else None
    listing = db.get(ProductListing, report.listing_id) if report.listing_id else None
    votes = db.scalars(select(CommunityVote).where(CommunityVote.report_id == report.id)).all()
    return {
        "id": report.id,
        "report_type": report.report_type,
        "status": report.status,
        "product": {"id": product.id, "slug": product.slug, "name": product.name} if product else None,
        "listing_id": listing.id if listing else None,
        "retailer_id": report.retailer_id,
        "coupon_id": report.coupon_id,
        "claimed_value": report.claimed_value,
        "evidence_url": report.evidence_url,
        "description": report.description,
        "duplicate_of_id": report.duplicate_of_id,
        "moderation_note": report.moderation_note,
        "vote_score": sum(vote.vote for vote in votes),
        "upvotes": sum(1 for vote in votes if vote.vote == 1),
        "downvotes": sum(1 for vote in votes if vote.vote == -1),
        "reporter_reputation": _reputation(db, report.user_id),
        "is_official": False,
        "verification_label": "Community report - not retailer verified",
        "created_at": report.created_at.isoformat(),
        "updated_at": report.updated_at.isoformat(),
    }


@router.get("/reports")
def list_reports(
    status_filter: str = "approved",
    report_type: str | None = None,
    mine: bool = False,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    query = select(CommunityReport)
    if mine:
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication required")
        query = query.where(CommunityReport.user_id == user.id)
    else:
        query = query.where(CommunityReport.status == status_filter)
    if report_type:
        query = query.where(CommunityReport.report_type == report_type)
    reports = db.scalars(query.order_by(CommunityReport.id.desc())).all()
    return {"items": [_report_payload(db, report) for report in reports], "total": len(reports)}


@router.get("/reports/{report_id}")
def get_report(
    report_id: int,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    report = db.get(CommunityReport, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    is_owner = user is not None and report.user_id == user.id
    is_admin = user is not None and user.role == "admin"
    if report.status not in {"approved", "duplicate", "rejected"} and not (is_owner or is_admin):
        raise HTTPException(status_code=404, detail="Report not found")
    return _report_payload(db, report)


@router.post("/reports", status_code=201)
def create_report(
    payload: CommunityReportCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.product_id and db.get(Product, payload.product_id) is None:
        raise HTTPException(status_code=404, detail="Product not found")
    if payload.listing_id and db.get(ProductListing, payload.listing_id) is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    cutoff = datetime.now(timezone.utc) - timedelta(days=1)
    duplicate = db.scalar(
        select(CommunityReport).where(
            CommunityReport.report_type == payload.report_type,
            CommunityReport.listing_id == payload.listing_id,
            CommunityReport.coupon_id == payload.coupon_id,
            CommunityReport.claimed_value == payload.claimed_value,
            CommunityReport.created_at >= cutoff,
            CommunityReport.status != "rejected",
        )
    )
    report = CommunityReport(
        user_id=user.id,
        report_type=payload.report_type,
        product_id=payload.product_id,
        listing_id=payload.listing_id,
        retailer_id=payload.retailer_id,
        coupon_id=payload.coupon_id,
        claimed_value=payload.claimed_value,
        evidence_url=payload.evidence_url,
        description=payload.description,
        status="duplicate" if duplicate else "pending",
        duplicate_of_id=duplicate.id if duplicate else None,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    response = _report_payload(db, report)
    response["duplicate_detected"] = duplicate is not None
    if duplicate:
        response["note"] = f"A similar report already exists (#{duplicate.id}); this submission was flagged as a duplicate."
    else:
        response["note"] = "Report submitted for moderation. It is not retailer-verified."
    return response


@router.post("/reports/{report_id}/vote")
def vote_report(
    report_id: int,
    payload: VoteCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    report = db.get(CommunityReport, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not available for voting")
    if report.user_id == user.id:
        raise HTTPException(status_code=400, detail="You cannot vote on your own report")
    if report.status != "approved":
        raise HTTPException(status_code=404, detail="Report is not yet approved for voting")
    vote = db.scalar(
        select(CommunityVote).where(
            CommunityVote.report_id == report_id, CommunityVote.user_id == user.id
        )
    )
    if vote is None:
        vote = CommunityVote(report_id=report_id, user_id=user.id, vote=payload.vote)
        db.add(vote)
    else:
        vote.vote = payload.vote
    db.commit()
    return {"report_id": report_id, "vote": payload.vote, "reporter_reputation": _reputation(db, report.user_id)}


@router.get("/leaderboard")
def leaderboard(db: Session = Depends(get_db)):
    users = db.scalars(select(User).where(User.is_active.is_(True))).all()
    ranked = [
        {"user_id": user.id, "display_name": user.full_name or f"Shopper #{user.id}", "reputation": _reputation(db, user.id)}
        for user in users
    ]
    ranked.sort(key=lambda item: item["reputation"], reverse=True)
    return {"items": [item for item in ranked if item["reputation"] > 0][:20]}
