from __future__ import annotations

import math
import random
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    AdminUser,
    BankOffer,
    CommunityReport,
    CommunityVote,
    Coupon,
    MarketplaceListing,
    MarketplaceSeller,
    Preference,
    PriceHistory,
    Product,
    ProductListing,
    ProductSpecification,
    ProductVariant,
    Purchase,
    RecurringPurchase,
    Retailer,
    ReturnPolicy,
    SaleCampaign,
    ShoppingMemory,
    User,
    UserProfile,
    Watchlist,
    WarrantyRecord,
)
from app.security import hash_password

D = Decimal


def _money(value: str | int | float) -> Decimal:
    return D(str(value)).quantize(D("0.01"))


PRODUCTS = [
    {
        "slug": "apple-iphone-15",
        "name": "Apple iPhone 15",
        "brand": "Apple",
        "model": "iPhone 15",
        "category": "Smartphones",
        "description": "6.1-inch Super Retina XDR display, A16 Bionic chip and 48MP main camera.",
        "specs": {"display": "6.1 inch OLED", "chipset": "A16 Bionic", "camera": "48MP + 12MP", "battery": "3349 mAh", "os": "iOS 17"},
        "variants": [
            {"sku": "IP15-128-BLK", "name": "128GB Black", "attributes": {"storage": "128GB", "color": "Black"}, "price": 69999, "mrp": 79900, "sellers": ["amazon", "flipkart", "croma"]},
            {"sku": "IP15-256-BLU", "name": "256GB Blue", "attributes": {"storage": "256GB", "color": "Blue"}, "price": 79999, "mrp": 89900, "sellers": ["amazon", "flipkart"]},
        ],
    },
    {
        "slug": "samsung-galaxy-s24",
        "name": "Samsung Galaxy S24 5G",
        "brand": "Samsung",
        "model": "Galaxy S24",
        "category": "Smartphones",
        "description": "Compact flagship with Galaxy AI, 120Hz AMOLED display and 50MP camera.",
        "specs": {"display": "6.2 inch AMOLED", "chipset": "Exynos 2400", "camera": "50MP + 12MP + 10MP", "battery": "4000 mAh", "os": "Android 14"},
        "variants": [
            {"sku": "SGS24-256-ONX", "name": "256GB Onyx Black", "attributes": {"storage": "256GB", "color": "Onyx Black"}, "price": 74999, "mrp": 79999, "sellers": ["amazon", "flipkart", "reliance"]},
        ],
    },
    {
        "slug": "lenovo-ideapad-slim-5",
        "name": "Lenovo IdeaPad Slim 5",
        "brand": "Lenovo",
        "model": "IdeaPad Slim 5",
        "category": "Laptops",
        "description": "16GB RAM, 512GB SSD, Ryzen 7 laptop suited to programming and multitasking.",
        "specs": {"cpu": "AMD Ryzen 7 7730U", "ram": "16GB DDR4", "storage": "512GB SSD", "display": "15.6 inch FHD", "os": "Windows 11"},
        "variants": [
            {"sku": "LEN-IPS5-16-512", "name": "16GB / 512GB SSD", "attributes": {"ram": "16GB", "storage": "512GB"}, "price": 61990, "mrp": 74990, "sellers": ["amazon", "flipkart", "croma"]},
        ],
    },
    {
        "slug": "asus-tuf-gaming-f15",
        "name": "ASUS TUF Gaming F15",
        "brand": "ASUS",
        "model": "TUF Gaming F15",
        "category": "Laptops",
        "description": "Gaming laptop with RTX 3050, 16GB RAM and 144Hz display.",
        "specs": {"cpu": "Intel Core i5-12500H", "gpu": "RTX 3050 4GB", "ram": "16GB DDR4", "storage": "512GB SSD", "display": "15.6 inch 144Hz", "os": "Windows 11"},
        "variants": [
            {"sku": "ASUS-F15-3050", "name": "i5 / RTX 3050 / 16GB", "attributes": {"ram": "16GB", "gpu": "RTX 3050"}, "price": 64990, "mrp": 79990, "sellers": ["amazon", "flipkart"]},
        ],
    },
    {
        "slug": "sony-wh-1000xm5",
        "name": "Sony WH-1000XM5",
        "brand": "Sony",
        "model": "WH-1000XM5",
        "category": "Audio",
        "description": "Industry-leading noise cancelling wireless headphones with 30-hour battery.",
        "specs": {"type": "Over-ear", "battery": "30 hours", "anc": "Yes", "connectivity": "Bluetooth 5.2"},
        "variants": [
            {"sku": "SONY-XM5-BLK", "name": "Black", "attributes": {"color": "Black"}, "price": 26990, "mrp": 34990, "sellers": ["amazon", "flipkart", "croma"]},
        ],
    },
    {
        "slug": "nike-air-zoom-pegasus-40",
        "name": "Nike Air Zoom Pegasus 40",
        "brand": "Nike",
        "model": "Air Zoom Pegasus 40",
        "category": "Footwear",
        "description": "Responsive daily running shoes with Zoom Air units.",
        "specs": {"type": "Running", "drop": "10mm", "upper": "Engineered mesh"},
        "variants": [
            {"sku": "NIKE-PEG40-UK9", "name": "UK 9", "attributes": {"size": "UK 9"}, "price": 7995, "mrp": 10995, "sellers": ["myntra", "flipkart"]},
        ],
    },
    {
        "slug": "boat-airdopes-141",
        "name": "boAt Airdopes 141",
        "brand": "boAt",
        "model": "Airdopes 141",
        "category": "Audio",
        "description": "TWS earbuds with 42-hour playback and ENx noise cancellation.",
        "specs": {"type": "TWS", "battery": "42 hours with case", "anc": "ENx", "connectivity": "Bluetooth 5.1"},
        "variants": [
            {"sku": "BOAT-141-BLK", "name": "Black", "attributes": {"color": "Black"}, "price": 1299, "mrp": 2990, "sellers": ["flipkart", "meesho"]},
        ],
    },
    {
        "slug": "lg-55-inch-4k-tv",
        "name": 'LG 55" 4K Ultra HD Smart TV',
        "brand": "LG",
        "model": "55UR7500",
        "category": "Televisions",
        "description": "55-inch 4K smart TV with webOS and AI ThinQ.",
        "specs": {"size": "55 inch", "resolution": "4K UHD", "panel": "LED", "os": "webOS"},
        "variants": [
            {"sku": "LG-55UR7500", "name": "55 inch", "attributes": {"size": "55 inch"}, "price": 54990, "mrp": 69990, "sellers": ["croma", "reliance", "amazon"]},
        ],
    },
    {
        "slug": "samsung-8kg-washing-machine",
        "name": "Samsung 8kg Front Load Washing Machine",
        "brand": "Samsung",
        "model": "WW80T4020CX",
        "category": "Home Appliances",
        "description": "8kg front-load washing machine with Digital Inverter and Hygiene Steam.",
        "specs": {"capacity": "8 kg", "type": "Front load", "energy": "5 Star", "warranty": "2+10 years"},
        "variants": [
            {"sku": "SAM-WM-8KG", "name": "8kg", "attributes": {"capacity": "8kg"}, "price": 41990, "mrp": 52990, "sellers": ["flipkart", "croma", "reliance"]},
        ],
    },
    {
        "slug": "apple-macbook-air-m2",
        "name": "Apple MacBook Air M2",
        "brand": "Apple",
        "model": "MacBook Air M2",
        "category": "Laptops",
        "description": "13.6-inch Liquid Retina laptop with M2 chip, 8GB RAM and 256GB SSD.",
        "specs": {"cpu": "Apple M2", "ram": "8GB", "storage": "256GB SSD", "display": "13.6 inch", "os": "macOS"},
        "variants": [
            {"sku": "MBA-M2-8-256", "name": "8GB / 256GB", "attributes": {"ram": "8GB", "storage": "256GB"}, "price": 89990, "mrp": 99900, "sellers": ["amazon", "flipkart", "croma"]},
        ],
    },
    {
        "slug": "noise-colorfit-pro-5",
        "name": "Noise ColorFit Pro 5",
        "brand": "Noise",
        "model": "ColorFit Pro 5",
        "category": "Wearables",
        "description": "1.85-inch AMOLED smartwatch with Bluetooth calling and 7-day battery.",
        "specs": {"display": "1.85 inch AMOLED", "battery": "7 days", "calling": "Yes"},
        "variants": [
            {"sku": "NOISE-CFP5-BLK", "name": "Jet Black", "attributes": {"color": "Jet Black"}, "price": 3499, "mrp": 5999, "sellers": ["flipkart", "amazon", "meesho"]},
        ],
    },
    {
        "slug": "philips-air-fryer-4l",
        "name": "Philips Air Fryer 4.1L",
        "brand": "Philips",
        "model": "HD9200/90",
        "category": "Kitchen Appliances",
        "description": "4.1L air fryer with Rapid Air technology and 90% less fat.",
        "specs": {"capacity": "4.1 L", "power": "1400W", "warranty": "2 years"},
        "variants": [
            {"sku": "PHIL-AF-41", "name": "4.1L", "attributes": {"capacity": "4.1L"}, "price": 8999, "mrp": 11995, "sellers": ["amazon", "flipkart"]},
        ],
    },
]

