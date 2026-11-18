"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, CalendarDays } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { formatINR } from "@/lib/format";
import type { BankOffer, Campaign, Coupon, Product } from "@/lib/types";

type CampaignDetail = {
  campaign: Campaign;
  trending_deals: {
    product: Product;
    listing_id: number;
    price: number;
    effective_price: number;
    drop_from_average_pct: number;
    is_demo: boolean;
  }[];
  coupons: Coupon[];
  bank_offers: BankOffer[];
  authenticity_checks: { check: string; passed: boolean; note?: string }[];
  disclaimer: string;
};

export default function SaleEventPage() {
  const params = useParams<{ slug: string }>();
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<CampaignDetail>(`/api/sale-campaigns/${params.slug}`, { signal: controller.signal })
      .then(setDetail)
      .catch((fetchError) => {
        if (!controller.signal.aborted) setError(fetchError instanceof Error ? fetchError.message : "Could not load sale event");
      });
    return () => controller.abort();
  }, [params.slug]);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-2xl font-bold">Sale event unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <Button asChild className="mt-4">
          <Link href="/sale-events">Back to sale events</Link>
        </Button>
      </main>
    );
  }

  if (!detail) {
    return <main className="mx-auto max-w-7xl px-4 py-16 text-sm text-muted-foreground">Loading sale event...</main>;
  }

  const campaign = detail.campaign;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="rounded-2xl border bg-slate-900 p-6 text-white sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={campaign.state === "live" ? "success" : campaign.state === "upcoming" ? "warning" : "secondary"}>
            {campaign.state}
          </Badge>
          {campaign.is_demo && <Badge variant="warning">Demo dates</Badge>}
          {campaign.is_verified && <Badge variant="success">Officially verified</Badge>}
        </div>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{campaign.name}</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-300">{campaign.description}</p>
        <p className="mt-3 flex items-center gap-2 text-sm text-slate-300">
          <CalendarDays className="h-4 w-4" />
          {new Date(campaign.starts_at).toLocaleString("en-IN")} – {new Date(campaign.ends_at).toLocaleString("en-IN")}
        </p>
        <p className="mt-2 text-xs text-slate-400">{campaign.authenticity_note}</p>
      </div>

      <section className="mt-8">
        <h2 className="text-2xl font-bold">Trending during this event</h2>
        <p className="text-sm text-muted-foreground">Prices are current demo observations, not guaranteed event prices.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {detail.trending_deals.map((deal) => (
            <Card key={deal.listing_id} className="card-hover">
              <CardHeader className="pb-2">
                <CardTitle className="line-clamp-2 text-base">
                  <Link href={`/products/${deal.product.slug}`} className="hover:text-primary">
                    {deal.product.name}
                  </Link>
                </CardTitle>
                <p className="text-xs text-muted-foreground">{deal.product.brand} · {deal.product.category}</p>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-2xl font-bold text-primary">{formatINR(deal.effective_price)}</p>
                <p className="text-xs text-muted-foreground">
                  List price {formatINR(deal.price)} · {deal.drop_from_average_pct.toFixed(1)}% vs tracked average
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary">Exact variant listing</Badge>
                  {deal.is_demo && <Badge variant="warning">Demo</Badge>}
                </div>
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/products/${deal.product.slug}`}>
                    Compare <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Coupons for this event</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {detail.coupons.length === 0 && <p className="text-sm text-muted-foreground">No coupon records for this event.</p>}
            {detail.coupons.map((coupon) => (
              <div key={coupon.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <code className="font-semibold">{coupon.code}</code>
                  <Badge variant={coupon.is_verified ? "success" : "secondary"}>
                    {coupon.is_verified ? "Verified record" : "Community"}
                  </Badge>
                </div>
                <p className="mt-1 text-sm">{coupon.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {coupon.discount_type === "percent" ? `${coupon.discount_value}% off` : `${formatINR(coupon.discount_value)} off`}
                  {coupon.max_discount ? ` up to ${formatINR(coupon.max_discount)}` : ""}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bank offers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {detail.bank_offers.length === 0 && <p className="text-sm text-muted-foreground">No bank offers recorded for this event.</p>}
            {detail.bank_offers.map((offer) => (
              <div key={offer.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{offer.bank_name} · {offer.title}</p>
                  {offer.is_demo && <Badge variant="warning">Demo</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Min transaction {formatINR(offer.min_transaction)} · {offer.terms}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="mt-8 rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Authenticity checks</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {detail.authenticity_checks.map((check) => (
            <li key={check.check} className="flex items-start gap-2">
              <Badge variant={check.passed ? "success" : "warning"}>{check.passed ? "Passed" : "Not verified"}</Badge>
              <span className="text-muted-foreground">
                {check.check.replaceAll("_", " ")}
                {check.note ? ` — ${check.note}` : ""}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">{detail.disclaimer}</p>
      </section>
    </main>
  );
}
