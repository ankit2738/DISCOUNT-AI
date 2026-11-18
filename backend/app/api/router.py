from __future__ import annotations

from fastapi import APIRouter

from app.api import (
    account,
    admin,
    ai,
    alerts,
    analytics,
    auth,
    campaigns,
    cart,
    catalog,
    community,
    contact,
    health,
    integrations,
    marketplace,
    notifications,
    offers,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(account.router)
api_router.include_router(catalog.router)
api_router.include_router(offers.router)
api_router.include_router(ai.router)
api_router.include_router(cart.router)
api_router.include_router(alerts.router)
api_router.include_router(community.router)
api_router.include_router(contact.router)
api_router.include_router(marketplace.router)
api_router.include_router(notifications.router)
api_router.include_router(campaigns.router)
api_router.include_router(analytics.router)
api_router.include_router(admin.router)
api_router.include_router(integrations.router)
