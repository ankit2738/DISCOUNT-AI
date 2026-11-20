"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BellRing, CheckCircle2, Copy, Loader2, PackageCheck, ShieldCheck, ShoppingBag, Star, Store, Wallet } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, buildQuery } from "@/lib/api";
import { formatINR } from "@/lib/format";
import type {
  CouponWalletItem,
  MarketplaceDispute,
  MarketplaceListing,
  MarketplaceOrder,
  RetailerOption,
  SellerWorkspace,
} from "@/lib/types";

const CATEGORIES = ["coupon", "gift_card", "cashback", "voucher"];

export default function MarketplacePage() {
  const { token, user } = useAuth();
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [wallet, setWallet] = useState<CouponWalletItem[]>([]);
  const [seller, setSeller] = useState<SellerWorkspace | null>(null);
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [disputes, setDisputes] = useState<MarketplaceDispute[]>([]);
  const [retailers, setRetailers] = useState<RetailerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("newest");
  const [maxPrice, setMaxPrice] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [verificationUrl, setVerificationUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [transferAllowed, setTransferAllowed] = useState(false);
  const [retailerId, setRetailerId] = useState("");
  const [brand, setBrand] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponValue, setCouponValue] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [applicableProducts, setApplicableProducts] = useState("");
  const [usageRestrictions, setUsageRestrictions] = useState("");
  const [redemptionInstructions, setRedemptionInstructions] = useState("");
  const [issuerTerms, setIssuerTerms] = useState("");

  const [disputeOrderId, setDisputeOrderId] = useState<number | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeEvidence, setDisputeEvidence] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const listingQuery = buildQuery({ q: query, category, sort, max_price: maxPrice || undefined, limit: 100 });
      const [listingPayload, retailerPayload, sellerPayload, orderPayload, disputePayload, walletPayload] = await Promise.all([
        apiFetch<{ items: MarketplaceListing[]; note: string }>(`/api/marketplace/listings${listingQuery}`),
        apiFetch<{ items: RetailerOption[] }>("/api/retailers").catch(() => ({ items: [] })),
        token ? apiFetch<SellerWorkspace>("/api/marketplace/seller/me", { token }).catch(() => null) : Promise.resolve(null),
        token ? apiFetch<{ items: MarketplaceOrder[] }>("/api/marketplace/orders", { token }).catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
        token ? apiFetch<{ items: MarketplaceDispute[] }>("/api/marketplace/disputes", { token }).catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
        token ? apiFetch<{ items: CouponWalletItem[] }>("/api/marketplace/wallet", { token }).catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
      ]);
      setListings(listingPayload.items);
      setRetailers(retailerPayload.items);
      setSeller(sellerPayload);
      setOrders(orderPayload.items);
      setDisputes(disputePayload.items);
      setWallet(walletPayload.items);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Could not load marketplace");
    } finally {
      setLoading(false);
    }
  }, [token, query, category, sort, maxPrice]);

  useEffect(() => {
    void load();
  }, [load]);

  async function applySeller(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    try {
      await apiFetch("/api/marketplace/seller/apply", {
        method: "POST",
        token,
        body: { display_name: displayName, bio, verification_evidence_url: verificationUrl || null },
      });
      setMessage("Seller application submitted for admin approval.");
      setDisplayName("");
      setBio("");
      setVerificationUrl("");
      await load();
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Could not apply as seller");
    }
  }

  async function createListing(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    setMessage(null);
    if (!transferAllowed) {
      setError("Confirm that the issuer permits transfer or resale before listing.");
      return;
    }
    try {
      await apiFetch("/api/marketplace/listings", {
        method: "POST",
        token,
        body: {
          title,
          description,
          category: category || "coupon",
          price: Number(price),
          proof_url: proofUrl || null,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          is_transfer_allowed: transferAllowed,
          retailer_id: retailerId ? Number(retailerId) : null,
          brand,
          coupon_code: couponCode || null,
          coupon_value: couponValue ? Number(couponValue) : 0,
          min_order: minOrder ? Number(minOrder) : 0,
          applicable_products: applicableProducts.split(",").map((item) => item.trim()).filter(Boolean),
          usage_restrictions: usageRestrictions,
          redemption_instructions: redemptionInstructions,
          issuer_terms: issuerTerms,
        },
      });
      setMessage("Listing created and pending admin verification. The coupon code was encrypted at rest.");
      setTitle("");
      setDescription("");
      setPrice("");
      setProofUrl("");
      setExpiresAt("");
      setTransferAllowed(false);
      setCouponCode("");
      setCouponValue("");
      setMinOrder("");
      setBrand("");
      setApplicableProducts("");
      setUsageRestrictions("");
      setRedemptionInstructions("");
      setIssuerTerms("");
      await load();
    } catch (listingError) {
      setError(listingError instanceof Error ? listingError.message : "Could not create listing");
    }
  }

  async function buy(listing: MarketplaceListing) {
    if (!token) {
      setMessage("Log in to buy a listing.");
      return;
    }
    if (!window.confirm(`Start a sandbox purchase of “${listing.title}” for ${formatINR(listing.price)}? No real money will move.`)) return;
    setError(null);
    try {
      const idempotencyKey = `web_${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
      const response = await apiFetch<{ id: number; transaction_reference: string; note: string }>("/api/marketplace/orders", {
        method: "POST",
        token,
        body: {
          listing_id: listing.id,
          delivery_details: { note: "Sandbox purchase from web dashboard", contact: user?.email ?? "" },
          idempotency_key: idempotencyKey,
        },
      });
      setMessage(`Sandbox order #${response.id} recorded with reference ${response.transaction_reference}. ${response.note}`);
      await load();
    } catch (buyError) {
      setError(buyError instanceof Error ? buyError.message : "Could not create sandbox order");
    }
  }

  async function createDispute(event: React.FormEvent) {
    event.preventDefault();
    if (!token || disputeOrderId === null) return;
    setError(null);
    setMessage(null);
    try {
      await apiFetch("/api/marketplace/disputes", {
        method: "POST",
        token,
        body: {
          order_id: disputeOrderId,
          reason: disputeReason,
          evidence_url: disputeEvidence || null,
        },
      });
      setMessage(`Dispute opened for order #${disputeOrderId}. An admin will review the sandbox evidence.`);
      setDisputeOrderId(null);
      setDisputeReason("");
      setDisputeEvidence("");
      await load();
    } catch (disputeError) {
      setError(disputeError instanceof Error ? disputeError.message : "Could not open dispute");
    }
  }

  async function withdraw(listing: MarketplaceListing) {
    if (!token) return;
    try {
      await apiFetch(`/api/marketplace/listings/${listing.id}/withdraw`, { method: "POST", token });
      setMessage(`Listing #${listing.id} withdrawn.`);
      await load();
    } catch (withdrawError) {
      setError(withdrawError instanceof Error ? withdrawError.message : "Could not withdraw listing");
    }
  }

  async function redeem(orderId: number) {
    if (!token) return;
    try {
      await apiFetch(`/api/marketplace/orders/${orderId}/redeem`, { method: "POST", token });
      setMessage(`Order #${orderId} marked redeemed. Verified savings will now include this coupon.`);
      await load();
    } catch (redeemError) {
      setError(redeemError instanceof Error ? redeemError.message : "Could not mark redeemed");
    }
  }

  async function runReminders() {
    if (!token) return;
    try {
      const result = await apiFetch<{ created: number }>("/api/marketplace/reminders/expiry", { method: "POST", token });
      setMessage(result.created > 0 ? `${result.created} expiry reminder(s) created in your notifications.` : "No new expiry reminders needed.");
    } catch (reminderError) {
      setError(reminderError instanceof Error ? reminderError.message : "Could not create reminders");
    }
  }

  async function reportInvalid(item: CouponWalletItem) {
    if (!token) return;
    const reason = window.prompt("Describe why this coupon is invalid. Do not share the code publicly.");
    if (!reason || reason.length < 5) return;
    try {
      await apiFetch("/api/marketplace/reports", {
        method: "POST",
        token,
        body: { listing_id: item.listing_id, order_id: item.order_id, reason },
      });
      setMessage("Invalid-coupon report submitted for admin review.");
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : "Could not submit report");
    }
  }

  async function review(orderId: number) {
    if (!token) return;
    const ratingText = window.prompt("Rate this seller from 1 to 5.");
    const rating = Number(ratingText);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return;
    const comment = window.prompt("Optional review comment") ?? "";
    try {
      await apiFetch("/api/marketplace/reviews", { method: "POST", token, body: { order_id: orderId, rating, comment } });
      setMessage("Verified-purchase review submitted.");
      await load();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Could not submit review");
    }
  }

  const currentDispute = disputes.find((dispute) => dispute.order_id === disputeOrderId);
  const activeListings = seller?.listings ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold"><Store className="h-6 w-6 text-primary" /> Coupon marketplace</h1>
          <p className="mt-1 text-sm text-muted-foreground">Buy, sell, verify and track transferable coupons with encrypted codes, reputation, disputes and sandbox payments.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link href="/dashboard/savings">Savings dashboard</Link></Button>
          <Badge variant="warning">Sandbox payments only</Badge>
        </div>
      </div>

      {message && <Alert className="mt-4" variant="success"><AlertDescription>{message}</AlertDescription></Alert>}
      {error && <Alert className="mt-4" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Gross sandbox sales", value: formatINR(seller?.gross_sales_sandbox ?? 0) },
          { label: "Demo platform fees", value: formatINR(seller?.platform_fees_sandbox ?? 0) },
          { label: "Seller payout", value: formatINR(seller?.earnings_sandbox ?? 0) },
          { label: "Purchased coupons", value: wallet.length },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-5">
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base"><Wallet className="h-4 w-4" /> My coupon wallet</CardTitle>
              <Button size="sm" variant="outline" onClick={() => void runReminders()}><BellRing className="mr-1 h-3 w-3" /> Expiry reminders</Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {wallet.map((item) => (
                <div key={item.order_id} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">Paid {formatINR(item.paid)} · value {formatINR(item.coupon_value)} · saving {formatINR(item.saving)}</p>
                      <p className="text-xs text-muted-foreground">Min order {formatINR(item.min_order)} · redemption: {item.redemption_status}</p>
                      {item.expires_at && (
                        <p className={`text-xs ${item.expiring_soon ? "text-amber-700" : "text-muted-foreground"}`}>
                          Expires {new Date(item.expires_at).toLocaleDateString("en-IN")} {item.expires_in_days !== null ? `(${item.expires_in_days} days)` : ""}
                        </p>
                      )}
                    </div>
                    <Badge variant={item.expiring_soon ? "warning" : "secondary"}>{item.order_status}</Badge>
                  </div>
                  {item.code ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <code className="rounded bg-muted px-2 py-1 text-xs">{item.code}</code>
                      <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard?.writeText(item.code ?? ""); setMessage("Coupon code copied to clipboard."); }}><Copy className="mr-1 h-3 w-3" /> Copy</Button>
                      {item.redemption_status !== "redeemed" && (
                        <Button size="sm" variant="outline" onClick={() => void redeem(item.order_id)}><CheckCircle2 className="mr-1 h-3 w-3" /> Mark redeemed</Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => void reportInvalid(item)}><AlertTriangle className="mr-1 h-3 w-3" /> Report invalid</Button>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">No stored code for this listing. Contact the seller through the dispute flow if agreed delivery was manual.</p>
                  )}
                  {item.redemption_instructions && <p className="mt-2 text-xs text-muted-foreground">Instructions: {item.redemption_instructions}</p>}
                  {item.usage_restrictions && <p className="mt-1 text-xs text-muted-foreground">Restrictions: {item.usage_restrictions}</p>}
                </div>
              ))}
              {wallet.length === 0 && <p className="text-sm text-muted-foreground">No purchased coupons yet. Codes appear here only after an authorised purchase.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid gap-2 pt-5 sm:grid-cols-4">
              <div className="space-y-1 sm:col-span-2"><Label htmlFor="market-q">Search</Label><Input id="market-q" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Retailer, brand or coupon" /></div>
              <div className="space-y-1"><Label htmlFor="market-category">Category</Label>
                <select id="market-category" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={category} onChange={(event) => setCategory(event.target.value)}>
                  <option value="">All</option>
                  {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div className="space-y-1"><Label htmlFor="market-sort">Sort</Label>
                <select id="market-sort" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={sort} onChange={(event) => setSort(event.target.value)}>
                  <option value="newest">Newest</option>
                  <option value="expiry">Expiry</option>
                  <option value="discount">Discount</option>
                  <option value="price">Selling price</option>
                </select>
              </div>
              <div className="space-y-1"><Label htmlFor="market-max">Max price</Label><Input id="market-max" type="number" min={0} value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} /></div>
            </CardContent>
          </Card>

          <h2 className="text-xl font-bold">Approved listings</h2>
          {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading listings...</p>}
          {listings.map((listing) => (
            <Card key={listing.id}>
              <CardContent className="space-y-2 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{listing.title}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary">{listing.category}</Badge>
                    {listing.retailer_name && <Badge variant="outline">{listing.retailer_name}</Badge>}
                    <Badge variant={listing.is_transfer_allowed ? "success" : "destructive"}>
                      {listing.is_transfer_allowed ? "Transfer permitted" : "Transfer prohibited"}
                    </Badge>
                    {listing.seller_verified && <Badge variant="success">Verified seller</Badge>}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{listing.description}</p>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                  <p>Coupon value <span className="font-medium text-foreground">{formatINR(listing.coupon_value ?? 0)}</span></p>
                  <p>Est. saving <span className="font-medium text-foreground">{formatINR(listing.estimated_saving ?? 0)}</span></p>
                  <p>Min order <span className="font-medium text-foreground">{formatINR(listing.min_order ?? 0)}</span></p>
                  <p>Seller score <span className="font-medium text-foreground">{listing.seller_reputation ?? "unrated"}</span></p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xl font-bold text-primary">{formatINR(listing.price)}</p>
                    <p className="text-xs text-muted-foreground">
                      Expires {listing.expires_at ? new Date(listing.expires_at).toLocaleDateString("en-IN") : "not specified"} · seller {listing.seller_name ?? `#${listing.seller_id}`} · code {listing.coupon_code_masked ?? "manual delivery"}
                    </p>
                  </div>
                  <Button onClick={() => void buy(listing)} disabled={!listing.is_transfer_allowed || Boolean(listing.expired)}>
                    <ShoppingBag className="mr-1 h-4 w-4" /> Buy (sandbox)
                  </Button>
                </div>
                {listing.usage_restrictions && <p className="text-xs text-muted-foreground">Restrictions: {listing.usage_restrictions}</p>}
                {listing.applicable_products && listing.applicable_products.length > 0 && <p className="text-xs text-muted-foreground">Applies to: {listing.applicable_products.join(", ")}</p>}
                {listing.proof_url && <a href={listing.proof_url} target="_blank" rel="noopener noreferrer nofollow" className="text-xs text-primary hover:underline">View seller proof</a>}
              </CardContent>
            </Card>
          ))}
          {!loading && listings.length === 0 && (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No approved listings match your filters.</CardContent></Card>
          )}

          <h2 className="pt-4 text-xl font-bold">Your marketplace orders</h2>
          {orders.map((order) => {
            const dispute = disputes.find((item) => item.order_id === order.id);
            const canDispute = !dispute && (order.status === "paid_sandbox" || order.status === "completed") && order.redemption_status !== "redeemed";
            const canReview = order.role === "buyer" && (order.status === "paid_sandbox" || order.status === "completed");
            return (
              <Card key={order.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-3 pt-5 text-sm">
                  <div>
                    <p className="font-medium">#{order.id} {order.listing_title ?? `Listing ${order.listing_id}`}</p>
                    <p className="text-xs text-muted-foreground">{order.role} · {order.payment_provider} · {new Date(order.created_at).toLocaleString("en-IN")}</p>
                    {order.role === "seller" && order.platform_fee !== undefined && (
                      <p className="text-xs text-muted-foreground">Fee {formatINR(order.platform_fee)} · payout {formatINR(order.seller_payout ?? 0)}</p>
                    )}
                    {order.redemption_status && <p className="text-xs text-muted-foreground">Redemption: {order.redemption_status}</p>}
                    {order.refunded_at && <p className="text-xs text-emerald-700">Sandbox refund recorded {new Date(order.refunded_at).toLocaleString("en-IN")}</p>}
                    {dispute && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                        <AlertTriangle className="h-3 w-3" /> Dispute #{dispute.id}: {dispute.status}
                        {dispute.resolution ? ` — ${dispute.resolution}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <p className="font-semibold">{formatINR(order.amount)}</p>
                    <Badge variant={order.status === "refunded" ? "success" : order.status === "disputed" ? "warning" : "secondary"}>{order.status}</Badge>
                    {canDispute && (
                      <Button size="sm" variant="outline" onClick={() => { setDisputeOrderId(order.id); setDisputeReason(""); setDisputeEvidence(""); }}>Report issue</Button>
                    )}
                    {canReview && <Button size="sm" variant="ghost" onClick={() => void review(order.id)}><Star className="mr-1 h-3 w-3" /> Leave review</Button>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {orders.length === 0 && <p className="text-sm text-muted-foreground">No marketplace orders yet.</p>}

          {disputeOrderId !== null && (
            <Card>
              <CardHeader><CardTitle className="text-base">Open a dispute for order #{disputeOrderId}</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={createDispute} className="space-y-2">
                  <div className="space-y-1">
                    <Label htmlFor="dispute-reason">What went wrong?</Label>
                    <Textarea id="dispute-reason" required minLength={5} value={disputeReason} onChange={(event) => setDisputeReason(event.target.value)} placeholder="Describe the issue without sharing raw payment credentials." />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="dispute-evidence">Evidence URL (optional)</Label>
                    <Input id="dispute-evidence" value={disputeEvidence} onChange={(event) => setDisputeEvidence(event.target.value)} placeholder="https://..." />
                  </div>
                  {currentDispute && <p className="text-xs text-amber-700">This order already has dispute #{currentDispute.id} in {currentDispute.status} state.</p>}
                  <div className="flex gap-2">
                    <Button type="submit" disabled={currentDispute !== undefined}>Submit dispute</Button>
                    <Button type="button" variant="ghost" onClick={() => setDisputeOrderId(null)}>Cancel</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Wallet className="h-4 w-4" /> Seller workspace</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {seller ? (
                <>
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center justify-between"><p className="font-medium">{seller.seller.display_name}</p><Badge variant={seller.seller.status === "approved" ? "success" : "warning"}>{seller.seller.status}</Badge></div>
                    <p className="text-xs text-muted-foreground">Sandbox payout {formatINR(seller.earnings_sandbox)} · rating {seller.seller.review_count ? `${seller.seller.rating ?? "—"} (${seller.seller.review_count})` : "unrated"} · sales {seller.seller.total_sales}</p>
                    <p className="text-xs text-muted-foreground">Reputation score {seller.seller.reputation?.score ?? "—"} · disputes {seller.seller.reputation?.dispute_count ?? 0}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{seller.note}</p>
                  </div>
                  {seller.seller.status === "approved" ? (
                    <form onSubmit={createListing} className="space-y-2">
                      <div className="space-y-1"><Label htmlFor="listing-title">Title</Label><Input id="listing-title" required value={title} onChange={(event) => setTitle(event.target.value)} /></div>
                      <div className="space-y-1"><Label htmlFor="listing-description">Description</Label><Textarea id="listing-description" value={description} onChange={(event) => setDescription(event.target.value)} /></div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1"><Label htmlFor="listing-price">Selling price (₹)</Label><Input id="listing-price" type="number" min={1} required value={price} onChange={(event) => setPrice(event.target.value)} /></div>
                        <div className="space-y-1"><Label htmlFor="listing-value">Coupon value (₹)</Label><Input id="listing-value" type="number" min={0} value={couponValue} onChange={(event) => setCouponValue(event.target.value)} /></div>
                        <div className="space-y-1"><Label htmlFor="listing-min">Min order (₹)</Label><Input id="listing-min" type="number" min={0} value={minOrder} onChange={(event) => setMinOrder(event.target.value)} /></div>
                        <div className="space-y-1"><Label htmlFor="listing-brand">Brand</Label><Input id="listing-brand" value={brand} onChange={(event) => setBrand(event.target.value)} /></div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1"><Label htmlFor="listing-retailer">Retailer</Label>
                          <select id="listing-retailer" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={retailerId} onChange={(event) => setRetailerId(event.target.value)}>
                            <option value="">Any</option>
                            {retailers.map((retailer) => <option key={retailer.id} value={retailer.id}>{retailer.name}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1"><Label htmlFor="listing-category">Category</Label>
                          <select id="listing-category" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={category || "coupon"} onChange={(event) => setCategory(event.target.value)}>
                            {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="space-y-1"><Label htmlFor="listing-code">Coupon code (encrypted at rest)</Label><Input id="listing-code" required value={couponCode} onChange={(event) => setCouponCode(event.target.value)} placeholder="Never shown publicly" /></div>
                      <div className="space-y-1"><Label htmlFor="listing-products">Applicable products (comma separated)</Label><Input id="listing-products" value={applicableProducts} onChange={(event) => setApplicableProducts(event.target.value)} placeholder="iPhone 15, Samsung S24" /></div>
                      <div className="space-y-1"><Label htmlFor="listing-restrictions">Usage restrictions</Label><Textarea id="listing-restrictions" value={usageRestrictions} onChange={(event) => setUsageRestrictions(event.target.value)} /></div>
                      <div className="space-y-1"><Label htmlFor="listing-instructions">Redemption instructions</Label><Textarea id="listing-instructions" value={redemptionInstructions} onChange={(event) => setRedemptionInstructions(event.target.value)} /></div>
                      <div className="space-y-1"><Label htmlFor="listing-terms">Issuer transfer terms</Label><Textarea id="listing-terms" value={issuerTerms} onChange={(event) => setIssuerTerms(event.target.value)} /></div>
                      <div className="space-y-1"><Label htmlFor="listing-proof">Evidence / proof URL</Label><Input id="listing-proof" value={proofUrl} onChange={(event) => setProofUrl(event.target.value)} /></div>
                      <div className="space-y-1"><Label htmlFor="listing-expiry">Expires at</Label><Input id="listing-expiry" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></div>
                      <label className="flex items-start gap-2 text-xs">
                        <input type="checkbox" className="mt-0.5" checked={transferAllowed} onChange={(event) => setTransferAllowed(event.target.checked)} />
                        <span>I confirm the issuer terms permit transfer/resale and the coupon is unused. Non-transferable coupons cannot be listed.</span>
                      </label>
                      <Button type="submit" className="w-full" disabled={!transferAllowed}>Create pending listing</Button>
                    </form>
                  ) : (
                    <p className="text-xs text-muted-foreground">Your seller application is {seller.seller.status}. Listings require admin approval.</p>
                  )}
                  {activeListings.length > 0 && (
                    <div className="space-y-2 border-t pt-3">
                      <p className="text-xs font-medium">Your listings</p>
                      {activeListings.map((listing) => (
                        <div key={listing.id} className="rounded-lg border p-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{listing.title}</span>
                            <Badge variant={listing.status === "approved" ? "success" : listing.status === "pending" ? "warning" : "secondary"}>{listing.status}</Badge>
                          </div>
                          <p className="mt-1 text-muted-foreground">{formatINR(listing.price)} · value {formatINR(listing.coupon_value ?? 0)} · transfer {listing.is_transfer_allowed ? "allowed" : "prohibited"}</p>
                          {listing.rejection_reason && <p className="mt-1 text-destructive">Reason: {listing.rejection_reason}</p>}
                          {["pending", "approved", "rejected"].includes(listing.status) && (
                            <Button size="sm" variant="ghost" className="mt-1 h-7 px-2" onClick={() => void withdraw(listing)}>Withdraw</Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {seller.reviews && seller.reviews.length > 0 && (
                    <div className="space-y-1 border-t pt-3 text-xs">
                      <p className="font-medium">Recent buyer reviews</p>
                      {seller.reviews.slice(0, 5).map((item) => (
                        <p key={item.id} className="text-muted-foreground"><Star className="mr-1 inline h-3 w-3" /> {item.rating}/5 — {item.comment || "No comment"}</p>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <form onSubmit={applySeller} className="space-y-2">
                  <p className="text-sm text-muted-foreground">Apply to become a verified coupon seller. Admin approval is required.</p>
                  <div className="space-y-1"><Label htmlFor="seller-name">Display name</Label><Input id="seller-name" required value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></div>
                  <div className="space-y-1"><Label htmlFor="seller-bio">Bio</Label><Textarea id="seller-bio" value={bio} onChange={(event) => setBio(event.target.value)} /></div>
                  <div className="space-y-1"><Label htmlFor="seller-verification">Verification evidence URL</Label><Input id="seller-verification" value={verificationUrl} onChange={(event) => setVerificationUrl(event.target.value)} placeholder="https://..." /></div>
                  <Button type="submit" className="w-full">Apply as seller</Button>
                </form>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" /> Marketplace safety</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <p>Sandbox provider only. No real money moves and no settlement is claimed.</p>
              <p>Coupon codes are encrypted at rest, masked in public APIs and decrypted only for the buyer of a paid order.</p>
              <p>Raw card, CVV, UPI PIN or bank credentials are rejected by the API.</p>
              <p>Non-transferable coupons cannot be approved. Disputes are reviewed by an admin with sandbox-only refunds.</p>
              <p className="flex items-center gap-1"><PackageCheck className="h-3 w-3" /> Redeemed coupons count as verified savings; other estimates are labelled separately.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
