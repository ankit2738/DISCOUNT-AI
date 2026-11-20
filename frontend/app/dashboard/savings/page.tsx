"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Loader2, PiggyBank, TrendingDown, Wallet } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { formatINR } from "@/lib/format";
import type { SavingsDashboard } from "@/lib/types";

export default function SavingsPage() {
  const { token } = useAuth();
  const [data, setData] = useState<SavingsDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    apiFetch<SavingsDashboard>("/api/account/savings", { token })
      .then(setData)
      .catch((fetchError) => setError(fetchError instanceof Error ? fetchError.message : "Could not load savings"));
  }, [token]);

  if (!token) {
    return <Alert><AlertDescription>Log in to view your savings dashboard.</AlertDescription></Alert>;
  }
  if (error) {
    return <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>;
  }
  if (!data) {
    return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading verified savings...</p>;
  }

  const maxMonth = Math.max(1, ...data.monthly_history.map((item) => Math.max(item.verified, item.estimated)));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold"><PiggyBank className="h-6 w-6 text-primary" /> Savings dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Verified savings are separated from estimates. Nothing is counted as verified until you mark a purchased coupon as redeemed.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Verified savings", value: formatINR(data.verified_savings), icon: BadgeCheck },
          { label: "Estimated savings", value: formatINR(data.estimated_savings), icon: TrendingDown },
          { label: "Coupons purchased", value: data.coupons_purchased, icon: Wallet },
          { label: "Coupons redeemed", value: data.coupons_redeemed, icon: BadgeCheck },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-5">
              <stat.icon className="h-4 w-4 text-primary" />
              <p className="mt-2 text-2xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Savings by retailer</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.savings_by_retailer.map((item) => (
              <div key={item.retailer} className="flex items-center justify-between border-b pb-1">
                <span>{item.retailer.replace("retailer:", "Retailer ")}</span>
                <span className="text-xs text-muted-foreground">verified {formatINR(item.verified)} · est. {formatINR(item.estimated)}</span>
              </div>
            ))}
            {data.savings_by_retailer.length === 0 && <p className="text-muted-foreground">No savings recorded yet.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Monthly history</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {data.monthly_history.map((item) => (
              <div key={item.month}>
                <div className="flex items-center justify-between text-xs"><span>{item.month}</span><span>verified {formatINR(item.verified)} · est. {formatINR(item.estimated)}</span></div>
                <div className="mt-1 h-2 rounded bg-muted"><div className="h-2 rounded bg-primary" style={{ width: `${Math.min(100, (item.verified / maxMonth) * 100)}%` }} /></div>
                <div className="mt-0.5 h-1 rounded bg-muted"><div className="h-1 rounded bg-amber-500" style={{ width: `${Math.min(100, (item.estimated / maxMonth) * 100)}%` }} /></div>
              </div>
            ))}
            {data.monthly_history.length === 0 && <p className="text-sm text-muted-foreground">No monthly savings yet.</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Other signals</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <p>Price drops detected: <Badge variant="secondary">{data.price_drops_detected}</Badge></p>
          <p>Estimated price-drop savings: <Badge variant="secondary">{formatINR(data.estimated_price_drops)}</Badge></p>
          <p>Successful deal discoveries: <Badge variant="secondary">{data.successful_deal_discoveries}</Badge></p>
          <p>Alerts triggered: <Badge variant="secondary">{data.alerts_triggered} / {data.alerts_created}</Badge></p>
          <div className="sm:col-span-2 space-y-1 text-xs text-muted-foreground">
            <p><strong>Verified:</strong> {data.definitions.verified}</p>
            <p><strong>Estimated:</strong> {data.definitions.estimated}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
