"""shopping memory, warranty ownership and marketplace settlement

Revision ID: 2f6a9c31b7d4
Revises: 8d4ca53678ff
Create Date: 2026-11-18 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "2f6a9c31b7d4"
down_revision: Union[str, Sequence[str], None] = "8d4ca53678ff"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("warranty_records", schema=None) as batch_op:
        batch_op.add_column(sa.Column("user_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_warranty_records_user_id_users",
            "users",
            ["user_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_index(batch_op.f("ix_warranty_records_user_id"), ["user_id"], unique=False)

    with op.batch_alter_table("marketplace_orders", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("platform_fee", sa.Numeric(12, 2), nullable=False, server_default="0")
        )
        batch_op.add_column(
            sa.Column("seller_payout", sa.Numeric(12, 2), nullable=False, server_default="0")
        )
        batch_op.add_column(sa.Column("idempotency_key", sa.String(length=80), nullable=True))
        batch_op.add_column(sa.Column("refunded_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.create_unique_constraint(
            "uq_marketplace_orders_idempotency_key", ["idempotency_key"]
        )

    op.create_table(
        "shopping_memory",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("memory_type", sa.String(length=40), nullable=False),
        sa.Column("memory_key", sa.String(length=160), nullable=False),
        sa.Column("memory_value", sa.Text(), nullable=False),
        sa.Column("context", sa.JSON(), nullable=False),
        sa.Column("source", sa.String(length=40), nullable=False),
        sa.Column("consent", sa.Boolean(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "memory_type", "memory_key", name="uq_shopping_memory_user_type_key"),
    )
    with op.batch_alter_table("shopping_memory", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_shopping_memory_memory_type"), ["memory_type"], unique=False)
        batch_op.create_index(batch_op.f("ix_shopping_memory_user_id"), ["user_id"], unique=False)

    op.create_table(
        "ai_conversations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.String(length=120), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("context", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("ai_conversations", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_ai_conversations_session_id"), ["session_id"], unique=True)
        batch_op.create_index(batch_op.f("ix_ai_conversations_user_id"), ["user_id"], unique=False)

    op.create_table(
        "ai_messages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("conversation_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("meta", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["conversation_id"], ["ai_conversations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("ai_messages", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_ai_messages_conversation_id"), ["conversation_id"], unique=False)


def downgrade() -> None:
    op.drop_table("ai_messages")
    op.drop_table("ai_conversations")
    op.drop_table("shopping_memory")
    with op.batch_alter_table("marketplace_orders", schema=None) as batch_op:
        batch_op.drop_constraint("uq_marketplace_orders_idempotency_key", type_="unique")
        batch_op.drop_column("refunded_at")
        batch_op.drop_column("idempotency_key")
        batch_op.drop_column("seller_payout")
        batch_op.drop_column("platform_fee")
    with op.batch_alter_table("warranty_records", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_warranty_records_user_id"))
        batch_op.drop_constraint("fk_warranty_records_user_id_users", type_="foreignkey")
        batch_op.drop_column("user_id")
