"use client";

import { useCallback, useEffect, useState } from "react";
import { Bookmark, Loader2, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { getWalletIds, toggleWalletCoupon } from "@/lib/coupon-wallet";
import { formatINR } from "@/lib/format";
import type { CouponItem } from "@/lib/types";

export default function CouponWalletPage() {
  const [walletIds, setWalletIds] = useState<number[]>([]);
  const [coupons, setCoupons] = useState<CouponItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setWalletIds(getWalletIds());
    setLoading(true);
    try {
      const payload = await apiFetch<{ items: CouponItem[] }>("/api/coupons?include_expired=true&limit=100");
      setCoupons(payload.items);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Could not load coupon wallet");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function remove(couponId: number) {
    setWalletIds(toggleWalletCoupon(couponId));
  }

  const saved = coupons.filter((coupon) => walletIds.includes(coupon.id));

  return (
    <div>
      <h1 className="flex items-center gap-2 text-3xl font-bold"><Bookmark className="h-6 w-6 text-primary" /> Coupon wallet</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Coupons saved on this browser. Wallet storage is local to this demo device; coupon validity must be confirmed on the retailer site.
      </p>

      {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <div className="mt-5 space-y-3">
        {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading wallet...</p>}
        {saved.map((coupon) => (
          <Card key={coupon.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
              <div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant={coupon.is_verified ? "success" : "secondary"}>{coupon.is_verified ? "Verified record" : "Community record"}</Badge>
                  {coupon.expired && <Badge variant="destructive">Expired</Badge>}
                  {coupon.is_demo && <Badge variant="warning">Demo</Badge>}
                </div>
                <p className="mt-1 font-semibold"><code>{coupon.code}</code> — {coupon.title}</p>
                <p className="text-xs text-muted-foreground">{coupon.retailer?.name ?? "Retailer"} · min {formatINR(coupon.min_order)} · expires {coupon.expires_at ? new Date(coupon.expires_at).toLocaleDateString("en-IN") : "not specified"}</p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-sm font-semibold text-primary">
                  {coupon.discount_type === "percent" ? `${coupon.discount_value}% off` : `${formatINR(coupon.discount_value)} off`}
                </p>
                <Button variant="ghost" size="icon" aria-label="Remove from wallet" onClick={() => remove(coupon.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!loading && saved.length === 0 && (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
            No saved coupons. Open <a href="/coupons" className="text-primary hover:underline">Coupons</a> and save the codes you want to keep.
          </CardContent></Card>
        )}
      </div>
    </div>
  );
}
