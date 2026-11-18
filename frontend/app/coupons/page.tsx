"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgePercent, Bookmark, Check, Copy, Loader2, Search } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch, buildQuery } from "@/lib/api";
import { getWalletIds, toggleWalletCoupon } from "@/lib/coupon-wallet";
import { formatINR } from "@/lib/format";
import type { CouponItem } from "@/lib/types";

function couponValue(coupon: CouponItem): string {
  if (coupon.discount_type === "percent") return `${coupon.discount_value}% off`;
  if (coupon.discount_type === "flat") return `${formatINR(coupon.discount_value)} off`;
  return "Special offer";
}

export default function CouponsPage() {
  const { user, token } = useAuth();
  const [items, setItems] = useState<CouponItem[]>([]);
  const [q, setQ] = useState("");
  const [includeExpired, setIncludeExpired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [walletIds, setWalletIds] = useState<number[]>([]);

  useEffect(() => {
    setWalletIds(getWalletIds());
  }, []);

  function toggleWallet(couponId: number) {
    setWalletIds(toggleWalletCoupon(couponId));
    setNotice(walletIds.includes(couponId) ? "Removed from local coupon wallet." : "Saved to local coupon wallet on this browser.");
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<{ items: CouponItem[]; total: number }>(
        `/api/coupons${buildQuery({ q, include_expired: includeExpired })}`,
      );
      setItems(payload.items);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Could not load coupons");
    } finally {
      setLoading(false);
    }
  }, [q, includeExpired]);

  useEffect(() => {
    void load();
  }, [load]);

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setNotice("Clipboard access was denied. Select and copy the code manually.");
    }
  }

  async function verify(coupon: CouponItem, status: "valid" | "invalid" | "expired") {
    if (!user || !token) {
      setNotice("Log in to submit a community coupon verification.");
      return;
    }
    try {
      await apiFetch(`/api/coupons/${coupon.id}/verify`, {
        method: "POST",
        token,
        body: { status, notes: `Submitted from coupon discovery page as ${status}.` },
      });
      setNotice(
        `Verification recorded for ${coupon.code}. It remains community-reported until an admin reviews it; it is not shown as retailer-verified.`,
      );
    } catch (fetchError) {
      setNotice(fetchError instanceof Error ? fetchError.message : "Could not record verification");
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <BadgePercent className="h-6 w-6 text-primary" /> Coupons
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Verified and community-reported coupon records. Always confirm eligibility and the final checkout price on the retailer site.
        </p>
      </div>

      <form
        className="mt-5 flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search coupon code or title" className="pl-9" />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={includeExpired} onChange={(event) => setIncludeExpired(event.target.checked)} />
          Include expired
        </label>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      {notice && <p className="mt-4 rounded-lg border bg-card p-3 text-sm">{notice}</p>}
      {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {loading ? (
        <p className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading coupons...
        </p>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((coupon) => (
            <Card key={coupon.id} className="border-dashed">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={coupon.is_verified ? "success" : "secondary"}>
                    {coupon.is_verified ? "Verified record" : "Community record"}
                  </Badge>
                  {coupon.expired && <Badge variant="destructive">Expired</Badge>}
                  {coupon.is_demo && <Badge variant="warning">Demo</Badge>}
                  {coupon.is_stackable && <Badge variant="outline">Stackable</Badge>}
                </div>
                <CardTitle className="text-base">{coupon.title}</CardTitle>
                <p className="text-xs text-muted-foreground">{coupon.retailer?.name ?? "Retailer offer"}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-2xl font-bold text-primary">{couponValue(coupon)}</p>
                <p className="text-sm text-muted-foreground">{coupon.description}</p>
                <div className="rounded-lg border bg-muted p-2">
                  <div className="flex items-center justify-between gap-2">
                    <code className="text-sm font-semibold tracking-wide">{coupon.code}</code>
                    <Button size="sm" variant="ghost" onClick={() => void copy(coupon.code)}>
                      {copied === coupon.code ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copied === coupon.code ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span>Min order: {formatINR(coupon.min_order)}</span>
                  <span>Max: {coupon.max_discount ? formatINR(coupon.max_discount) : "No cap"}</span>
                  <span className="col-span-2">Expires: {coupon.expires_at ? new Date(coupon.expires_at).toLocaleDateString("en-IN") : "Not specified"}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">{coupon.terms}</p>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant={walletIds.includes(coupon.id) ? "default" : "outline"} onClick={() => toggleWallet(coupon.id)}>
                    <Bookmark className="mr-1 h-3.5 w-3.5" /> {walletIds.includes(coupon.id) ? "In wallet" : "Save"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void verify(coupon, "valid")}>Works for me</Button>
                  <Button size="sm" variant="ghost" onClick={() => void verify(coupon, "invalid")}>Didn&apos;t work</Button>
                  <Button size="sm" variant="ghost" onClick={() => void verify(coupon, "expired")}>Expired</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && items.length === 0 && (
        <Card className="mt-6">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">No coupons match your search.</CardContent>
        </Card>
      )}
    </main>
  );
}