RETAILERS = [
    ("amazon", "Amazon India", "https://www.amazon.in", "Amazon.in is a marketplace. This deployment uses demo listings and is not affiliated with Amazon.", "As an Amazon Associate, DISCOUNT AI may earn from qualifying purchases."),
    ("flipkart", "Flipkart", "https://www.flipkart.com", "Flipkart listings shown are demo records. A production deployment must use authorized feeds or APIs.", "Affiliate links may earn a commission. Rankings are never based on commission."),
    ("meesho", "Meesho", "https://www.meesho.com", "Meesho has no unrestricted public API. Demo adapters are used unless an authorized integration exists.", "Affiliate disclosure applies where links are monetised."),
    ("myntra", "Myntra", "https://www.myntra.com", "Myntra listings are demo records pending authorized access.", "Affiliate disclosure applies where links are monetised."),
    ("croma", "Croma", "https://www.croma.com", "Croma listings are demo records pending authorized access.", "Affiliate disclosure applies where links are monetised."),
    ("reliance", "Reliance Digital", "https://www.reliancedigital.in", "Reliance Digital listings are demo records pending authorized access.", "Affiliate disclosure applies where links are monetised."),
]

RETAILER_PRICE_DELTAS = {
    "amazon": 0,
    "flipkart": -800,
    "meesho": -150,
    "myntra": 0,
    "croma": 900,
    "reliance": 400,
}

