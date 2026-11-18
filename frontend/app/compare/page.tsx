"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, BadgeCheck, ExternalLink, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch, buildQuery } from "@/lib/api";
import { formatINR } from "@/lib/format";
import type { Comparison } from "@/lib/types";

function CompareContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const productId = searchParams.get("product");
  const variantId = searchParams.get("variant");
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) {
      setError("Choose a product to compare.");
      return;
    }
    const controller = new AbortController();
    setComparison(null);
    setError(null);
    apiFetch<Comparison>(
      `/api/comparison${buildQuery({ product_id: productId, variant_id: variantId ?? undefined })}`,
      { signal: controller.signal },
    )
      .then(setComparison)
      .catch((fetchError) => {
        if (!controller.signal.aborted) setError(fetchError instanceof Error ? fetchError.message : "Comparison failed");
      });
    return () => controller.abort();
  }, [productId, variantId]);

  function chooseVariant(nextVariantId: number) {
    router.push(`/compare?product=${productId}&variant=${nextVariantId}`);
  }

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-2xl font-bold">Comparison unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <Button asChild className="mt-4"><Link href="/search">Back to search</Link></Button>
      </main>
    );
  }

  if (!comparison) {
    return <main className="mx-auto max-w-7xl px-4 py-16"><p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Building exact-variant comparison...</p></main>;
  }

  const highest = comparison.listings[comparison.listings.length - 1];
  const cheapest = comparison.listings[0];
  const savings = highest.effective.effective_price - cheapest.effective.effective_price;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <Link href={`/products/${comparison.product.slug}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Product details
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{comparison.product.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {comparison.product.brand} · {comparison.product.category} · exact variant {comparison.variant.name}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="warning">Demo listings</Badge>
          <Badge variant="secondary">Session {comparison.comparison_session_id.slice(0, 10)}</Badge>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Variant:</span>
        {comparison.variants.map((variant) => (
          <button
            key={variant.id}
            type="button"
            onClick={() => chooseVariant(variant.id)}
            className={
              variant.id === comparison.variant.id
                ? "rounded-lg border border-primary bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"
                : "rounded-lg border px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/50"
            }
          >
            {variant.name}
          </button>
        ))}
      </div>

      <Card className="mt-6 border-primary/30 bg-primary/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
          <div>
            <p className="text-sm text-muted-foreground">Cheapest exact-variant effective price</p>
            <p className="text-4xl font-black text-primary">{formatINR(comparison.lowest_verified_effective_price)}</p>
            <p className="mt-1 text-sm">at {cheapest.retailer?.name} · {cheapest.variant?.name}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Potential saving vs highest store</p>
            <p className="text-2xl font-bold text-emerald-700">{formatINR(savings)}</p>
            <p className="text-xs text-muted-foreground">Final price depends on eligible coupons and bank offers.</p>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {comparison.listings.map((listing) => (
          <Card key={listing.id} className={listing.is_cheapest_effective ? "border-primary" : undefined}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">{listing.retailer?.name}</CardTitle>
                <div className="flex gap-1.5">
                  {listing.is_cheapest_effective && <Badge variant="success"><BadgeCheck className="mr-1 h-3 w-3" /> Cheapest</Badge>}
                  <Badge variant={listing.availability === "in_stock" ? "success" : "destructive"}>{listing.availability.replaceAll("_", " ")}</Badge>
                  {listing.is_demo && <Badge variant="warning">Demo</Badge>}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Seller {listing.seller_name} · rating {listing.rating ?? "—"} · source {listing.source}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-2xl font-bold text-primary">{formatINR(listing.effective.effective_price)}</p>
                  <p className="text-xs text-muted-foreground">
                    List {formatINR(listing.price)} + delivery {formatINR(listing.delivery_charge)}
                  </p>
                </div>
                <div className="text-right text-xs">
                  {listing.effective.coupon ? (
                    <p className="text-emerald-700">Coupon {listing.effective.coupon.code}: −{formatINR(listing.effective.coupon_discount)}</p>
                  ) : (
                    <p className="text-muted-foreground">No coupon applied</p>
                  )}
                  <p className="text-muted-foreground">Effective {formatINR(listing.effective.effective_price)}</p>
                </div>
              </div>

              {listing.coupons.length > 0 && (
                <div>
                  <p className="text-xs font-medium">Coupons recorded for this retailer</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {listing.coupons.map((coupon) => (
                      <Badge key={coupon.id} variant="outline">{coupon.code}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {listing.bank_offers.length > 0 && (
                <div>
                  <p className="text-xs font-medium">Bank options</p>
                  <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                    {listing.bank_offers.slice(0, 3).map((offer) => (
                      <li key={offer.id}>
                        {offer.bank_name}: {formatINR(offer.estimated_discount)} off → {formatINR(offer.payable_if_selected)}
                        {offer.cashback_note ? ` (${offer.cashback_note})` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">Verified {new Date(listing.verified_at).toLocaleString("en-IN")}</p>
                <Button asChild size="sm" variant={listing.is_cheapest_effective ? "default" : "outline"}>
                  <a href={`/api/affiliate/click/${listing.id}?source_page=comparison&session_id=${encodeURIComponent(comparison.comparison_session_id)}`} target="_blank" rel="noopener noreferrer nofollow sponsored">
                    Go to {listing.retailer?.name} <ExternalLink className="ml-1 h-3 w-3" />
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 rounded-xl border bg-card p-4 text-xs text-muted-foreground">
        <p>{comparison.disclaimer}</p>
        <p className="mt-1">Verified timestamp: {new Date(comparison.verified_timestamp).toLocaleString("en-IN")}. Data sources: {comparison.data_sources.join(", ")}.</p>
      </div>
    </main>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-7xl px-4 py-16 text-sm text-muted-foreground">Loading comparison...</main>}>
      <CompareContent />
    </Suspense>
  );
}
