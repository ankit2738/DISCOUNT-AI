"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Package, TrendingDown, TrendingUp } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { formatINR } from "@/lib/format";
import type { Purchase } from "@/lib/types";

type Tracking = {
  purchase_id: number;
  purchase_price: number;
  current_lowest_price: number;
  difference: number;
  direction: string;
  notice: string;
};

export default function PurchasesPage() {
  const { token } = useAuth();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [tracking, setTracking] = useState<Record<number, Tracking>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    apiFetch<{ items: Purchase[] }>("/api/purchases", { token, signal: controller.signal })
      .then((payload) => setPurchases(payload.items))
      .catch((fetchError) => {
        if (!controller.signal.aborted) setError(fetchError instanceof Error ? fetchError.message : "Could not load purchases");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [token]);

  async function track(purchaseId: number) {
    if (!token) return;
    try {
      const payload = await apiFetch<Tracking>(`/api/purchases/${purchaseId}/tracking`, { token });
      setTracking((current) => ({ ...current, [purchaseId]: payload }));
    } catch (trackError) {
      setError(trackError instanceof Error ? trackError.message : "Could not load purchase tracking");
    }
  }

  return (
    <div>
      <h1 className="flex items-center gap-2 text-3xl font-bold"><Package className="h-6 w-6 text-primary" /> Purchases</h1>
      <p className="mt-1 text-sm text-muted-foreground">Post-purchase price tracking. DISCOUNT AI does not guarantee price protection or refunds.</p>

      {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <div className="mt-5 space-y-3">
        {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading purchases...</p>}
        {purchases.map((purchase) => {
          const tracked = tracking[purchase.id];
          return (
            <Card key={purchase.id}>
              <CardContent className="space-y-3 pt-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {purchase.product ? <Link href={`/products/${purchase.product.slug}`} className="hover:text-primary">{purchase.product.name}</Link> : `Product #${purchase.id}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Qty {purchase.quantity} · paid {formatINR(purchase.price)} · {new Date(purchase.purchased_at).toLocaleDateString("en-IN")} · retailer #{purchase.retailer_id}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void track(purchase.id)}>Track current price</Button>
                </div>

                {tracked && (
                  <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={tracked.direction === "cheaper_now" ? "success" : tracked.direction === "higher_now" ? "warning" : "secondary"}>
                        {tracked.direction === "cheaper_now" ? <TrendingDown className="mr-1 h-3 w-3" /> : tracked.direction === "higher_now" ? <TrendingUp className="mr-1 h-3 w-3" /> : null}
                        {tracked.direction.replaceAll("_", " ")}
                      </Badge>
                      <span>Current cheapest {formatINR(tracked.current_lowest_price)}</span>
                      <span className="text-muted-foreground">difference {formatINR(tracked.difference)}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{tracked.notice}</p>
                  </div>
                )}

                {!tracked && purchase.price_change !== null && (
                  <p className="text-xs text-muted-foreground">
                    Latest comparison: current lowest {formatINR(purchase.current_lowest_price)} ({purchase.price_change && purchase.price_change < 0 ? "cheaper" : "higher"} than recorded purchase).
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
        {!loading && purchases.length === 0 && (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
            No purchases recorded. From a product page, use “Track purchase” on a retailer listing.
          </CardContent></Card>
        )}
      </div>
    </div>
  );
}
