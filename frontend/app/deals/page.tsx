"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Flame, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch, buildQuery } from "@/lib/api";
import { formatINR } from "@/lib/format";
import type { DealsResponse } from "@/lib/types";

type Category = { name: string; count: number };

export default function DealsPage() {
  const [deals, setDeals] = useState<DealsResponse | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ items: Category[] }>("/api/products/categories")
      .then((payload) => setCategories(payload.items))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    apiFetch<DealsResponse>(`/api/deals${buildQuery({ limit: 24, category })}`, { signal: controller.signal })
      .then(setDeals)
      .catch((fetchError) => {
        if (!controller.signal.aborted) setError(fetchError instanceof Error ? fetchError.message : "Could not load deals");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [category]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <Flame className="h-6 w-6 text-accent" /> Today&apos;s deals
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Ranked by discount against each listing&apos;s tracked one-year average. Commission and promotions never affect ranking.
          </p>
        </div>
        <select
          aria-label="Filter deals by category"
          className="h-10 rounded-lg border bg-card px-3 text-sm"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant="warning">Demo retailer data</Badge>
        <Badge variant="secondary">{deals?.total ?? 0} tracked listings</Badge>
      </div>

      {error && <p className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}

      {loading && (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading deals...
        </div>
      )}

      {!loading && deals && (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {deals.items.map((deal) => (
            <Card key={deal.listing.id} className="card-hover">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={deal.deal_score.score >= 70 ? "success" : deal.deal_score.score >= 50 ? "warning" : "secondary"}>
                    Deal score {deal.deal_score.score} · {deal.deal_score.grade}
                  </Badge>
                  <Badge variant="outline">Confidence {Math.round(deal.deal_score.confidence * 100)}%</Badge>
                </div>
                <CardTitle className="line-clamp-2 text-base">
                  <Link href={`/products/${deal.product.slug}`} className="hover:text-primary">
                    {deal.product.name}
                  </Link>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {deal.product.brand} · {deal.product.category} · {deal.listing.variant?.name}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-2xl font-bold text-primary">{formatINR(deal.effective.effective_price)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatINR(deal.listing.price)} + {formatINR(deal.listing.delivery_charge)} delivery
                      {deal.effective.coupon_discount > 0 && ` − ${formatINR(deal.effective.coupon_discount)} coupon`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-emerald-700">
                      {deal.drop_from_average_pct >= 0 ? "−" : "+"}
                      {Math.abs(deal.drop_from_average_pct).toFixed(1)}%
                    </p>
                    <p className="text-[11px] text-muted-foreground">vs 1-year average</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <Badge variant="secondary">{deal.listing.retailer?.name}</Badge>
                  <Badge variant={deal.listing.availability === "in_stock" ? "success" : "destructive"}>
                    {deal.listing.availability.replaceAll("_", " ")}
                  </Badge>
                  {deal.effective.coupon && <Badge variant="warning">Coupon {deal.effective.coupon.code}</Badge>}
                  {deal.is_demo && <Badge variant="warning">Demo</Badge>}
                </div>
                <Button asChild className="w-full" variant="outline">
                  <Link href={`/products/${deal.product.slug}`}>
                    Compare this variant <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && deals?.items.length === 0 && (
        <Card className="mt-6">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No deals in this category yet.
          </CardContent>
        </Card>
      )}

      <p className="mt-6 text-xs text-muted-foreground">{deals?.methodology}</p>
    </main>
  );
}
