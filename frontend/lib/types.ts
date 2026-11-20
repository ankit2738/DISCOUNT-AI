export type Retailer = {
  id: number;
  slug: string;
  name: string;
  website: string;
  integration_status: string;
  is_demo: boolean;
  affiliate_disclosure: string;
  terms_note: string;
};

export type Variant = {
  id: number;
  sku: string;
  name: string;
  attributes: Record<string, string>;
  is_demo: boolean;
};

export type Coupon = {
  id: number;
  code: string;
  title: string;
  description: string;
  retailer_id: number;
  product_id: number | null;
  discount_type: string;
  discount_value: number;
  max_discount: number | null;
  min_order: number;
  expires_at: string | null;
  is_verified: boolean;
  verification_source: string;
  is_demo: boolean;
  is_stackable: boolean;
  terms: string;
  retailer?: Retailer | null;
};

export type BankOffer = {
  id: number;
  bank_name: string;
  card_type: string;
  title: string;
  discount_type: string;
  discount_value: number;
  max_discount: number | null;
  min_transaction: number;
  is_cashback: boolean;
  emi_only: boolean;
  no_cost_emi: boolean;
  min_tenure_months: number | null;
  retailer_id: number | null;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  is_demo: boolean;
  terms: string;
  source: string;
  eligible?: boolean;
  eligibility_note?: string;
  estimated_discount?: number;
  payable_if_selected?: number;
  cashback_note?: string | null;
};

export type EffectivePrice = {
  price: number;
  delivery_charge: number;
  coupon: Coupon | null;
  coupon_discount: number;
  effective_price: number;
  best_bank_offer: (BankOffer & { estimated_discount: number; final_price: number }) | null;
  verified: boolean;
  is_demo: boolean;
  source: string;
};

export type Listing = {
  id: number;
  product_id: number;
  variant_id: number;
  variant: Variant | null;
  retailer: Retailer | null;
  title: string;
  url: string;
  price: number;
  mrp: number;
  delivery_charge: number;
  availability: string;
  rating: number | null;
  seller_name: string;
  source: string;
  is_demo: boolean;
  verified_at: string;
  last_checked_at: string;
  effective?: EffectivePrice;
  is_cheapest_effective?: boolean;
  exact_variant?: boolean;
  coupons?: Coupon[];
  bank_offers?: BankOffer[];
  product_name?: string | null;
};

export type Product = {
  id: number;
  slug: string;
  name: string;
  brand: string;
  model: string;
  category: string;
  description: string;
  specs: Record<string, string>;
  image_url: string | null;
  is_demo: boolean;
  variants: Variant[];
  listings?: Listing[];
  lowest_price?: number;
  lowest_effective_price?: number;
  retailer_count?: number;
  listing_count?: number;
  matched_variant_ids?: number[];
  exact_variant_match?: boolean;
};

export type PricePoint = {
  date: string;
  price: number;
  mrp: number;
  is_demo: boolean;
};

export type PriceHistory = {
  listing_id: number;
  days_requested: number;
  points: PricePoint[];
  min: number | null;
  max: number | null;
  average: number | null;
  latest: number | null;
  historical_min_all_time: number | null;
  historical_max_all_time: number | null;
  average_all_time: number | null;
  days_covered: number;
  completeness: number;
  is_demo: boolean;
  last_verified_at: string;
  source: string;
  disclaimer: string;
};

export type DealScore = {
  listing_id: number;
  score: number;
  grade: string;
  confidence: number;
  factors: Record<string, unknown>;
  explanation: string[];
  evidence: { evidence_type: string; description: string; value: string | null; weight: number }[];
  computed_at: string;
  is_demo: boolean;
};

export type FakeDiscount = {
  listing_id: number;
  risk_score: number;
  risk_level: string;
  claimed_mrp: number;
  claimed_discount_pct: number;
  historical_min_price?: number;
  historical_max_mrp?: number;
  evidence: { signal: string; detail: string; weight?: number }[];
  summary: string;
  disclaimer: string;
  is_demo: boolean;
};

