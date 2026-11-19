"use client";

import { useEffect, useState } from "react";
import { BarChart3, Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { formatINR } from "@/lib/format";
import type { AdminOverview } from "@/lib/types";

type Metrics = {
  primary_metric: AdminOverview["metrics"]["primary_metric"];
  searches: number;
  comparisons: number;
  affiliate_clicks: number;
  cheaper_store_clicks: number;
  saved_products: number;
  price_alerts: number;
  savings_identified: number;
  ai_recommendations: number;
  purchases_tracked: number;
  retention_30d_pct: number | null;
  retention_note: string;
  data_freshness_avg_hours: number | null;
  notification_delivery: Record<string, number>;
  product_matching_accuracy: number | null;
  product_matching_accuracy_note: string;
  generated_at: string;
};

export default function AdminAnalyticsPage() {
  const { token } = useAuth();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    Promise.all([
      apiFetch<AdminOverview>("/api/admin/overview", { token, signal: controller.signal }),
      apiFetch<Metrics>("/api/analytics/metrics", { token, signal: controller.signal }),
    ])
      .then(([overviewPayload, metricsPayload]) => {
        setOverview(overviewPayload);
        setMetrics(metricsPayload);
      })
      .catch((fetchError) => {
        if (!controller.signal.aborted) setError(fetchError instanceof Error ? fetchError.message : "Could not load analytics");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [token]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold"><BarChart3 className="h-6 w-6 text-primary" /> Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">Product metric: cheaper-store click-through. Commission is never an input to ranking.</p>
        </div>
        {overview?.demo_mode && <Badge variant="warning">Demo mode</Badge>}
      </div>

      {error && <Alert className="mt-4" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {loading && <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading metrics...</p>}

      {metrics && (
        <>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Cheaper-store CTR", value: metrics.primary_metric.value_pct === null ? "No data" : `${metrics.primary_metric.value_pct}%` },
              { label: "Cheapest clicks", value: metrics.cheaper_store_clicks },
              { label: "Comparison sessions", value: metrics.comparisons },
              { label: "Savings identified", value: formatINR(metrics.savings_identified) },
              { label: "Searches", value: metrics.searches },
              { label: "Saved products", value: metrics.saved_products },
              { label: "Price alerts", value: metrics.price_alerts },
              { label: "AI recommendations", value: metrics.ai_recommendations },
            ].map((stat) => (
              <Card key={stat.label}>
                <CardContent className="pt-5">
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Primary metric definition</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="font-medium">{metrics.primary_metric.name}</p>
                <p className="text-xs text-muted-foreground">{metrics.primary_metric.definition}</p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary">{metrics.primary_metric.cheaper_store_clicks} cheaper clicks</Badge>
                  <Badge variant="secondary">{metrics.primary_metric.comparison_sessions} comparisons</Badge>
                  <Badge variant="outline">{metrics.affiliate_clicks} total affiliate clicks</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Generated {new Date(metrics.generated_at).toLocaleString("en-IN")}.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Data quality & retention</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">30-day repeat-user proxy</span><span>{metrics.retention_30d_pct === null ? "No data" : `${metrics.retention_30d_pct}%`}</span></div>
                <p className="text-xs text-muted-foreground">{metrics.retention_note}</p>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Average listing freshness</span><span>{metrics.data_freshness_avg_hours === null ? "No data" : `${metrics.data_freshness_avg_hours} h`}</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Matching accuracy</span><span>{metrics.product_matching_accuracy === null ? "Not benchmarked" : `${metrics.product_matching_accuracy}%`}</span></div>
                <p className="text-xs text-muted-foreground">{metrics.product_matching_accuracy_note}</p>
              </CardContent>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Record counts</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 text-sm">
                {Object.entries(overview?.counts ?? {}).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-2 rounded border px-2 py-1.5">
                    <span className="capitalize text-muted-foreground">{key.replaceAll("_", " ")}</span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Notification delivery</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {Object.entries(metrics.notification_delivery).map(([status, count]) => (
                  <div key={status} className="flex justify-between border-b py-1 last:border-b-0"><span className="capitalize text-muted-foreground">{status}</span><span className="font-medium">{count}</span></div>
                ))}
                {Object.keys(metrics.notification_delivery).length === 0 && <p className="text-muted-foreground">No notification records.</p>}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
