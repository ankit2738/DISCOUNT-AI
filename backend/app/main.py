from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.db import init_db
from app.middleware import RateLimitMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="DISCOUNT AI API",
    version="0.2.0",
    description=(
        "Shopping intelligence API for Indian online shoppers. "
        "All seeded retailer data is labelled demo data. "
        "Buy Smarter. Not Just Cheaper."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list({*settings.cors_origins, "http://localhost:5173", "http://127.0.0.1:5173"}),
    allow_origin_regex=r"chrome-extension://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RateLimitMiddleware)
app.include_router(api_router)


@app.get("/", tags=["Health"])
def root() -> dict:
    return {
        "name": "DISCOUNT AI API",
        "tagline": "Buy Smarter. Not Just Cheaper.",
        "docs": "/docs",
        "health": "/api/health",
        "demo_mode": settings.demo_mode,
    }
