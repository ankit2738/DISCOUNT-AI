"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Store } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import type { Retailer } from "@/lib/types";

type Adapter = {
  slug: string;
  name: string;
  integration_status: string;
  live_ready: boolean;
  demo_data: boolean;
  requires_credentials: string[];
  note: string;
};

export default function AdminRetailersPage() {
  const { token } = useAuth();
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [adapters, setAdapters] = useState<Adapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [website, setWebsite] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<{ items: Retailer[]; adapters: Adapter[] }>("/api/admin/retailers", { token });
      setRetailers(payload.items);
      setAdapters(payload.adapters);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Could not load retailers");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(retailer: Retailer) {
    if (!token) return;
    const next = retailer.integration_status === "live" ? "demo" : "live";
    setError(null);
    try {
      await apiFetch(`/api/admin/retailers/${retailer.id}`, { method: "PATCH", token, body: { integration_status: next } });
      setMessage(`${retailer.name} marked ${next}. Live status still requires configured credentials and a working adapter.`);
      await load();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update retailer");
    }
  }

  async function refreshDemo(retailer: Retailer) {
    if (!token) return;
    setError(null);
    try {
      const response = await apiFetch<{ updated_listings: number; note: string }>(`/api/admin/retailers/${retailer.slug}/refresh-demo`, { method: "POST", token });
      setMessage(`${retailer.name}: ${response.updated_listings} demo listings refreshed. ${response.note}`);
      await load();
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Could not refresh demo prices");
    }
  }

  async function createRetailer(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    try {
      await apiFetch("/api/admin/retailers", {
        method: "POST",
        token,
        body: { name, slug, website, adapter_key: "demo", integration_status: "demo" },
      });
      setMessage(`Retailer ${name} created in demo mode.`);
      setName("");
      setSlug("");
      setWebsite("");
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create retailer");
    }
  }

  return (
    <div>
      <h1 className="flex items-center gap-2 text-3xl font-bold"><Store className="h-6 w-6 text-primary" /> Retailers & adapters</h1>
      <p className="mt-1 text-sm text-muted-foreground">Integration status is shown honestly. Demo data is labelled and is never presented as a live retailer feed.</p>

      {message && <Alert className="mt-4" variant="success"><AlertDescription>{message}</AlertDescription></Alert>}
      {error && <Alert className="mt-4" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading retailers...</p>}
          {retailers.map((retailer) => (
            <Card key={retailer.id}>
              <CardContent className="space-y-2 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">#{retailer.id} {retailer.name}</p>
                    <p className="text-xs text-muted-foreground">{retailer.slug} · {retailer.website}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <Badge variant={retailer.integration_status === "live" ? "success" : "secondary"}>{retailer.integration_status}</Badge>
                    {retailer.is_demo && <Badge variant="warning">Demo</Badge>}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{retailer.terms_note}</p>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => void toggle(retailer)}>Mark {retailer.integration_status === "live" ? "demo" : "live"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => void refreshDemo(retailer)}><RefreshCw className="mr-1 h-4 w-4" /> Refresh demo prices</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Create retailer</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={createRetailer} className="space-y-2">
                <div className="space-y-1"><Label htmlFor="retailer-name">Name</Label><Input id="retailer-name" required value={name} onChange={(event) => setName(event.target.value)} /></div>
                <div className="space-y-1"><Label htmlFor="retailer-slug">Slug</Label><Input id="retailer-slug" required value={slug} onChange={(event) => setSlug(event.target.value)} /></div>
                <div className="space-y-1"><Label htmlFor="retailer-website">Website</Label><Input id="retailer-website" type="url" required value={website} onChange={(event) => setWebsite(event.target.value)} /></div>
                <Button type="submit" className="w-full">Create demo retailer</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Adapter readiness</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {adapters.map((adapter) => (
                <div key={adapter.slug} className="rounded-lg border p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{adapter.name}</span>
                    <Badge variant={adapter.live_ready ? "success" : "secondary"}>{adapter.live_ready ? "live ready" : "not live"}</Badge>
                  </div>
                  <p className="mt-1 text-muted-foreground">{adapter.note}</p>
                  {adapter.requires_credentials.length > 0 && <p className="text-amber-700">Requires: {adapter.requires_credentials.join(", ")}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
