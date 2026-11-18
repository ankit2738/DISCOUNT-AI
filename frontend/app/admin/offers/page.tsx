"use client";

import { useEffect, useState } from "react";
import { BadgePercent, Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { formatINR } from "@/lib/format";
import type { BankOffer, Coupon, Retailer } from "@/lib/types";

export default function AdminOffersPage() {
  const { token } = useAuth();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [offers, setOffers] = useState<BankOffer[]>([]);
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [retailerId, setRetailerId] = useState("");
  const [discountType, setDiscountType] = useState("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [minOrder, setMinOrder] = useState("0");

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const [couponPayload, offerPayload, retailerPayload] = await Promise.all([
        apiFetch<{ items: Coupon[] }>("/api/admin/coupons", { token }),
        apiFetch<{ items: BankOffer[] }>("/api/admin/bank-offers", { token }),
        apiFetch<{ items: Retailer[] }>("/api/admin/retailers", { token }),
      ]);
      setCoupons(couponPayload.items);
      setOffers(offerPayload.items);
      setRetailers(retailerPayload.items);
      if (!retailerId && retailerPayload.items[0]) setRetailerId(String(retailerPayload.items[0].id));
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Could not load offers");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function toggleCoupon(coupon: Coupon) {
    if (!token) return;
    try {
      await apiFetch(`/api/admin/coupons/${coupon.id}/verify?verified=${!coupon.is_verified}`, { method: "PATCH", token });
      setCoupons((current) => current.map((item) => (item.id === coupon.id ? { ...item, is_verified: !item.is_verified } : item)));
      setMessage(`Coupon ${coupon.code} marked ${coupon.is_verified ? "unverified" : "verified"}.`);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Could not update coupon");
    }
  }

  async function toggleOffer(offer: BankOffer) {
    if (!token) return;
    try {
      await apiFetch(`/api/admin/bank-offers/${offer.id}/active?active=${!offer.is_active}`, { method: "PATCH", token });
      setOffers((current) => current.map((item) => (item.id === offer.id ? { ...item, is_active: !item.is_active } : item)));
      setMessage(`Bank offer #${offer.id} ${offer.is_active ? "deactivated" : "activated"}.`);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Could not update bank offer");
    }
  }

  async function createCoupon(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    try {
      await apiFetch("/api/admin/coupons", {
        method: "POST",
        token,
        body: {
          code,
          title,
          retailer_id: Number(retailerId),
          discount_type: discountType,
          discount_value: Number(discountValue),
          min_order: Number(minOrder || 0),
        },
      });
      setMessage(`Coupon ${code} created as an admin record.`);
      setCode("");
      setTitle("");
      setDiscountValue("");
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create coupon");
    }
  }

  return (
    <div>
      <h1 className="flex items-center gap-2 text-3xl font-bold"><BadgePercent className="h-6 w-6 text-primary" /> Coupons & bank offers</h1>
      <p className="mt-1 text-sm text-muted-foreground">Verification and activation controls. Do not mark an offer verified without evidence.</p>

      {message && <p className="mt-3 rounded-lg border bg-card p-3 text-sm">{message}</p>}
      {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {loading && <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading offers...</p>}

      <div className="mt-5 grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader><CardTitle className="text-base">Create coupon record</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={createCoupon} className="space-y-2">
              <div className="space-y-1"><Label htmlFor="coupon-code">Code</Label><Input id="coupon-code" required value={code} onChange={(event) => setCode(event.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="coupon-title">Title</Label><Input id="coupon-title" required value={title} onChange={(event) => setTitle(event.target.value)} /></div>
              <div className="space-y-1">
                <Label htmlFor="coupon-retailer">Retailer</Label>
                <select id="coupon-retailer" className="h-10 w-full rounded-lg border bg-card px-3 text-sm" value={retailerId} onChange={(event) => setRetailerId(event.target.value)}>
                  {retailers.map((retailer) => <option key={retailer.id} value={retailer.id}>{retailer.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="discount-type">Type</Label>
                  <select id="discount-type" className="h-10 w-full rounded-lg border bg-card px-3 text-sm" value={discountType} onChange={(event) => setDiscountType(event.target.value)}>
                    <option value="percent">Percent</option>
                    <option value="flat">Flat</option>
                  </select>
                </div>
                <div className="space-y-1"><Label htmlFor="discount-value">Value</Label><Input id="discount-value" type="number" min={1} required value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} /></div>
              </div>
              <div className="space-y-1"><Label htmlFor="min-order">Minimum order</Label><Input id="min-order" type="number" min={0} value={minOrder} onChange={(event) => setMinOrder(event.target.value)} /></div>
              <p className="text-[11px] text-muted-foreground">Created coupons are unverified until an admin verifies them. They are marked non-demo admin records.</p>
              <Button type="submit" className="w-full">Create coupon</Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Coupons ({coupons.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {coupons.map((coupon) => (
                <div key={coupon.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium"><code>{coupon.code}</code> — {coupon.title}</p>
                    <p className="text-xs text-muted-foreground">Retailer #{coupon.retailer_id} · {coupon.discount_type} {coupon.discount_value} · min {formatINR(coupon.min_order)}</p>
                    <div className="mt-1 flex gap-1.5">
                      <Badge variant={coupon.is_verified ? "success" : "secondary"}>{coupon.is_verified ? "verified" : "unverified"}</Badge>
                      {coupon.is_demo && <Badge variant="warning">Demo</Badge>}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void toggleCoupon(coupon)}>{coupon.is_verified ? "Unverify" : "Verify"}</Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Bank offers ({offers.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {offers.map((offer) => (
                <div key={offer.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{offer.bank_name} — {offer.title}</p>
                    <p className="text-xs text-muted-foreground">{offer.card_type} · {offer.discount_type} {offer.discount_value} · min {formatINR(offer.min_transaction)}</p>
                    <div className="mt-1 flex gap-1.5">
                      <Badge variant={offer.is_active ? "success" : "destructive"}>{offer.is_active ? "active" : "inactive"}</Badge>
                      {offer.is_demo && <Badge variant="warning">Demo</Badge>}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void toggleOffer(offer)}>{offer.is_active ? "Deactivate" : "Activate"}</Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
