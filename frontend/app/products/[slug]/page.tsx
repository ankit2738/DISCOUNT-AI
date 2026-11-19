"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  BellRing,
  CheckCircle2,
  Copy,
  ExternalLink,
  Heart,
  Loader2,
  ShieldAlert,
  Sparkles,
  TrendingDown,
} from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { PriceChart } from "@/components/price-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/api";
import { formatINR } from "@/lib/format";
import type {
  BuyOrWait,
  Comparison,
  ComparisonListing,
  DealScore,
  FakeDiscount,
  PriceHistory,
  ProductDetail,
} from "@/lib/types";

type Warranty = {
  return_policies: {
    retailer: { name: string };
    return_days: number;
    replacement_allowed: boolean;
    refund_policy: string;
    conditions: string;
    is_demo: boolean;
  }[];
  warranty_records: { id: number; warranty_months: number; provider: string; coverage: string; is_demo: boolean }[];
  note: string;
};

export default function ProductPage() {
  const params = useParams<{ slug: string }>();
  const { user, token } = useAuth();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [variantId, setVariantId] = useState<number | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [historyDays, setHistoryDays] = useState(90);
  const [history, setHistory] = useState<PriceHistory | null>(null);
  const [dealScore, setDealScore] = useState<DealScore | null>(null);
  const [fakeDiscount, setFakeDiscount] = useState<FakeDiscount | null>(null);
  const [buyOrWait, setBuyOrWait] = useState<BuyOrWait | null>(null);
  const [warranty, setWarranty] = useState<Warranty | null>(null);
  const [targetPrice, setTargetPrice] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    apiFetch<ProductDetail>(`/api/products/slug/${params.slug}`, { signal: controller.signal })
      .then((payload) => {
        setProduct(payload);
        const firstListingVariant = payload.listings?.[0]?.variant_id ?? payload.variants[0]?.id ?? null;
        setVariantId(firstListingVariant);
      })
      .catch((fetchError) => {
        if (!controller.signal.aborted) setError(fetchError instanceof Error ? fetchError.message : "Could not load product");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [params.slug]);

  useEffect(() => {
    if (!product || !variantId) return;
    const controller = new AbortController();
    setComparison(null);
    setCompareError(null);
    apiFetch<Comparison>(`/api/comparison?product_id=${product.id}&variant_id=${variantId}`, { signal: controller.signal })
      .then(setComparison)
      .catch((fetchError) => {
        if (!controller.signal.aborted) setCompareError(fetchError instanceof Error ? fetchError.message : "Could not compare this variant");
      });
    return () => controller.abort();
  }, [product, variantId]);

  const cheapest: ComparisonListing | null = comparison?.listings[0] ?? null;

  useEffect(() => {
    if (!cheapest) return;
    const controller = new AbortController();
    const listingId = cheapest.id;
    setHistory(null);
    setDealScore(null);
    setFakeDiscount(null);
    setBuyOrWait(null);
    apiFetch<PriceHistory>(`/api/price-history?listing_id=${listingId}&days=${historyDays}`, { signal: controller.signal })
      .then(setHistory)
      .catch(() => undefined);
    apiFetch<DealScore>(`/api/deal-score?listing_id=${listingId}`, { signal: controller.signal })
      .then(setDealScore)
      .catch(() => undefined);
    apiFetch<FakeDiscount>(`/api/fake-discount?listing_id=${listingId}`, { signal: controller.signal })
      .then(setFakeDiscount)
      .catch(() => undefined);
    apiFetch<BuyOrWait>(`/api/buy-or-wait?listing_id=${listingId}`, { signal: controller.signal })
      .then(setBuyOrWait)
      .catch(() => undefined);
    setTargetPrice(String(Math.round((cheapest.effective.effective_price * 0.97) / 10) * 10));
    return () => controller.abort();
  }, [cheapest, historyDays]);

  useEffect(() => {
    if (!product) return;
    const controller = new AbortController();
    apiFetch<Warranty>(`/api/warranty/compare?product_id=${product.id}`, { signal: controller.signal })
      .then(setWarranty)
      .catch(() => undefined);
    return () => controller.abort();
  }, [product]);

  const groupedSpecs = useMemo(() => {
    const groups = new Map<string, { name: string; value: string }[]>();
    for (const spec of product?.specifications ?? []) {
      const list = groups.get(spec.group) ?? [];
      list.push({ name: spec.name, value: spec.value });
      groups.set(spec.group, list);
    }
    return Array.from(groups.entries());
  }, [product]);

  const requireLogin = useCallback(() => {
    if (!user || !token) {
      setNotice("Log in to use saved products and price alerts.");
      return false;
    }
    return true;
  }, [user, token]);

  async function saveProduct(listType: "saved" | "wishlist") {
    if (!product || !requireLogin()) return;
    setActionLoading(true);
    try {
      const response = await apiFetch<{ status: string }>("/api/watchlist", {
        method: "POST",
        token,
        body: { product_id: product.id, list_type: listType, notes: "" },
      });
      setNotice(response.status === "existing" ? "Already in your saved list." : "Added to your saved products.");
    } catch (actionError) {
      setNotice(actionError instanceof Error ? actionError.message : "Could not save product");
    } finally {
      setActionLoading(false);
    }
  }

  async function createAlert() {
    if (!product || !requireLogin()) return;
    const target = Number(targetPrice);
    if (!target || target <= 0) {
      setNotice("Enter a valid target price.");
      return;
    }
    setActionLoading(true);
    try {
      await apiFetch("/api/alerts", {
        method: "POST",
        token,
        body: {
          product_id: product.id,
          variant_id: variantId,
          target_price: target,
          channel: "in_app",
        },
      });
      setNotice(`Price alert created for ${formatINR(target)}. In-app delivery is configured; external channels require credentials.`);
    } catch (actionError) {
      setNotice(actionError instanceof Error ? actionError.message : "Could not create alert");
    } finally {
      setActionLoading(false);
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setNotice(`Copied ${code}. Confirm eligibility at checkout.`);
    } catch {
      setNotice("Clipboard access denied. Copy the code manually.");
    }
  }

  async function addToCart(listingId: number) {
    if (!requireLogin()) return;
    setActionLoading(true);
    try {
      await apiFetch("/api/cart/items", {
        method: "POST",
        token,
        body: { listing_id: listingId, quantity: 1 },
      });
      setNotice("Added to your smart cart.");
    } catch (cartError) {
      setNotice(cartError instanceof Error ? cartError.message : "Could not add to cart");
    } finally {
      setActionLoading(false);
    }
  }

  async function trackPurchase(listingId: number) {
    if (!requireLogin()) return;
    if (!window.confirm("Record this as a purchase you made? This starts post-purchase price tracking; no payment is processed.")) return;
    setActionLoading(true);
    try {
      await apiFetch("/api/purchases", {
        method: "POST",
        token,
        body: { listing_id: listingId, quantity: 1 },
      });
      setNotice("Purchase recorded. Open Dashboard → Purchases to track later prices.");
    } catch (purchaseError) {
      setNotice(purchaseError instanceof Error ? purchaseError.message : "Could not record purchase");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return <main className="mx-auto max-w-7xl px-4 py-16"><p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading product...</p></main>;
  }

  if (error || !product) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-2xl font-bold">Product unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error ?? "Product not found."}</p>
        <Button asChild className="mt-4"><Link href="/search">Back to search</Link></Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <nav className="mb-4 text-sm text-muted-foreground">
        <Link href="/search" className="hover:text-foreground">Search</Link> / {product.category} / <span className="text-foreground">{product.name}</span>
      </nav>

      {notice && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border bg-card p-3 text-sm">
          <span>{notice}</span>
          <button type="button" className="text-xs text-muted-foreground" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}

      {compareError && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Product details loaded, but exact-variant comparison is temporarily unavailable: {compareError}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="product-placeholder flex min-h-72 items-center justify-center rounded-2xl border p-8">
          <div className="text-center">
            <p className="text-7xl font-black text-teal-800/20">{product.brand.charAt(0)}</p>
            <p className="mt-2 text-sm font-medium text-teal-900/70">{product.brand} {product.model}</p>
            <p className="mt-1 text-xs text-teal-900/50">Product image placeholder · demo catalogue</p>
          </div>
        </div>

        <div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">{product.category}</Badge>
            <Badge variant="outline">{product.brand}</Badge>
            {product.is_demo && <Badge variant="warning">Demo data</Badge>}
            {comparison?.listings.length ? <Badge variant="success">{comparison.listings.length} exact-variant stores</Badge> : null}
          </div>
          <h1 className="mt-2 text-3xl font-bold">{product.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Model {product.model}</p>

          <div className="mt-4 rounded-xl border bg-card p-4">
            {cheapest ? (
              <>
                <p className="text-xs text-muted-foreground">Best current effective price at {cheapest.retailer?.name}</p>
                <div className="mt-1 flex flex-wrap items-end gap-2">
                  <span className="text-3xl font-black text-primary">{formatINR(cheapest.effective.effective_price)}</span>
                  {cheapest.price > cheapest.effective.effective_price && (
                    <span className="pb-1 text-sm text-muted-foreground line-through">{formatINR(cheapest.price)}</span>
                  )}
                  <span className="pb-1 text-xs text-muted-foreground">
                    includes delivery {formatINR(cheapest.effective.delivery_charge)}
                    {cheapest.effective.coupon_discount > 0 ? ` and coupon savings` : ""}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {cheapest.variant?.name} · {cheapest.availability.replaceAll("_", " ")} · verified {new Date(cheapest.verified_at).toLocaleString("en-IN")}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No exact-variant listing available for this variant.</p>
            )}

            <div className="mt-3">
              <p className="text-xs font-medium text-muted-foreground">Choose exact variant</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {product.variants.map((variant) => (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => setVariantId(variant.id)}
                    className={
                      variantId === variant.id
                        ? "rounded-lg border border-primary bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"
                        : "rounded-lg border px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/50"
                    }
                  >
                    {variant.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void saveProduct("saved")} disabled={actionLoading}>
                <Heart className="mr-1 h-4 w-4" /> Save
              </Button>
              <Button variant="outline" onClick={() => void saveProduct("wishlist")} disabled={actionLoading}>
                Add to wishlist
              </Button>
              {comparison && (
                <Button asChild>
                  <Link href={`/compare?product=${product.id}&variant=${variantId}`}>
                    Open comparison
                  </Link>
                </Button>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-xl border bg-card p-4">
            <p className="flex items-center gap-2 text-sm font-medium"><BellRing className="h-4 w-4" /> Create a price alert</p>
            <div className="mt-2 flex gap-2">
              <Input
                type="number"
                min={1}
                value={targetPrice}
                onChange={(event) => setTargetPrice(event.target.value)}
                aria-label="Target price"
              />
              <Button onClick={() => void createAlert()} disabled={actionLoading}>Create alert</Button>
            </div>
            {!user && <p className="mt-1 text-xs text-muted-foreground"><Link href="/login?next=/products" className="text-primary hover:underline">Log in</Link> to create an alert.</p>}
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Retailer links may be affiliate links. Ranking is independent of commission. All seeded prices are demo records; verify on the retailer site.
          </p>
        </div>
      </div>

      <Tabs defaultValue="compare" className="mt-8">
        <TabsList>
          <TabsTrigger value="compare">Compare stores</TabsTrigger>
          <TabsTrigger value="intelligence">Intelligence</TabsTrigger>
          <TabsTrigger value="history">Price history</TabsTrigger>
          <TabsTrigger value="offers">Coupons & bank offers</TabsTrigger>
          <TabsTrigger value="specs">Specifications</TabsTrigger>
          <TabsTrigger value="policy">Warranty & returns</TabsTrigger>
          <TabsTrigger value="alternatives">Alternatives</TabsTrigger>
        </TabsList>

        <TabsContent value="compare">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Exact-variant retailer comparison</CardTitle>
              <p className="text-sm text-muted-foreground">
                {comparison ? `${comparison.variant.name} · ${comparison.listings.length} retailers · effective price includes coupon and delivery where available.` : "Loading exact-variant comparison..."}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {comparison?.listings.map((listing) => (
                <div key={listing.id} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="font-semibold">{listing.retailer?.name}</p>
                      {listing.is_cheapest_effective && <Badge variant="success">Best effective price</Badge>}
                      {listing.is_demo && <Badge variant="warning">Demo</Badge>}
                      <Badge variant="secondary">{listing.availability.replaceAll("_", " ")}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      List {formatINR(listing.price)} · delivery {formatINR(listing.delivery_charge)}
                      {listing.effective.coupon ? ` · coupon ${listing.effective.coupon.code} (−${formatINR(listing.effective.coupon_discount)})` : ""}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Seller {listing.seller_name} · source {listing.source} · checked {new Date(listing.last_checked_at).toLocaleString("en-IN")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-primary">{formatINR(listing.effective.effective_price)}</p>
                    <div className="mt-1 flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => void addToCart(listing.id)} disabled={actionLoading}>
                        Add to cart
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void trackPurchase(listing.id)} disabled={actionLoading}>
                        Track purchase
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <a href={`/api/affiliate/click/${listing.id}?source_page=product_detail&session_id=${encodeURIComponent(comparison?.comparison_session_id ?? "")}`} target="_blank" rel="noopener noreferrer nofollow sponsored">
                          Visit retailer <ExternalLink className="ml-1 h-3 w-3" />
                        </a>
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {comparison && comparison.listings.length === 0 && <p className="text-sm text-muted-foreground">No listings for this variant.</p>}
              <p className="text-xs text-muted-foreground">{comparison?.disclaimer}</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="intelligence">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4" /> Deal Score</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {dealScore ? (
                  <>
                    <p className="text-4xl font-black text-primary">{dealScore.score}<span className="text-base font-normal text-muted-foreground">/100</span></p>
                    <div className="flex gap-1.5"><Badge>{dealScore.grade}</Badge><Badge variant="secondary">Confidence {Math.round(dealScore.confidence * 100)}%</Badge></div>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {dealScore.explanation.map((line) => <li key={line}>• {line}</li>)}
                    </ul>
                    {dealScore.is_demo && <p className="text-[11px] text-amber-700">Computed from demo history.</p>}
                  </>
                ) : <p className="text-sm text-muted-foreground">Score unavailable.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldAlert className="h-4 w-4" /> Fake-discount check</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {fakeDiscount ? (
                  <>
                    <p className="text-lg font-bold">{fakeDiscount.risk_level} risk · {fakeDiscount.risk_score}/100</p>
                    <p className="text-sm text-muted-foreground">{fakeDiscount.summary}</p>
                    <p className="text-xs text-muted-foreground">Claimed MRP {formatINR(fakeDiscount.claimed_mrp)} · {fakeDiscount.claimed_discount_pct.toFixed(1)}% claimed discount</p>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {fakeDiscount.evidence.map((item) => <li key={item.signal}>• {item.detail}</li>)}
                    </ul>
                    <p className="text-[11px] text-muted-foreground">{fakeDiscount.disclaimer}</p>
                  </>
                ) : <p className="text-sm text-muted-foreground">Analysis unavailable.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><TrendingDown className="h-4 w-4" /> Buy now or wait</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {buyOrWait ? (
                  <>
                    <p className="text-2xl font-bold capitalize">{buyOrWait.recommendation}</p>
                    <p className="text-xs text-muted-foreground">Confidence {Math.round(buyOrWait.confidence * 100)}% · current {formatINR(buyOrWait.current_effective_price)}</p>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {buyOrWait.reasons.map((reason) => <li key={reason}>• {reason}</li>)}
                    </ul>
                    <p className="text-[11px] text-muted-foreground">Historical range {formatINR(buyOrWait.historical.min)}–{formatINR(buyOrWait.historical.max)} over {buyOrWait.historical.days_covered} days.</p>
                    {buyOrWait.active_campaign && <Badge variant="success">Active: {buyOrWait.active_campaign}</Badge>}
                  </>
                ) : <p className="text-sm text-muted-foreground">Recommendation unavailable.</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Tracked price history</CardTitle>
                <p className="text-sm text-muted-foreground">Cheapest exact-variant listing{cheapest ? ` at ${cheapest.retailer?.name}` : ""}.</p>
              </div>
              <select
                aria-label="History range"
                className="h-9 rounded-lg border bg-card px-2 text-sm"
                value={historyDays}
                onChange={(event) => setHistoryDays(Number(event.target.value))}
              >
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={180}>180 days</option>
                <option value={365}>1 year</option>
              </select>
            </CardHeader>
            <CardContent>
              {history ? (
                <>
                  <PriceChart points={history.points} />
                  <div className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
                    <div><p className="text-xs text-muted-foreground">Current</p><p className="font-semibold">{formatINR(history.latest)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Range low</p><p className="font-semibold text-emerald-700">{formatINR(history.min)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Range high</p><p className="font-semibold">{formatINR(history.max)}</p></div>
                    <div><p className="text-xs text-muted-foreground">All-time low</p><p className="font-semibold">{formatINR(history.historical_min_all_time)}</p></div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">{history.disclaimer} Completeness {Math.round(history.completeness * 100)}%.</p>
                </>
              ) : <p className="py-8 text-center text-sm text-muted-foreground">Loading history...</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="offers">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Coupons</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {(comparison?.listings.flatMap((listing) => listing.coupons) ?? []).filter((coupon, index, list) => list.findIndex((item) => item.id === coupon.id) === index).map((coupon) => (
                  <div key={coupon.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <code className="font-semibold">{coupon.code}</code>
                      <div className="flex gap-1.5">
                        {coupon.is_verified && <Badge variant="success">Verified record</Badge>}
                        {coupon.is_demo && <Badge variant="warning">Demo</Badge>}
                        <Button size="sm" variant="ghost" onClick={() => void copyCode(coupon.code)}><Copy className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                    <p className="mt-1 text-sm">{coupon.title}</p>
                    <p className="text-xs text-muted-foreground">{coupon.description}</p>
                  </div>
                ))}
                {(!comparison || comparison.listings.every((listing) => listing.coupons.length === 0)) && (
                  <p className="text-sm text-muted-foreground">No verified coupon records for this variant.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Eligible bank offers</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {(comparison?.listings[0]?.bank_offers ?? []).map((offer) => (
                  <div key={offer.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold">{offer.bank_name}</p>
                      <Badge variant="outline">{offer.card_type}</Badge>
                    </div>
                    <p className="text-sm">{offer.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Estimated {formatINR(offer.estimated_discount)} off · payable {formatINR(offer.payable_if_selected)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{offer.terms}</p>
                  </div>
                ))}
                {(!comparison || comparison.listings[0]?.bank_offers.length === 0) && (
                  <p className="text-sm text-muted-foreground">No eligible bank offers recorded.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="specs">
          <Card>
            <CardHeader><CardTitle className="text-base">Specifications</CardTitle></CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-2">
              {groupedSpecs.map(([group, specs]) => (
                <div key={group}>
                  <h3 className="mb-2 text-sm font-semibold">{group}</h3>
                  <dl className="space-y-1.5">
                    {specs.map((spec) => (
                      <div key={spec.name} className="flex justify-between gap-3 text-sm">
                        <dt className="text-muted-foreground">{spec.name}</dt>
                        <dd className="text-right font-medium">{spec.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
              {groupedSpecs.length === 0 && <p className="text-sm text-muted-foreground">No specifications recorded.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="policy">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Return policies</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {warranty?.return_policies.map((policy) => (
                  <div key={policy.retailer.name} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between"><p className="font-semibold">{policy.retailer.name}</p><Badge variant="secondary">{policy.return_days} days</Badge></div>
                    <p className="mt-1 text-xs text-muted-foreground">{policy.refund_policy}</p>
                    <p className="text-xs text-muted-foreground">{policy.conditions}</p>
                  </div>
                ))}
                {(!warranty || warranty.return_policies.length === 0) && <p className="text-sm text-muted-foreground">No return policies recorded.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Warranty records</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {warranty?.warranty_records.map((record) => (
                  <div key={record.id} className="rounded-lg border p-3 text-sm">
                    <p className="font-semibold">{record.warranty_months} months · {record.provider}</p>
                    <p className="text-xs text-muted-foreground">{record.coverage}</p>
                  </div>
                ))}
                {(!warranty || warranty.warranty_records.length === 0) && <p className="text-sm text-muted-foreground">No warranty records.</p>}
              </CardContent>
            </Card>
          </div>
          {warranty && <p className="mt-3 text-xs text-muted-foreground">{warranty.note}</p>}
        </TabsContent>

        <TabsContent value="alternatives">
          <div className="grid gap-4 md:grid-cols-3">
            {product.alternatives.alternatives.map((alternative) => (
              <Card key={alternative.product_id}>
                <CardHeader className="pb-2">
                  <Badge variant="secondary">Value score {alternative.value_score}</Badge>
                  <CardTitle className="text-base"><Link href={`/products/${alternative.slug}`} className="hover:text-primary">{alternative.name}</Link></CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-lg font-bold text-primary">{formatINR(alternative.lowest_effective_price)}</p>
                  <ul className="space-y-1 text-xs text-muted-foreground">{alternative.reasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul>
                  {alternative.is_demo && <Badge variant="warning">Demo</Badge>}
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{product.alternatives.methodology}</p>
        </TabsContent>
      </Tabs>

      <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5" /> Product view is recorded for owner-only analytics. No personal data is sold.
      </div>
    </main>
  );
}