export type BuyOrWait = {
  listing_id: number;
  recommendation: "buy" | "wait" | "monitor";
  confidence: number;
  current_effective_price: number;
  historical: { min: number; max: number; average: number; days_covered: number };
  reasons: string[];
  limitations: string[];
  active_campaign: string | null;
  upcoming_campaign: string | null;
  is_demo: boolean;
};

export type ComparisonListing = Listing & {
  effective: EffectivePrice;
  coupons: Coupon[];
  bank_offers: (BankOffer & {
    eligible: boolean;
    eligibility_note: string;
    estimated_discount: number;
    payable_if_selected: number;
    cashback_note: string | null;
  })[];
  is_cheapest_effective: boolean;
  exact_variant: boolean;
};

export type Comparison = {
  product: {
    id: number;
    slug: string;
    name: string;
    brand: string;
    model: string;
    category: string;
    is_demo: boolean;
  };
  variant: Variant;
  variants: Variant[];
  listings: ComparisonListing[];
  lowest_verified_effective_price: number;
  cheapest_listing_id: number;
  comparison_session_id: string;
  verified_timestamp: string;
  data_sources: string[];
  disclaimer: string;
};

export type DealsResponse = {
  items: {
    listing: Listing;
    product: {
      id: number;
      slug: string;
      name: string;
      brand: string;
      category: string;
      variants: Variant[];
    };
    effective: EffectivePrice;
    history_average: number | null;
    history_min: number | null;
    drop_from_average_pct: number;
    deal_score: { score: number; grade: string; confidence: number };
    is_demo: boolean;
  }[];
  total: number;
  methodology: string;
  is_demo: boolean;
};

export type SearchResponse = {
  items: Product[];
  total: number;
  limit: number;
  offset: number;
  query: string;
};

export type ProductDetail = Product & {
  listings: Listing[];
  specifications: {
    group: string;
    name: string;
    value: string;
    source: string;
    verified_at: string;
    is_demo: boolean;
  }[];
  product_coupons: Coupon[];
  price_range: { min: number; max: number };
  alternatives: Alternatives;
};

export type Alternative = {
  product_id: number;
  slug: string;
  name: string;
  brand: string;
  category: string;
  lowest_price: number;
  lowest_effective_price: number;
  rating: number | null;
  specs: Record<string, string>;
  value_score: number;
  reasons: string[];
  is_demo: boolean;
};

export type Alternatives = {
  product_id: number;
  reference_price?: number;
  alternatives: Alternative[];
  methodology: string;
};

export type User = {
  id: number;
  email: string;
  full_name: string;
  phone: string | null;
  role: string;
  is_verified: boolean;
  profile: {
    city: string | null;
    state: string | null;
    pincode: string | null;
    shopping_persona: string | null;
  };
  preferences: {
    preferred_brands: string[];
    categories: string[];
    preferred_retailers: string[];
    budget_min: number | null;
    budget_max: number | null;
    personalization_enabled: boolean;
    notify_in_app: boolean;
    notify_email: boolean;
    notify_push: boolean;
    notify_telegram: boolean;
    notify_whatsapp: boolean;
    telegram_configured: boolean;
    whatsapp_configured: boolean;
    consent_analytics: boolean;
    consent_marketing: boolean;
  };
};

export type CouponItem = Coupon & { expired?: boolean; retailer?: Retailer | null };

export type Notification = {
  id: number;
  type: string;
  title: string;
  body: string;
  channel: string;
  status: string;
  error: string | null;
  read: boolean;
  created_at: string;
};

export type AppNotification = Notification;

export type Campaign = {
  id: number;
  slug: string;
  name: string;
  description: string;
  retailer_id: number | null;
  starts_at: string;
  ends_at: string;
  state: string;
  is_active: boolean;
  is_verified: boolean;
  is_demo: boolean;
  authenticity_note: string;
};

export type Alert = {
  id: number;
  product_id: number;
  variant_id: number | null;
  target_price: number;
  status: string;
  channel: string;
  created_at: string;
};

