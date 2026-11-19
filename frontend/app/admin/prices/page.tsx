"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IndianRupee, Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { formatINR } from "@/lib/format";
import type { Listing } from "@/lib/types";

function PriceRow({ listing, token, onSaved }: { listing: Listing; token: string | null; onSaved: () => Promise<void> }) {
  const [price, setPrice] = useState(String(listing.price));
  const [availability, setAvailability] = useState(listing.availability);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    if (!token) return;
    setSaving(true);
    setMessage(null);
    try {
      await apiFetch(`/api/admin/listings/${listing.id}/price`, {
        method: "PATCH",
        token,
        body: { price: Number(price), availability },
      });
      setMessage("Saved with a new price-history point.");
      await onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save price");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">#{listing.id} {listing.product_name ?? listing.title}</p>
          <p className="text-xs text-muted-foreground">{listing.retailer?.name} · {listing.variant?.name ?? "variant"} · MRP {formatINR(listing.mrp)} · delivery {formatINR(listing.delivery_charge)}</p>
          <p className="text-[11px] text-muted-foreground">Checked {new Date(listing.last_checked_at).toLocaleString("en-IN")} · source {listing.source}</p>
        </div>
        <div className="flex gap-1.5">
          {listing.is_demo && <Badge variant="warning">Demo</Badge>}
          <Badge variant="secondary">{listing.availability.replaceAll("_", " ")}</Badge>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div>
          <label className="text-[11px] text-muted-foreground" htmlFor={`admin-price-${listing.id}`}>Current listing price</label>
          <Input id={`admin-price-${listing.id}`} className="h-8 w-32 text-xs" type="number" min={1} value={price} onChange={(event) => setPrice(event.target.value)} />
        </div>
        <Select aria-label="Availability" className="h-8 w-40 text-xs" value={availability} onChange={(event) => setAvailability(event.target.value)}>
          <option value="in_stock">in stock</option>
          <option value="limited">limited</option>
          <option value="out_of_stock">out of stock</option>
        </Select>
        <Button size="sm" onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Save observation</Button>
        {message && <span className="text-[11px] text-muted-foreground">{message}</span>}
      </div>
    </div>
  );
}

export default function AdminPricesPage() {
  const { token } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [retailer, setRetailer] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<{ items: Listing[] }>("/api/admin/listings?limit=500", { token });
      setListings(payload.items);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Could not load price records");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const retailers = useMemo(
    () => Array.from(new Map(listings.filter((listing) => listing.retailer).map((listing) => [listing.retailer!.id, listing.retailer!])).values()),
    [listings],
  );
  const filtered = listings.filter((listing) => {
    const term = query.trim().toLowerCase();
    const matchesQuery = !term || `${listing.product_name ?? ""} ${listing.title} ${listing.variant?.name ?? ""}`.toLowerCase().includes(term);
    return matchesQuery && (!retailer || String(listing.retailer?.id) === retailer);
  });

  return (
    <div>
      <h1 className="flex items-center gap-2 text-3xl font-bold"><IndianRupee className="h-6 w-6 text-primary" /> Price records</h1>
      <p className="mt-1 text-sm text-muted-foreground">Record manual observations with explicit source context. The API writes an audit event and price-history point for each change.</p>

      {error && <Alert className="mt-4" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <Card className="mt-5">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Listing observations ({filtered.length}/{listings.length})</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Input className="h-9 w-56" placeholder="Filter by product..." value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Filter price records" />
              <Select className="h-9 w-44" value={retailer} onChange={(event) => setRetailer(event.target.value)} aria-label="Filter by retailer">
                <option value="">All retailers</option>
                {retailers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading price records...</p>}
          {filtered.map((listing) => <PriceRow key={listing.id} listing={listing} token={token} onSaved={load} />)}
          {!loading && filtered.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No matching price records.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
