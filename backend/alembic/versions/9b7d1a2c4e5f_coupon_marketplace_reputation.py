"""coupon marketplace code security, reputation and reports

Revision ID: 9b7d1a2c4e5f
Revises: 2f6a9c31b7d4
Create Date: 2026-11-20 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9b7d1a2c4e5f"
down_revision: Union[str, Sequence[str], None] = "2f6a9c31b7d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("marketplace_sellers", schema=None) as batch_op:
        batch_op.add_column(sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column("review_count", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("dispute_count", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("disputes_lost", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("reputation_score", sa.Numeric(5, 2), nullable=False, server_default="50"))
        batch_op.add_column(sa.Column("verification_evidence_url", sa.String(length=600), nullable=True))

    with op.batch_alter_table("marketplace_listings", schema=None) as batch_op:
        batch_op.add_column(sa.Column("retailer_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("brand", sa.String(length=120), nullable=False, server_default=""))
        batch_op.add_column(sa.Column("coupon_code_encrypted", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("coupon_code_hash", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("coupon_value", sa.Numeric(12, 2), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("min_order", sa.Numeric(12, 2), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("applicable_products", sa.Text(), nullable=False, server_default=""))
        batch_op.add_column(sa.Column("usage_restrictions", sa.Text(), nullable=False, server_default=""))
        batch_op.add_column(sa.Column("redemption_instructions", sa.Text(), nullable=False, server_default=""))
        batch_op.add_column(sa.Column("issuer_terms", sa.Text(), nullable=False, server_default=""))
        batch_op.add_column(sa.Column("usage_status", sa.String(length=30), nullable=False, server_default="unused"))
        batch_op.add_column(sa.Column("duplicate_of_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("rejection_reason", sa.Text(), nullable=False, server_default=""))
        batch_op.add_column(sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.create_foreign_key("fk_marketplace_listings_retailer_id", "retailers", ["retailer_id"], ["id"], ondelete="SET NULL")
        batch_op.create_index(batch_op.f("ix_marketplace_listings_coupon_code_hash"), ["coupon_code_hash"], unique=False)

    with op.batch_alter_table("marketplace_orders", schema=None) as batch_op:
        batch_op.add_column(sa.Column("coupon_code_encrypted", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("code_delivered_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("redemption_status", sa.String(length=30), nullable=False, server_default="not_redeemed"))
        batch_op.add_column(sa.Column("redeemed_at", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "seller_reviews",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("seller_id", sa.Integer(), nullable=False),
        sa.Column("buyer_id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=False),
        sa.Column("is_verified_purchase", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["seller_id"], ["marketplace_sellers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["buyer_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["marketplace_orders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("order_id"),
    )
    with op.batch_alter_table("seller_reviews", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_seller_reviews_seller_id"), ["seller_id"], unique=False)

    op.create_table(
        "marketplace_coupon_reports",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("listing_id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("reporter_id", sa.Integer(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("evidence_url", sa.String(length=600), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="open"),
        sa.Column("resolution", sa.Text(), nullable=False, server_default=""),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["listing_id"], ["marketplace_listings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["marketplace_orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["reporter_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("marketplace_coupon_reports", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_marketplace_coupon_reports_listing_id"), ["listing_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_marketplace_coupon_reports_status"), ["status"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("marketplace_coupon_reports", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_marketplace_coupon_reports_status"))
        batch_op.drop_index(batch_op.f("ix_marketplace_coupon_reports_listing_id"))
    op.drop_table("marketplace_coupon_reports")

    with op.batch_alter_table("seller_reviews", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_seller_reviews_seller_id"))
    op.drop_table("seller_reviews")

    with op.batch_alter_table("marketplace_orders", schema=None) as batch_op:
        batch_op.drop_column("redeemed_at")
        batch_op.drop_column("redemption_status")
        batch_op.drop_column("code_delivered_at")
        batch_op.drop_column("coupon_code_encrypted")

    with op.batch_alter_table("marketplace_listings", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_marketplace_listings_coupon_code_hash"))
        batch_op.drop_constraint("fk_marketplace_listings_retailer_id", type_="foreignkey")
        batch_op.drop_column("approved_at")
        batch_op.drop_column("rejection_reason")
        batch_op.drop_column("duplicate_of_id")
        batch_op.drop_column("usage_status")
        batch_op.drop_column("issuer_terms")
        batch_op.drop_column("redemption_instructions")
        batch_op.drop_column("usage_restrictions")
        batch_op.drop_column("applicable_products")
        batch_op.drop_column("min_order")
        batch_op.drop_column("coupon_value")
        batch_op.drop_column("coupon_code_hash")
        batch_op.drop_column("coupon_code_encrypted")
        batch_op.drop_column("brand")
        batch_op.drop_column("retailer_id")

    with op.batch_alter_table("marketplace_sellers", schema=None) as batch_op:
        batch_op.drop_column("verification_evidence_url")
        batch_op.drop_column("reputation_score")
        batch_op.drop_column("disputes_lost")
        batch_op.drop_column("dispute_count")
        batch_op.drop_column("review_count")
        batch_op.drop_column("is_verified")