export type WatchlistItem = {
  id: number;
  list_type: string;
  notes: string;
  product: Product;
  lowest_price: number | null;
  lowest_effective_price: number | null;
  created_at: string;
};

export type CartPayload = {
  id: number;
  name: string;
  items: {
    id: number;
    quantity: number;
    listing: Listing;
    effective: EffectivePrice;
    line_total: number;
    line_delivery?: number;
  }[];
  item_count: number;
  subtotal: number;
  delivery_total?: number;
  pre_offer_total?: number;
  is_demo_pricing: boolean;
};

export type OptimizeResponse = {
  items: {
    product_id: number;
    variant_id: number;
    quantity: number;
    original_listing_id: number;
    original_listing: Listing;
    recommended_listing_id: number;
    recommended_listing: Listing;
    unit_effective_price: number;
    line_effective_total?: number;
    line_merchandise_total?: number;
    line_delivery_total?: number;
    line_pre_offer_total?: number;
    coupon?: Coupon | null;
    coupon_already_applied?: boolean;
    switched: boolean;
  }[];
  stores: {
    retailer_id: number;
    items: OptimizeResponse["items"];
    product_subtotal: number;
    delivery_and_coupon_subtotal: number;
    applied_coupon: Coupon | null;
    coupon_discount: number;
    applied_bank_offer: BankOffer | null;
    bank_discount: number;
    cashback: number;
    store_payable: number;
  }[];
  original_total: number;
  optimized_total: number;
  savings: number;
  cashback_total: number;
  multi_store: boolean;
  warnings: string[];
  methodology: string;
  disclaimer: string;
};

export type ChatResponse = {
  provider: string;
  grounded: boolean;
  reply: string;
  recommendations: {
    product_id: number;
    name: string;
    listing_id: number;
    effective_price: number;
    variant: string;
    coupon: string | null;
    is_demo: boolean;
  }[];
  limitations: string[];
  detected_budget: number | null;
  detected_category: string | null;
  session_id?: string;
  conversation_id?: number | null;
  personal_context?: Record<string, unknown>;
  persistence_note?: string;
};

