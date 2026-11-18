"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, Loader2, Trash2 } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { formatINR } from "@/lib/format";
import type { Alert, Product, SearchResponse } from "@/lib/types";

export default function AlertsPage() {
  const { token } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [variantId, setVariantId] = useState<number | null>(null);
  const [target, setTarget] = useState("");
  const [channel, setChannel] = useState("in_app");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const payload = await apiFetch<{ items: Alert[] }>("/api/alerts", { token });
      setAlerts(payload.items);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Could not load alerts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function searchProducts() {
    try {
      const payload = await apiFetch<SearchResponse>(`/api/products?q=${encodeURIComponent(query)}&limit=8`);
      setMatches(payload.items);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Product search failed");
    }
  }

  function choose(product: Product) {
    setSelected(product);
    setVariantId(product.variants[0]?.id ?? null);
    setMatches([]);
    setQuery(product.name);
  }

  async function createAlert(event: React.FormEvent) {
    event.preventDefault();
    if (!token || !selected) return;
    setNotice(null);
    setError(null);
    try {
      await apiFetch("/api/alerts", {
        method: "POST",
        token,
        body: {
          product_id: selected.id,
          variant_id: variantId,
          target_price: Number(target),
          channel,
        },
      });
      setNotice(
        channel === "in_app"
          ? "Alert created. In-app delivery is configured; the alert worker checks prices when run."
          : `Alert saved with channel ${channel}. External delivery requires server credentials and is not guaranteed.`,
      );
      setTarget("");
      setSelected(null);
      setQuery("");
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create alert");
    }
  }

  async function remove(id: number) {
    if (!token) return;
    try {
      await apiFetch(`/api/alerts/${id}`, { method: "DELETE", token });
      setAlerts((current) => current.filter((alert) => alert.id !== id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete alert");
    }
  }

  return (
    <div>
      <h1 className="flex items-center gap-2 text-3xl font-bold"><BellRing className="h-6 w-6 text-primary" /> Price alerts</h1>
      <p className="mt-1 text-sm text-muted-foreground">Track an exact product variant against your target price.</p>

      {notice && <p className="mt-4 rounded-lg border bg-card p-3 text-sm">{notice}</p>}
      {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <div className="mt-5 grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader><CardTitle className="text-base">Create an alert</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={createAlert} className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="product-search" className="text-sm font-medium">Find product</label>
                <div className="flex gap-2">
                  <Input id="product-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. iPhone 15" />
                  <Button type="button" variant="outline" onClick={() => void searchProducts()}>Find</Button>
                </div>
                {matches.length > 0 && (
                  <div className="rounded-lg border">
                    {matches.map((product) => (
                      <button key={product.id} type="button" onClick={() => choose(product)} className="block w-full border-b px-3 py-2 text-left text-xs last:border-b-0 hover:bg-muted">
                        <span className="font-medium">{product.name}</span>
                        <span className="ml-1 text-muted-foreground">{product.brand}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selected && (
                <>
                  <div className="rounded-lg bg-muted p-3 text-sm">
                    <p className="font-medium">{selected.name}</p>
                    <p className="text-xs text-muted-foreground">Selected product #{selected.id}</p>
                  </div>
                  {selected.variants.length > 0 && (
                    <div className="space-y-1.5">
                      <label htmlFor="variant" className="text-sm font-medium">Variant</label>
                      <select id="variant" className="h-10 w-full rounded-lg border bg-card px-3 text-sm" value={variantId ?? ""} onChange={(event) => setVariantId(Number(event.target.value))}>
                        {selected.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name}</option>)}
                      </select>
                    </div>
                  )}
                </>
              )}

              <div className="space-y-1.5">
                <label htmlFor="target" className="text-sm font-medium">Target price (₹)</label>
                <Input id="target" type="number" min={1} required value={target} onChange={(event) => setTarget(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="channel" className="text-sm font-medium">Channel</label>
                <select id="channel" className="h-10 w-full rounded-lg border bg-card px-3 text-sm" value={channel} onChange={(event) => setChannel(event.target.value)}>
                  <option value="in_app">In-app (configured)</option>
                  <option value="email">Email (provider required)</option>
                  <option value="telegram">Telegram (credentials required)</option>
                  <option value="whatsapp">WhatsApp (credentials required)</option>
                </select>
              </div>
              <Button type="submit" className="w-full" disabled={!selected}>Create alert</Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading alerts...</p>}
          {alerts.map((alert) => (
            <Card key={alert.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
                <div>
                  <div className="flex gap-1.5">
                    <Badge variant={alert.status === "active" ? "success" : "secondary"}>{alert.status}</Badge>
                    <Badge variant="outline">{alert.channel}</Badge>
                  </div>
                  <p className="mt-1 text-sm">Product #{alert.product_id}{alert.variant_id ? ` · variant #${alert.variant_id}` : ""}</p>
                  <p className="text-xs text-muted-foreground">Created {new Date(alert.created_at).toLocaleString("en-IN")}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-bold text-primary">{formatINR(alert.target_price)}</p>
                  <Button variant="ghost" size="icon" aria-label="Delete alert" onClick={() => void remove(alert.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {!loading && alerts.length === 0 && (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No alerts yet. Create one on the left, or from a product page.</CardContent></Card>
          )}
        </div>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Alert checks run through the backend alert worker/admin trigger. <Link href="/dashboard/notifications" className="text-primary hover:underline">See notification delivery status</Link>.
      </p>
    </div>
  );
}
