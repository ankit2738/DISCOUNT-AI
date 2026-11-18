"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, ShoppingCart, Sparkles, Trash2 } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { formatINR } from "@/lib/format";
import type { BankOffer, CartPayload, OptimizeResponse } from "@/lib/types";

export default function CartPage() {
  const { token } = useAuth();
  const [cart, setCart] = useState<CartPayload | null>(null);
  const [offers, setOffers] = useState<BankOffer[]>([]);
  const [bankOfferId, setBankOfferId] = useState("");
  const [cardType, setCardType] = useState("credit");
  const [optimization, setOptimization] = useState<OptimizeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const payload = await apiFetch<CartPayload>("/api/cart", { token });
      setCart(payload);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Could not load cart");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
    apiFetch<{ items: BankOffer[] }>("/api/bank-offers?limit=100")
      .then((payload) => setOffers(payload.items))
      .catch(() => undefined);
  }, [load]);

  async function setQuantity(itemId: number, quantity: number) {
    if (!token) return;
    try {
      const payload = await apiFetch<CartPayload>(`/api/cart/items/${itemId}`, {
        method: "PATCH",
        token,
        body: { quantity },
      });
      setCart(payload);
      setOptimization(null);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update quantity");
    }
  }

  async function remove(itemId: number) {
    if (!token) return;
    try {
      const payload = await apiFetch<CartPayload>(`/api/cart/items/${itemId}`, { method: "DELETE", token });
      setCart(payload);
      setOptimization(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not remove item");
    }
  }

  async function clear() {
    if (!token) return;
    try {
      const payload = await apiFetch<CartPayload>("/api/cart/clear", { method: "DELETE", token });
      setCart(payload);
      setOptimization(null);
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "Could not clear cart");
    }
  }

  async function optimize() {
    if (!token) return;
    try {
      const payload = await apiFetch<OptimizeResponse>("/api/cart/optimize", {
        method: "POST",
        token,
        body: {
          bank_offer_id: bankOfferId ? Number(bankOfferId) : null,
          card_type: cardType,
        },
      });
      setOptimization(payload);
    } catch (optimizeError) {
      setError(optimizeError instanceof Error ? optimizeError.message : "Could not optimize cart");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold"><ShoppingCart className="h-6 w-6 text-primary" /> Smart cart</h1>
          <p className="mt-1 text-sm text-muted-foreground">Optimise exact variants across stores, eligible coupons and a bank offer.</p>
        </div>
        {cart && cart.items.length > 0 && <Button variant="ghost" onClick={() => void clear()}>Clear cart</Button>}
      </div>

      {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {loading && <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading cart...</p>}

      {!loading && cart && (
        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="space-y-3">
            {cart.items.map((item) => (
              <Card key={item.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
                  <div>
                    <p className="font-medium">{item.listing.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.listing.retailer?.name} · {item.listing.variant?.name} · {item.listing.availability.replaceAll("_", " ")}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {item.listing.is_demo && <Badge variant="warning">Demo</Badge>}
                      {item.effective.coupon && <Badge variant="secondary">Coupon {item.effective.coupon.code}</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <select aria-label="Quantity" className="h-9 rounded-lg border bg-card px-2 text-sm" value={item.quantity} onChange={(event) => void setQuantity(item.id, Number(event.target.value))}>
                      {Array.from({ length: 10 }, (_, index) => index + 1).map((quantity) => <option key={quantity} value={quantity}>{quantity}</option>)}
                    </select>
                    <div className="text-right">
                      <p className="font-semibold">{formatINR(item.line_total)}</p>
                      <p className="text-[11px] text-muted-foreground">effective {formatINR(item.effective.effective_price)} each</p>
                    </div>
                    <Button variant="ghost" size="icon" aria-label="Remove item" onClick={() => void remove(item.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {cart.items.length === 0 && (
              <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
                Your cart is empty. <Link href="/search" className="text-primary hover:underline">Find a product</Link> and add a retailer listing.
              </CardContent></Card>
            )}
          </div>

          <div>
            <Card>
              <CardHeader><CardTitle className="text-base">Cart summary</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Items</span><span>{cart.item_count}</span></div>
                <div className="flex justify-between font-semibold"><span>Subtotal</span><span>{formatINR(cart.subtotal)}</span></div>
                <p className="text-xs text-muted-foreground">Subtotal excludes per-store coupons and bank discounts until optimisation.</p>

                <div className="space-y-1.5">
                  <label htmlFor="bank-offer" className="text-xs font-medium">Bank offer (optional)</label>
                  <select id="bank-offer" className="h-9 w-full rounded-lg border bg-card px-2 text-xs" value={bankOfferId} onChange={(event) => setBankOfferId(event.target.value)}>
                    <option value="">No bank offer</option>
                    {offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.bank_name} — {offer.title}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="card-type" className="text-xs font-medium">Card type</label>
                  <select id="card-type" className="h-9 w-full rounded-lg border bg-card px-2 text-xs" value={cardType} onChange={(event) => setCardType(event.target.value)}>
                    <option value="credit">Credit</option>
                    <option value="debit">Debit</option>
                    <option value="any">Any</option>
                  </select>
                </div>
                <Button className="w-full" onClick={() => void optimize()} disabled={cart.items.length === 0}>
                  <Sparkles className="mr-1 h-4 w-4" /> Optimise cart
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {optimization && (
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-bold">Optimisation result</h2>
            <div className="flex gap-2">
              <Badge variant="success">Save {formatINR(optimization.savings)}</Badge>
              <Badge variant="secondary">{optimization.multi_store ? "Multi-store" : "Single store"}</Badge>
              {optimization.cashback_total > 0 && <Badge variant="warning">Cashback {formatINR(optimization.cashback_total)}</Badge>}
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {optimization.stores.map((store) => (
              <Card key={store.retailer_id}>
                <CardHeader className="pb-2"><CardTitle className="text-base">Store basket #{store.retailer_id}</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {store.items.map((line) => (
                    <div key={`${line.product_id}-${line.variant_id}`} className="flex justify-between gap-2 text-xs">
                      <span>{line.recommended_listing.title} × {line.quantity}</span>
                      <span>{formatINR(line.line_effective_total)}</span>
                    </div>
                  ))}
                  <div className="border-t pt-2 text-xs">
                    <div className="flex justify-between"><span>Products</span><span>{formatINR(store.product_subtotal)}</span></div>
                    <div className="flex justify-between"><span>Coupon</span><span>−{formatINR(store.coupon_discount)}</span></div>
                    <div className="flex justify-between"><span>Bank discount</span><span>−{formatINR(store.bank_discount)}</span></div>
                    <div className="mt-1 flex justify-between font-semibold"><span>Store payable</span><span>{formatINR(store.store_payable)}</span></div>
                  </div>
                  {store.applied_coupon && <Badge variant="secondary">Coupon {store.applied_coupon.code}</Badge>}
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="mt-4">
            <CardContent className="grid gap-3 pt-5 text-sm sm:grid-cols-3">
              <div><p className="text-xs text-muted-foreground">Original estimate</p><p className="font-bold">{formatINR(optimization.original_total)}</p></div>
              <div><p className="text-xs text-muted-foreground">Optimized payable</p><p className="font-bold text-primary">{formatINR(optimization.optimized_total)}</p></div>
              <div><p className="text-xs text-muted-foreground">Savings</p><p className="font-bold text-emerald-700">{formatINR(optimization.savings)}</p></div>
            </CardContent>
          </Card>
          {optimization.warnings.length > 0 && (
            <ul className="mt-3 text-xs text-amber-700">{optimization.warnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul>
          )}
          <p className="mt-2 text-xs text-muted-foreground">{optimization.methodology} {optimization.disclaimer}</p>
        </div>
      )}
    </div>
  );
}
