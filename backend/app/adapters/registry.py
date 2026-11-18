from __future__ import annotations

from sqlalchemy.orm import Session

from app.adapters.base import (
    AmazonAdapter,
    CromaAdapter,
    FlipkartAdapter,
    MeeshoAdapter,
    MyntraAdapter,
    RelianceAdapter,
    RetailerAdapter,
)

ADAPTERS: dict[str, type[RetailerAdapter]] = {
    "amazon": AmazonAdapter,
    "flipkart": FlipkartAdapter,
    "meesho": MeeshoAdapter,
    "myntra": MyntraAdapter,
    "croma": CromaAdapter,
    "reliance": RelianceAdapter,
}


def get_adapter(slug: str, db: Session) -> RetailerAdapter:
    adapter_class = ADAPTERS.get(slug, RetailerAdapter)
    return adapter_class(db)


def all_adapter_statuses(db: Session) -> list[dict]:
    return [adapter_class(db).status() for adapter_class in ADAPTERS.values()]
