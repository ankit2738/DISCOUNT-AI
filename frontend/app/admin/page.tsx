"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { formatINR } from "@/lib/format";
import type { AdminOverview } from "@/lib/types";

type AdminHealth = {
  status: string;
  database: { status: string; scheme: string };
  adapters: { name: string; integration_status: string; live_ready: boolean; demo_data: boolean }[];
  environment: string;
  demo_mode: boolean;
  checked_at: string;
};

const COUNT_LABELS: Record<string, string> = {
  users: "Users",
  products: "Products",
  retailers: "Retailers",
  listings: "Listings",
  coupons: "Coupons",
  bank_offers: "Bank offers",
  pending_community_reports: "Pending reports",
  pending_marketplace_listings: "Pending listings",
  open_disputes: "Open disputes",
  active_campaigns: "Active campaigns",
};

export default function AdminOverviewPage() {
  const { token } = useAuth();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [health, setHealth] = useState<AdminHealth | null>(null);
  const [marketplace, setMarketplace] = useState<{ items: { id: number; title: string; price: number; status: string; is_transfer_allowed: boolean }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [overviewPayload, healthPayload, marketplacePayload] = await Promise.all([
        apiFetch<AdminOverview>("/api/admin/overview", { token }),
        apiFetch<AdminHealth>("/api/admin/health", { token }),
        apiFetch<{ items: { id: number; title: string; price: number; status: string; is_transfer_allowed: boolean }[] }>("/api/admin/marketplace/listings", { token }),
      ]);
      setOverview(overviewPayload);
      setHealth(healthPayload);
      setMarketplace(marketplacePayload);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Could not load admin overview");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const metric = overview?.metrics.primary_metric;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Admin overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">Owner-only operational summary. Demo mode {overview?.demo_mode ? "on" : "off"}.</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? "mr-1 h-4 w-4 animate-spin" : "mr-1 h-4 w-4"} /> Refresh
        </Button>
      </div>

      {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <Card className="mt-5 border-primary/30 bg-primary/5">
        <CardHeader><CardTitle className="text-base">Primary metric — cheaper-store click-through rate</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-4xl font-black text-primary">{metric?.value_pct !== null && metric?.value_pct !== undefined ? `${metric.value_pct}%` : "No data"}</p>
            <p className="text-xs text-muted-foreground">CTR = cheaper-store clicks / comparison sessions</p>
          </div>
          <div><p className="text-xs text-muted-foreground">Cheaper-store clicks</p><p className="text-2xl font-bold">{metric?.cheaper_store_clicks ?? 0}</p></div>
          <div><p className="text-xs text-muted-foreground">Comparison sessions</p><p className="text-2xl font-bold">{metric?.comparison_sessions ?? 0}</p></div>
          <p className="text-xs text-muted-foreground sm:col-span-3">{metric?.definition}</p>
        </CardContent>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Object.entries(overview?.counts ?? {}).map(([key, value]) => (
          <Card key={key}>
            <CardContent className="pt-5">
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground">{COUNT_LABELS[key] ?? key.replaceAll("_", " ")}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">API health</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant={health?.status === "ok" ? "success" : "destructive"}>{health?.status ?? "unknown"}</Badge>
              <Badge variant="secondary">DB {health?.database.status ?? "—"}</Badge>
              <Badge variant="outline">{health?.environment ?? "—"}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">Database scheme {health?.database.scheme}. Checked {health ? new Date(health.checked_at).toLocaleString("en-IN") : "—"}.</p>
            <div className="space-y-1">
              {health?.adapters.map((adapter) => (
                <div key={adapter.name} className="flex items-center justify-between text-xs">
                  <span>{adapter.name}</span>
                  <span className="flex gap-1.5">
                    <Badge variant={adapter.integration_status === "live" ? "success" : "secondary"}>{adapter.integration_status}</Badge>
                    {adapter.demo_data && <Badge variant="warning">Demo</Badge>}
                  </span>
                </div>
              ))}
            </div>
            <Button asChild size="sm" variant="outline"><Link href="/admin/system">Open system console <ArrowRight className="ml-1 h-3 w-3" /></Link></Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Business metrics</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {overview && [
              ["Searches", overview.metrics.searches],
              ["Comparisons", overview.metrics.comparisons],
              ["Affiliate clicks", overview.metrics.affiliate_clicks],
              ["Savings identified", formatINR(Number(overview.metrics.savings_identified ?? 0))],
              ["AI recommendations", overview.metrics.ai_recommendations],
              ["Tracked purchases", overview.metrics.purchases_tracked],
              ["Data freshness (avg hours)", overview.metrics.data_freshness_avg_hours ?? "—"],
              ["30-day retention proxy", overview.metrics.retention_30d_pct ? `${overview.metrics.retention_30d_pct}%` : "—"],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex justify-between gap-3 border-b pb-1 last:border-b-0">
                <span className="text-muted-foreground">{String(label)}</span>
                <span className="font-medium">{String(value)}</span>
              </div>
            ))}
            {overview && <p className="text-[11px] text-muted-foreground">{String(overview.metrics.product_matching_accuracy_note ?? "")}</p>}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Pending marketplace listings</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {marketplace?.items.filter((listing) => listing.status === "pending").slice(0, 5).map((listing) => (
              <div key={listing.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
                <span>#{listing.id} {listing.title}</span>
                <span>{formatINR(listing.price)}</span>
              </div>
            ))}
            {(!marketplace || marketplace.items.filter((listing) => listing.status === "pending").length === 0) && (
              <p className="text-sm text-muted-foreground">No pending listings.</p>
            )}
            <Button asChild size="sm" variant="outline"><Link href="/admin/marketplace">Moderate marketplace</Link></Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Admin modules</CardTitle></CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {[
              ["/admin/users", "Users & roles"],
              ["/admin/catalog", "Catalogue & prices"],
              ["/admin/offers", "Coupons & banks"],
              ["/admin/community", "Community reports"],
              ["/admin/marketplace", "Marketplace & disputes"],
              ["/admin/campaigns", "Sale campaigns"],
              ["/admin/system", "Integrations & audit"],
            ].map(([href, label]) => (
              <Link key={href} href={href} className="rounded-lg border px-3 py-2 text-sm hover:border-primary hover:text-primary">
                {label}
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
