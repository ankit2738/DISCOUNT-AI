"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, ShieldCheck, ShoppingBag, Store, Wallet } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import { formatINR } from "@/lib/format";
import type {
  MarketplaceDispute,
  MarketplaceListing,
  MarketplaceOrder,
  SellerWorkspace,
} from "@/lib/types";

export default function MarketplacePage() {
  const { token, user } = useAuth();
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [seller, setSeller] = useState<SellerWorkspace | null>(null);
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [disputes, setDisputes] = useState<MarketplaceDispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [transferAllowed, setTransferAllowed] = useState(false);

  const [disputeOrderId, setDisputeOrderId] = useState<number | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeEvidence, setDisputeEvidence] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listingPayload, sellerPayload, orderPayload, disputePayload] = await Promise.all([
        apiFetch<{ items: MarketplaceListing[]; note: string }>("/api/marketplace/listings?limit=100"),
        token
          ? apiFetch<SellerWorkspace>("/api/marketplace/seller/me", { token }).catch(() => null)
          : Promise.resolve(null),
        token
          ? apiFetch<{ items: MarketplaceOrder[] }>("/api/marketplace/orders", { token }).catch(() => ({ items: [] }))
          : Promise.resolve({ items: [] }),
        token
          ? apiFetch<{ items: MarketplaceDispute[] }>("/api/marketplace/disputes", { token }).catch(() => ({ items: [] }))
          : Promise.resolve({ items: [] }),
      ]);
      setListings(listingPayload.items);
      setSeller(sellerPayload);
      setOrders(orderPayload.items);
      setDisputes(disputePayload.items);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Could not load marketplace");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function applySeller(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    try {
      await apiFetch("/api/marketplace/seller/apply", { method: "POST", token, body: { display_name: displayName, bio } });
      setMessage("Seller application submitted for admin approval.");
      setDisplayName("");
      setBio("");
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
    try {
      await apiFetch("/api/marketplace/listings", {
        method: "POST",
        token,
        body: {
          title,
          description,
          category: "coupon",
          price: Number(price),
          proof_url: proofUrl || null,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          is_transfer_allowed: transferAllowed,
        },
      });
      setMessage("Listing created and pending admin verification.");
      setTitle("");
      setDescription("");
      setPrice("");
      setProofUrl("");
      setExpiresAt("");
      setTransferAllowed(false);
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

  const currentDispute = disputes.find((dispute) => dispute.order_id === disputeOrderId);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold"><Store className="h-6 w-6 text-primary" /> Coupon marketplace</h1>
          <p className="mt-1 text-sm text-muted-foreground">Buyer and seller flows with proof, moderation, disputes and sandbox-only payments.</p>
        </div>
        <Badge variant="warning">Sandbox payments only</Badge>
      </div>

      {message && <Alert className="mt-4" variant="success"><AlertDescription>{message}</AlertDescription></Alert>}
      {error && <Alert className="mt-4" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Gross sandbox sales", value: formatINR(seller?.gross_sales_sandbox ?? 0) },
          { label: "Demo platform fees", value: formatINR(seller?.platform_fees_sandbox ?? 0) },
          { label: "Seller payout", value: formatINR(seller?.earnings_sandbox ?? 0) },
          { label: "Refunded orders", value: seller?.refunded_orders ?? 0 },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-5">
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          <h2 className="text-xl font-bold">Approved listings</h2>
          {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading listings...</p>}
          {listings.map((listing) => (
            <Card key={listing.id}>
              <CardContent className="space-y-2 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{listing.title}</p>
                  <div className="flex gap-1.5">
                    <Badge variant="secondary">{listing.category}</Badge>
                    <Badge variant={listing.is_transfer_allowed ? "success" : "destructive"}>
                      {listing.is_transfer_allowed ? "Transfer permitted" : "Transfer prohibited"}
                    </Badge>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{listing.description}</p>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xl font-bold text-primary">{formatINR(listing.price)}</p>
                    <p className="text-xs text-muted-foreground">
                      Expires {listing.expires_at ? new Date(listing.expires_at).toLocaleDateString("en-IN") : "not specified"} · seller #{listing.seller_id}
                    </p>
                  </div>
                  <Button onClick={() => void buy(listing)} disabled={!listing.is_transfer_allowed}>
                    <ShoppingBag className="mr-1 h-4 w-4" /> Buy (sandbox)
                  </Button>
                </div>
                {listing.proof_url && <a href={listing.proof_url} target="_blank" rel="noopener noreferrer nofollow" className="text-xs text-primary hover:underline">View seller proof</a>}
              </CardContent>
            </Card>
          ))}
          {!loading && listings.length === 0 && (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No approved listings yet.</CardContent></Card>
          )}

          <h2 className="pt-4 text-xl font-bold">Your marketplace orders</h2>
          {orders.map((order) => {
            const dispute = disputes.find((item) => item.order_id === order.id);
            const canDispute = !dispute && (order.status === "paid_sandbox" || order.status === "completed");
            return (
              <Card key={order.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-3 pt-5 text-sm">
                  <div>
                    <p className="font-medium">#{order.id} {order.listing_title ?? `Listing ${order.listing_id}`}</p>
                    <p className="text-xs text-muted-foreground">{order.role} · {order.payment_provider} · {new Date(order.created_at).toLocaleString("en-IN")}</p>
                    {order.role === "seller" && order.platform_fee !== undefined && (
                      <p className="text-xs text-muted-foreground">Fee {formatINR(order.platform_fee)} · payout {formatINR(order.seller_payout ?? 0)}</p>
                    )}
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
                      <Button size="sm" variant="outline" onClick={() => {
                        setDisputeOrderId(order.id);
                        setDisputeReason("");
                        setDisputeEvidence("");
                      }}>Report issue</Button>
                    )}
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
                    <p className="text-xs text-muted-foreground">Sandbox payout {formatINR(seller.earnings_sandbox)} · rating {seller.seller.rating ?? "—"} · sales {seller.seller.total_sales}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{seller.note}</p>
                  </div>
                  {seller.seller.status === "approved" ? (
                    <form onSubmit={createListing} className="space-y-2">
                      <div className="space-y-1"><Label htmlFor="listing-title">Title</Label><Input id="listing-title" required value={title} onChange={(event) => setTitle(event.target.value)} /></div>
                      <div className="space-y-1"><Label htmlFor="listing-description">Description</Label><Textarea id="listing-description" value={description} onChange={(event) => setDescription(event.target.value)} /></div>
                      <div className="space-y-1"><Label htmlFor="listing-price">Price (₹)</Label><Input id="listing-price" type="number" min={1} required value={price} onChange={(event) => setPrice(event.target.value)} /></div>
                      <div className="space-y-1"><Label htmlFor="listing-proof">Proof URL</Label><Input id="listing-proof" value={proofUrl} onChange={(event) => setProofUrl(event.target.value)} /></div>
                      <div className="space-y-1"><Label htmlFor="listing-expiry">Expires at</Label><Input id="listing-expiry" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></div>
                      <label className="flex items-start gap-2 text-xs">
                        <input type="checkbox" className="mt-0.5" checked={transferAllowed} onChange={(event) => setTransferAllowed(event.target.checked)} />
                        <span>Issuer terms permit transfer/resale of this coupon. Listings without verified permission stay non-transferable.</span>
                      </label>
                      <Button type="submit" className="w-full">Create pending listing</Button>
                    </form>
                  ) : (
                    <p className="text-xs text-muted-foreground">Your seller application is {seller.seller.status}. Listings require admin approval.</p>
                  )}
                  {seller.listings.length > 0 && (
                    <div className="space-y-2 border-t pt-3">
                      <p className="text-xs font-medium">Your listings</p>
                      {seller.listings.map((listing) => (
                        <div key={listing.id} className="rounded-lg border p-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{listing.title}</span>
                            <Badge variant={listing.status === "approved" ? "success" : listing.status === "pending" ? "warning" : "secondary"}>{listing.status}</Badge>
                          </div>
                          <p className="mt-1 text-muted-foreground">{formatINR(listing.price)} · transfer {listing.is_transfer_allowed ? "allowed" : "prohibited"}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <form onSubmit={applySeller} className="space-y-2">
                  <p className="text-sm text-muted-foreground">Apply to become a verified coupon seller. Admin approval is required.</p>
                  <div className="space-y-1"><Label htmlFor="seller-name">Display name</Label><Input id="seller-name" required value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></div>
                  <div className="space-y-1"><Label htmlFor="seller-bio">Bio</Label><Textarea id="seller-bio" value={bio} onChange={(event) => setBio(event.target.value)} /></div>
                  <Button type="submit" className="w-full">Apply as seller</Button>
                </form>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" /> Marketplace safety</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <p>Sandbox provider only. No real money moves and no settlement is claimed.</p>
              <p>Raw card, CVV, UPI PIN or bank credentials are rejected by the API.</p>
              <p>Do not buy coupons whose issuer terms prohibit transfer. Disputes are reviewed by an admin with sandbox-only refunds.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
