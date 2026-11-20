"use client";

import { useEffect, useState } from "react";
import { Loader2, Store } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { formatINR } from "@/lib/format";

type Listing = { id: number; seller_id: number; title: string; price: number; status: string; category: string; proof_url: string | null; is_transfer_allowed: boolean; coupon_value?: number; usage_status?: string; created_at: string };
type Seller = { id: number; user_id: number; display_name: string; status: string; rating: number | null; total_sales: number; is_verified?: boolean; review_count?: number; dispute_count?: number };
type Dispute = { id: number; order_id: number; opened_by: number; reason: string; evidence_url: string | null; status: string; resolution: string | null; created_at: string };
type Report = { id: number; listing_id: number; order_id: number | null; reporter_id: number; reason: string; evidence_url: string | null; status: string; resolution: string; created_at: string };

export default function AdminMarketplacePage() {
  const { token } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const [listingPayload, sellerPayload, disputePayload, reportPayload] = await Promise.all([
        apiFetch<{ items: Listing[] }>("/api/admin/marketplace/listings", { token }),
        apiFetch<{ items: Seller[] }>("/api/admin/marketplace/sellers", { token }),
        apiFetch<{ items: Dispute[] }>("/api/admin/marketplace/disputes", { token }),
        apiFetch<{ items: Report[] }>("/api/admin/marketplace/reports", { token }).catch(() => ({ items: [] })),
      ]);
      setListings(listingPayload.items);
      setSellers(sellerPayload.items);
      setDisputes(disputePayload.items);
      setReports(reportPayload.items);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Could not load marketplace moderation data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function moderateListing(listing: Listing, status: "approved" | "rejected" | "pending") {
    if (!token) return;
    try {
      await apiFetch(`/api/admin/marketplace/listings/${listing.id}`, { method: "PATCH", token, body: { status, note: `Admin ${status}` } });
      setMessage(`Listing #${listing.id} marked ${status}.`);
      await load();
    } catch (moderationError) {
      setError(moderationError instanceof Error ? moderationError.message : "Could not moderate listing");
    }
  }

  async function moderateSeller(seller: Seller, status: "approved" | "rejected" | "pending") {
    if (!token) return;
    try {
      await apiFetch(`/api/admin/marketplace/sellers/${seller.id}`, { method: "PATCH", token, body: { status, note: `Admin ${status}` } });
      setMessage(`Seller #${seller.id} marked ${status}.`);
      await load();
    } catch (moderationError) {
      setError(moderationError instanceof Error ? moderationError.message : "Could not moderate seller");
    }
  }

  async function resolveReport(report: Report) {
    if (!token) return;
    const status = window.prompt("Resolution status: resolved_valid, resolved_invalid or dismissed", "resolved_invalid");
    if (status !== "resolved_valid" && status !== "resolved_invalid" && status !== "dismissed") return;
    const resolution = window.prompt("Resolution note:", "Reviewed by admin.");
    if (!resolution) return;
    try {
      await apiFetch(`/api/admin/marketplace/reports/${report.id}/resolve`, { method: "POST", token, body: { status, resolution } });
      setMessage(`Report #${report.id} resolved as ${status}. Invalid coupons suspend the listing.`);
      await load();
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : "Could not resolve report");
    }
  }

  async function resolveDispute(dispute: Dispute) {
    if (!token) return;
    const status = window.prompt("Resolution status: resolved_refunded or resolved_rejected", "resolved_refunded");
    if (status !== "resolved_refunded" && status !== "resolved_rejected") return;
    const resolution = window.prompt("Resolution note:", "Sandbox dispute reviewed by admin.");
    if (!resolution) return;
    try {
      await apiFetch(`/api/admin/marketplace/disputes/${dispute.id}/resolve`, {
        method: "POST",
        token,
        body: { status, resolution },
      });
      setMessage(`Dispute #${dispute.id} resolved as ${status}.`);
      await load();
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : "Could not resolve dispute");
    }
  }

  return (
    <div>
      <h1 className="flex items-center gap-2 text-3xl font-bold"><Store className="h-6 w-6 text-primary" /> Marketplace moderation</h1>
      <p className="mt-1 text-sm text-muted-foreground">Approve seller and listing records, and resolve sandbox disputes. Payments remain sandbox-only.</p>

      {message && <p className="mt-3 rounded-lg border bg-card p-3 text-sm">{message}</p>}
      {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {loading && <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</p>}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Listings ({listings.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {listings.map((listing) => (
              <div key={listing.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">#{listing.id} {listing.title}</p>
                  <Badge variant={listing.status === "approved" ? "success" : listing.status === "pending" ? "warning" : "secondary"}>{listing.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Seller #{listing.seller_id} · {formatINR(listing.price)} · value {formatINR(listing.coupon_value ?? 0)} · usage {listing.usage_status ?? "unused"}</p>
                <p className="text-xs text-muted-foreground">Transfer {listing.is_transfer_allowed ? "allowed" : "prohibited"}</p>
                {listing.proof_url && <a href={listing.proof_url} target="_blank" rel="noopener noreferrer nofollow" className="text-xs text-primary hover:underline">Proof</a>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => void moderateListing(listing, "approved")}>Approve</Button>
                  <Button size="sm" variant="ghost" onClick={() => void moderateListing(listing, "rejected")}>Reject</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Sellers ({sellers.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {sellers.map((seller) => (
              <div key={seller.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">#{seller.id} {seller.display_name}</p>
                  <Badge variant={seller.status === "approved" ? "success" : seller.status === "pending" ? "warning" : "secondary"}>{seller.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">User #{seller.user_id} · rating {seller.review_count ? seller.rating : "unrated"} · sales {seller.total_sales} · disputes {seller.dispute_count ?? 0}</p>
                <p className="text-xs text-muted-foreground">Verified {seller.is_verified ? "yes" : "no"} · reviews {seller.review_count ?? 0}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => void moderateSeller(seller, "approved")}>Approve</Button>
                  <Button size="sm" variant="ghost" onClick={() => void moderateSeller(seller, "rejected")}>Reject</Button>
                </div>
              </div>
            ))}
            {sellers.length === 0 && <p className="text-sm text-muted-foreground">No seller profiles.</p>}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle className="text-base">Invalid-coupon reports ({reports.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {reports.map((report) => (
            <div key={report.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Report #{report.id} · listing #{report.listing_id}</p>
                <Badge variant={report.status === "open" ? "warning" : "secondary"}>{report.status}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{report.reason}</p>
              <p className="text-xs text-muted-foreground">Reporter #{report.reporter_id} · {new Date(report.created_at).toLocaleString("en-IN")}</p>
              {report.resolution && <p className="text-xs">Resolution: {report.resolution}</p>}
              {report.status === "open" && <Button size="sm" variant="outline" className="mt-2" onClick={() => void resolveReport(report)}>Resolve report</Button>}
            </div>
          ))}
          {reports.length === 0 && <p className="text-sm text-muted-foreground">No reports.</p>}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle className="text-base">Disputes ({disputes.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {disputes.map((dispute) => (
            <div key={dispute.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Dispute #{dispute.id} · order #{dispute.order_id}</p>
                <Badge variant={dispute.status === "open" ? "warning" : "secondary"}>{dispute.status}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{dispute.reason}</p>
              <p className="text-xs text-muted-foreground">Opened by user #{dispute.opened_by} · {new Date(dispute.created_at).toLocaleString("en-IN")}</p>
              {dispute.resolution && <p className="text-xs">Resolution: {dispute.resolution}</p>}
              {dispute.status === "open" && <Button size="sm" variant="outline" className="mt-2" onClick={() => void resolveDispute(dispute)}>Resolve</Button>}
            </div>
          ))}
          {disputes.length === 0 && <p className="text-sm text-muted-foreground">No disputes.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