export type ShoppingMemory = {
  id: number;
  memory_type: "preference" | "budget" | "category" | "brand" | "note" | "shopping_goal";
  memory_key: string;
  memory_value: string;
  context: Record<string, unknown>;
  source: string;
  consent: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MemoryContext = {
  memories: ShoppingMemory[];
  counts: {
    memory_entries: number;
    saved_products: number;
    active_alerts: number;
    purchases: number;
    recurring_purchases: number;
  };
  spend_tracked: number;
  consent_note: string;
};

export type RecurringPurchase = {
  id: number;
  product: Product | null;
  label: string;
  interval_days: number;
  last_purchased_at: string;
  last_price: number;
  current_lowest_price: number;
  savings_if_rebought: number;
  next_reminder_at: string | null;
  active: boolean;
};

export type AIConversation = {
  id: number;
  session_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type AIMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  meta: Record<string, unknown>;
  created_at: string;
};

export type MarketplaceOrder = {
  id: number;
  listing_id: number;
  listing_title: string | null;
  buyer_id: number;
  seller_id: number;
  amount: number;
  platform_fee?: number;
  seller_payout?: number;
  status: string;
  payment_provider: string;
  role?: "buyer" | "seller";
  redemption_status?: string;
  code_available?: boolean;
  refund_eligible?: boolean;
  refunded_at?: string | null;
  created_at: string;
};

export type SellerReputation = {
  score: number;
  rating: number | null;
  review_count: number;
  completed_sales: number;
  dispute_count: number;
  disputes_lost: number;
  is_verified: boolean;
  verification_note?: string | null;
};

export type MarketplaceSeller = {
  id: number;
  user_id: number;
  display_name: string;
  bio: string;
  status: string;
  rating: number | null;
  total_sales: number;
  is_verified?: boolean;
  review_count?: number;
  reputation?: SellerReputation;
  created_at?: string;
};

export type SellerReview = {
  id: number;
  order_id: number;
  rating: number;
  comment: string;
  created_at: string;
};

export type SellerWorkspace = {
  seller: MarketplaceSeller;
  listings: MarketplaceListing[];
  orders: MarketplaceOrder[];
  gross_sales_sandbox: number;
  platform_fees_sandbox: number;
  earnings_sandbox: number;
  refunded_orders: number;
  reviews?: SellerReview[];
  reports?: { id: number; listing_id: number; reason: string; status: string }[];
  note: string;
};

export type CouponWalletItem = {
  order_id: number;
  listing_id: number;
  title: string;
  retailer_id: number | null;
  coupon_value: number;
  paid: number;
  saving: number;
  code: string | null;
  masked_code: string | null;
  redemption_instructions: string;
  usage_restrictions: string;
  min_order: number;
  expires_at: string | null;
  expires_in_days: number | null;
  expiring_soon: boolean;
  redemption_status: string;
  order_status: string;
};

export type SavingsDashboard = {
  verified_savings: number;
  estimated_savings: number;
  coupons_purchased: number;
  coupons_redeemed: number;
  price_drops_detected: number;
  estimated_price_drops: number;
  successful_deal_discoveries: number;
  alerts_created: number;
  alerts_triggered: number;
  savings_by_retailer: { retailer: string; verified: number; estimated: number }[];
  monthly_history: { month: string; verified: number; estimated: number }[];
  definitions: { verified: string; estimated: string };
  checked_at: string;
};

export type RetailerOption = {
  id: number;
  name: string;
  slug: string;
};

export type MarketplaceDispute = {
  id: number;
  order_id: number;
  opened_by: number;
  reason: string;
  evidence_url: string | null;
  status: string;
  resolution: string | null;
  created_at: string;
  resolved_at: string | null;
};

export type AdminOverview = {
  counts: Record<string, number>;
  metrics: Record<string, unknown> & {
    primary_metric: {
      name: string;
      value_pct: number | null;
      cheaper_store_clicks: number;
      comparison_sessions: number;
      definition: string;
    };
  };
  demo_mode: boolean;
};

export type Purchase = {
  id: number;
  product: Product | null;
  listing_id: number;
  price: number;
  quantity: number;
  purchased_at: string;
  current_lowest_price: number | null;
  price_change: number | null;
  retailer_id: number;
};

export type MarketplaceListing = {
  id: number;
  seller_id: number;
  seller_name?: string | null;
  seller_reputation?: number | null;
  seller_verified?: boolean;
  title: string;
  description: string;
  category: string;
  price: number;
  coupon_value?: number;
  estimated_saving?: number;
  discount_percent?: number | null;
  min_order?: number;
  brand?: string;
  retailer_id?: number | null;
  retailer_name?: string | null;
  applicable_products?: string[];
  usage_restrictions?: string;
  redemption_instructions?: string;
  issuer_terms?: string;
  usage_status?: string;
  coupon_code_masked?: string | null;
  proof_url: string | null;
  expires_at: string | null;
  expired?: boolean;
  status: string;
  is_transfer_allowed: boolean;
  rejection_reason?: string;
  created_at: string;
};

export type CommunityReport = {
  id: number;
  report_type: string;
  status: string;
  product: { id: number; slug: string; name: string } | null;
  listing_id: number | null;
  retailer_id: number | null;
  coupon_id: number | null;
  claimed_value: string;
  evidence_url: string | null;
  description: string;
  vote_score: number;
  upvotes: number;
  downvotes: number;
  reporter_reputation: number;
  is_official: boolean;
  verification_label: string;
  created_at: string;
};

export type IntegrationStatus = {
  adapters: {
    slug: string;
    name: string;
    retailer_id: number | null;
    integration_status: string;
    live_ready: boolean;
    requires_credentials: string[];
    demo_data: boolean;
    note: string;
  }[];
  ai: { provider: string; external_configured: boolean; fallback: string };
  notifications: {
    telegram_configured: boolean;
    whatsapp_configured: boolean;
    email_provider: string;
  };
  payments: { provider: string; live: boolean; note: string };
  database: { url_scheme: string; production_recommended: string };
  demo_mode: boolean;
  honesty_note: string;
};