RETAILER_RATINGS = {
    "amazon": D("4.4"),
    "flipkart": D("4.3"),
    "meesho": D("3.9"),
    "myntra": D("4.2"),
    "croma": D("4.1"),
    "reliance": D("4.0"),
}


def seed_database(db: Session) -> None:
    if db.scalar(select(User).limit(1)) is not None:
        return

    now = datetime.now(timezone.utc)

    admin = User(
        email="admin@discountai.in",
        password_hash=hash_password("AdminPass123!"),
        full_name="DISCOUNT AI Admin",
        role="admin",
        is_verified=True,
        profile=UserProfile(city="Bengaluru", state="Karnataka"),
        preferences=Preference(preferred_brands=["Apple"], categories=["Smartphones"], budget_max=D("100000")),
    )
    demo = User(
        email="demo@discountai.in",
        password_hash=hash_password("DemoPass123!"),
        full_name="Demo Shopper",
        role="user",
        is_verified=True,
        profile=UserProfile(city="Mumbai", state="Maharashtra", shopping_persona="Value seeker"),
        preferences=Preference(
            preferred_brands=["Apple", "Samsung", "Lenovo"],
            categories=["Smartphones", "Laptops"],
            preferred_retailers=["amazon", "flipkart"],
            budget_min=D("2000"),
            budget_max=D("90000"),
            notify_in_app=True,
            notify_email=True,
        ),
    )
    seller_user = User(
        email="seller@discountai.in",
        password_hash=hash_password("SellerPass123!"),
        full_name="Demo Seller",
        role="seller",
        is_verified=True,
        profile=UserProfile(city="Delhi", state="Delhi"),
        preferences=Preference(),
    )
    db.add_all([admin, demo, seller_user])
    db.flush()
    db.add(AdminUser(user_id=admin.id, permissions=["*"], is_superadmin=True))

    retailers: dict[str, Retailer] = {}
    for slug, name, website, terms, affiliate in RETAILERS:
        retailer = Retailer(
            slug=slug,
            name=name,
            website=website,
            adapter_key=slug,
            integration_status="demo",
            is_demo=True,
            terms_note=terms,
            affiliate_disclosure=affiliate,
        )
        db.add(retailer)
        retailers[slug] = retailer
    db.flush()

    products: list[Product] = []
    listing_records: list[ProductListing] = []
    for index, data in enumerate(PRODUCTS, start=1):
        product = Product(
            slug=data["slug"],
            name=data["name"],
            brand=data["brand"],
            model=data["model"],
            category=data["category"],
            description=data["description"],
            specs=data["specs"],
            image_url=None,
            is_demo=True,
        )
        db.add(product)
        db.flush()
        products.append(product)
        for spec_name, spec_value in data["specs"].items():
            db.add(
                ProductSpecification(
                    product_id=product.id,
                    spec_group="Key specs",
                    name=spec_name.replace("_", " ").title(),
                    value=str(spec_value),
                    source="demo_catalog",
                    is_demo=True,
                )
            )
        for variant_data in data["variants"]:
            variant = ProductVariant(
                product_id=product.id,
                sku=variant_data["sku"],
                variant_name=variant_data["name"],
                attributes=variant_data["attributes"],
                is_demo=True,
            )
            db.add(variant)
            db.flush()
            base_price = D(variant_data["price"])
            base_mrp = D(variant_data["mrp"])
            for retailer_slug in variant_data["sellers"]:
                retailer = retailers[retailer_slug]
                price = max(base_price + D(RETAILER_PRICE_DELTAS[retailer_slug]), D("99"))
                mrp = base_mrp
                if variant_data["sku"] == "IP15-128-BLK" and retailer_slug == "amazon":
                    mrp = D("99900")
                listing = ProductListing(
                    product_id=product.id,
                    variant_id=variant.id,
                    retailer_id=retailer.id,
                    external_id=f"{retailer_slug.upper()}-{variant_data['sku']}",
                    title=f"{data['name']} ({variant_data['name']})",
                    url=f"{retailer.website}/demo/{variant_data['sku'].lower()}",
                    price=price,
                    mrp=mrp,
                    delivery_charge=D("0") if price > D("4999") else D("49"),
                    availability="in_stock",
                    rating=RETAILER_RATINGS[retailer_slug],
                    seller_name=f"{retailer.name} Demo Store",
                    is_demo=True,
                    source="demo_adapter",
                    verified_at=now - timedelta(hours=index % 12),
                    last_checked_at=now - timedelta(hours=index % 12),
                )
                db.add(listing)
                listing_records.append(listing)
    db.flush()

    history_mrp = D("79900")
    for listing in listing_records:
        rng = random.Random(listing.id * 7919)
        for days_ago in range(364, -1, -1):
            day = 364 - days_ago
            if days_ago == 0:
                price = listing.price
            else:
                trend = D("1.10") - D("0.10") * D(day) / D(364)
                noise = D(str(1 + 0.025 * math.sin(day / 17 + listing.id) + rng.uniform(-0.012, 0.012)))
                price = (listing.price * trend * noise).quantize(D("1"))
                if day in range(298, 308) or day in range(330, 338):
                    price = (price * D("0.93")).quantize(D("1"))
                price = max(price, D("99"))
            historical_mrp = listing.mrp
            if listing.external_id == "AMAZON-IP15-128-BLK":
                historical_mrp = history_mrp
            db.add(
                PriceHistory(
                    listing_id=listing.id,
                    price=price,
                    mrp=historical_mrp,
                    recorded_at=(now - timedelta(days=days_ago)).replace(hour=12, minute=0, second=0, microsecond=0),
                    is_demo=True,
                    source="demo_history",
                )
            )

    coupons = [
        Coupon(code="AMZ10", title="10% off Amazon electronics", description="Demo coupon for verified electronics purchases.", retailer_id=retailers["amazon"].id, discount_type="percent", discount_value=D("10"), max_discount=D("1500"), min_order=D("4999"), expires_at=now + timedelta(days=30), is_verified=True, verification_source="demo_verified", is_demo=True, terms="Demo only. Max discount Rs 1,500."),
        Coupon(code="FK5", title="5% off Flipkart", description="Demo coupon available on selected products.", retailer_id=retailers["flipkart"].id, discount_type="percent", discount_value=D("5"), max_discount=D("1000"), min_order=D("2999"), expires_at=now + timedelta(days=20), is_verified=True, verification_source="demo_verified", is_demo=True, terms="Demo only. Max discount Rs 1,000."),
        Coupon(code="CROMA500", title="Flat Rs 500 off Croma", description="Demo Croma basket coupon.", retailer_id=retailers["croma"].id, discount_type="flat", discount_value=D("500"), min_order=D("5000"), expires_at=now + timedelta(days=15), is_verified=True, verification_source="demo_verified", is_demo=True, terms="Demo only. Minimum order Rs 5,000."),
        Coupon(code="MYNTR A15".replace(" ", ""), title="15% off Myntra footwear", description="Demo Myntra coupon.", retailer_id=retailers["myntra"].id, discount_type="percent", discount_value=D("15"), max_discount=D("1200"), min_order=D("3999"), expires_at=now + timedelta(days=12), is_verified=True, verification_source="demo_verified", is_demo=True, terms="Demo only."),
        Coupon(code="MEESHO100", title="Flat Rs 100 off Meesho", description="Demo Meesho coupon.", retailer_id=retailers["meesho"].id, discount_type="flat", discount_value=D("100"), min_order=D("999"), expires_at=now + timedelta(days=25), is_verified=False, verification_source="community", is_demo=True, terms="Community reported, pending verification."),
        Coupon(code="REL500", title="Flat Rs 500 off Reliance Digital", description="Demo Reliance coupon.", retailer_id=retailers["reliance"].id, discount_type="flat", discount_value=D("500"), min_order=D("5000"), expires_at=now + timedelta(days=18), is_verified=True, verification_source="demo_verified", is_demo=True, terms="Demo only."),
        Coupon(code="EXPIRED10", title="Expired demo coupon", description="Expired coupon used to test expiry handling.", retailer_id=retailers["amazon"].id, discount_type="percent", discount_value=D("10"), max_discount=D("2000"), min_order=D("1000"), expires_at=now - timedelta(days=2), is_verified=False, verification_source="community", is_demo=True, terms="Expired demo record."),
    ]
    db.add_all(coupons)

    bank_offers = [
        BankOffer(bank_name="HDFC", card_type="credit", title="10% instant discount with HDFC credit cards", discount_type="percent", discount_value=D("10"), max_discount=D("1500"), min_transaction=D("5000"), retailer_id=retailers["amazon"].id, expires_at=now + timedelta(days=20), is_active=True, is_demo=True, terms="Demo offer. Subject to bank eligibility.", source="demo_offer"),
        BankOffer(bank_name="SBI", card_type="credit", title="5% instant discount with SBI cards", discount_type="percent", discount_value=D("5"), max_discount=D("1000"), min_transaction=D("3000"), retailer_id=retailers["flipkart"].id, expires_at=now + timedelta(days=18), is_active=True, is_demo=True, terms="Demo offer.", source="demo_offer"),
        BankOffer(bank_name="ICICI", card_type="credit", title="10% instant discount with ICICI Bank", discount_type="percent", discount_value=D("10"), max_discount=D("2000"), min_transaction=D("8000"), expires_at=now + timedelta(days=25), is_active=True, is_demo=True, terms="Demo offer.", source="demo_offer"),
        BankOffer(bank_name="Axis", card_type="debit", title="5% debit card discount", discount_type="percent", discount_value=D("5"), max_discount=D("750"), min_transaction=D("2000"), expires_at=now + timedelta(days=10), is_active=True, is_demo=True, terms="Demo offer.", source="demo_offer"),
        BankOffer(bank_name="Kotak", card_type="credit", title="Flat Rs 1,500 off with Kotak credit cards", discount_type="flat", discount_value=D("1500"), min_transaction=D("15000"), expires_at=now + timedelta(days=30), is_active=True, is_demo=True, terms="Demo offer.", source="demo_offer"),
        BankOffer(bank_name="HDFC", card_type="credit", title="No-cost EMI + 10% cashback", discount_type="percent", discount_value=D("10"), max_discount=D("2500"), min_transaction=D("10000"), is_cashback=True, emi_only=True, no_cost_emi=True, min_tenure_months=6, expires_at=now + timedelta(days=15), is_active=True, is_demo=True, terms="Demo offer. Cashback is not an immediate discount.", source="demo_offer"),
    ]
    db.add_all(bank_offers)

    campaigns = [
        SaleCampaign(slug="amazon-great-indian-festival", retailer_id=retailers["amazon"].id, name="Amazon Great Indian Festival", description="Demo campaign window for price intelligence testing.", starts_at=now - timedelta(days=3), ends_at=now + timedelta(days=9), is_active=True, is_verified=False, is_demo=True),
        SaleCampaign(slug="flipkart-big-billion-days", retailer_id=retailers["flipkart"].id, name="Flipkart Big Billion Days", description="Demo campaign window for price intelligence testing.", starts_at=now - timedelta(days=1), ends_at=now + timedelta(days=7), is_active=True, is_verified=False, is_demo=True),
        SaleCampaign(slug="republic-day-sale", retailer_id=None, name="Republic Day Sale", description="Upcoming demo multi-retailer sale event.", starts_at=now + timedelta(days=35), ends_at=now + timedelta(days=42), is_active=True, is_verified=False, is_demo=True),
    ]
    db.add_all(campaigns)

    for retailer in retailers.values():
        db.add(
            ReturnPolicy(
                retailer_id=retailer.id,
                category=None,
                return_days=7 if retailer.slug in {"flipkart", "amazon"} else 10,
                replacement_allowed=True,
                refund_policy="Refund to original payment method after inspection (demo policy).",
                conditions="Original packaging, accessories and invoice required. Demo policy only.",
                source_url=retailer.website,
                is_demo=True,
            )
        )

    seller = MarketplaceSeller(
        user_id=seller_user.id,
        display_name="Demo Coupon Seller",
        bio="Approved demo seller for coupon marketplace sandbox testing.",
        status="approved",
        rating=D("4.5"),
        total_sales=12,
    )
    db.add(seller)
    db.flush()
    db.add_all(
        [
            MarketplaceListing(
                seller_id=seller.id,
                title="Rs 500 e-commerce gift card (demo)",
                description="Demo listing for sandbox marketplace testing. Transfer permitted only in sandbox.",
                category="gift_card",
                price=D("350"),
                proof_url="https://example.com/demo-proof",
                expires_at=now + timedelta(days=20),
                status="approved",
                is_transfer_allowed=True,
            ),
            MarketplaceListing(
                seller_id=seller.id,
                title="Electronics coupon bundle (demo)",
                description="Pending demo listing awaiting admin approval.",
                category="coupon",
                price=D("199"),
                proof_url="https://example.com/demo-proof-2",
                expires_at=now + timedelta(days=10),
                status="pending",
                is_transfer_allowed=False,
            ),
        ]
    )

    report = CommunityReport(
        user_id=demo.id,
        report_type="price",
        product_id=products[0].id,
        listing_id=listing_records[0].id,
        retailer_id=retailers["amazon"].id,
        claimed_value="₹68,499",
        evidence_url="https://example.com/community-evidence",
        description="Demo community price report awaiting moderation.",
        status="pending",
    )
    db.add(report)
    db.flush()
    db.add(CommunityVote(report_id=report.id, user_id=seller_user.id, vote=1))

    purchase_listing = listing_records[2] if len(listing_records) > 2 else listing_records[0]
    purchase = Purchase(
        user_id=demo.id,
        listing_id=purchase_listing.id,
        product_id=purchase_listing.product_id,
        retailer_id=purchase_listing.retailer_id,
        price=purchase_listing.price,
        quantity=1,
        purchased_at=now - timedelta(days=45),
    )
    db.add(purchase)
    db.flush()
    db.add(
        WarrantyRecord(
            user_id=demo.id,
            purchase_id=purchase.id,
            product_id=purchase_listing.product_id,
            variant_id=purchase_listing.variant_id,
            retailer_id=purchase_listing.retailer_id,
            warranty_months=12,
            provider="Manufacturer (demo)",
            coverage="Demo standard manufacturer warranty.",
            source_url="https://example.com/warranty",
            is_demo=True,
        )
    )
    db.add(
        RecurringPurchase(
            user_id=demo.id,
            product_id=products[9].id,
            label="Kitchen essentials",
            interval_days=90,
            last_purchased_at=now - timedelta(days=30),
            last_price=D("8999"),
            next_reminder_at=now + timedelta(days=60),
            active=True,
        )
    )
    db.add(Watchlist(user_id=demo.id, product_id=products[0].id, list_type="saved"))
    db.add(Watchlist(user_id=demo.id, product_id=products[2].id, list_type="watchlist"))
    db.add_all(
        [
            ShoppingMemory(
                user_id=demo.id,
                memory_type="budget",
                memory_key="smartphone_budget",
                memory_value="Under Rs 75,000 unless the deal score is excellent.",
                context={"category": "Smartphones"},
                source="explicit",
                consent=True,
            ),
            ShoppingMemory(
                user_id=demo.id,
                memory_type="brand",
                memory_key="preferred_brands",
                memory_value="Apple, Samsung, Lenovo",
                context={"note": "Demo explicit preference used by Copilot context."},
                source="explicit",
                consent=True,
            ),
        ]
    )

    db.commit()
