"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";

type AdminCampaign = {
  id: number;
  slug: string;
  name: string;
  description: string;
  retailer_id: number | null;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  is_verified: boolean;
  is_demo: boolean;
};

export default function AdminCampaignsPage() {
  const { token } = useAuth();
  const [campaigns, setCampaigns] = useState<AdminCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [verified, setVerified] = useState(false);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const payload = await apiFetch<{ items: AdminCampaign[] }>("/api/admin/campaigns", { token });
      setCampaigns(payload.items);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Could not load campaigns");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function createCampaign(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    try {
      await apiFetch("/api/admin/campaigns", {
        method: "POST",
        token,
        body: {
          slug,
          name,
          description,
          starts_at: new Date(startsAt).toISOString(),
          ends_at: new Date(endsAt).toISOString(),
          is_active: true,
          is_verified: verified,
        },
      });
      setMessage(`Campaign ${name} created.`);
      setSlug("");
      setName("");
      setDescription("");
      setStartsAt("");
      setEndsAt("");
      setVerified(false);
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create campaign");
    }
  }

  async function toggle(campaign: AdminCampaign, field: "is_active" | "is_verified") {
    if (!token) return;
    try {
      await apiFetch(`/api/admin/campaigns/${campaign.id}`, {
        method: "PATCH",
        token,
        body: { [field]: !campaign[field] },
      });
      setMessage(`Campaign #${campaign.id} ${field} updated.`);
      await load();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Could not update campaign");
    }
  }

  async function remove(campaign: AdminCampaign) {
    if (!token) return;
    if (!window.confirm(`Delete campaign “${campaign.name}”?`)) return;
    try {
      await apiFetch(`/api/admin/campaigns/${campaign.id}`, { method: "DELETE", token });
      setMessage(`Campaign #${campaign.id} deleted.`);
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete campaign");
    }
  }

  return (
    <div>
      <h1 className="flex items-center gap-2 text-3xl font-bold"><CalendarDays className="h-6 w-6 text-primary" /> Sale campaigns</h1>
      <p className="mt-1 text-sm text-muted-foreground">Configuration-driven sale windows. Only mark verified when official retailer evidence exists.</p>

      {message && <p className="mt-3 rounded-lg border bg-card p-3 text-sm">{message}</p>}
      {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {loading && <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading campaigns...</p>}

      <div className="mt-5 grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader><CardTitle className="text-base">Create campaign</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={createCampaign} className="space-y-2">
              <div className="space-y-1"><Label htmlFor="campaign-slug">Slug</Label><Input id="campaign-slug" required value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="diwali-demo" /></div>
              <div className="space-y-1"><Label htmlFor="campaign-name">Name</Label><Input id="campaign-name" required value={name} onChange={(event) => setName(event.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="campaign-description">Description</Label><Textarea id="campaign-description" value={description} onChange={(event) => setDescription(event.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="campaign-start">Starts at</Label><Input id="campaign-start" type="datetime-local" required value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="campaign-end">Ends at</Label><Input id="campaign-end" type="datetime-local" required value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></div>
              <label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={verified} onChange={(event) => setVerified(event.target.checked)} /> Official campaign dates verified with retailer evidence.</label>
              <p className="text-[11px] text-muted-foreground">Created campaigns are marked non-demo. Do not claim official dates without evidence.</p>
              <Button type="submit" className="w-full">Create campaign</Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {campaigns.map((campaign) => (
            <Card key={campaign.id}>
              <CardContent className="space-y-2 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">#{campaign.id} {campaign.name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant={campaign.is_active ? "success" : "secondary"}>{campaign.is_active ? "active" : "inactive"}</Badge>
                    <Badge variant={campaign.is_verified ? "success" : "warning"}>{campaign.is_verified ? "verified" : "unverified"}</Badge>
                    {campaign.is_demo && <Badge variant="warning">Demo</Badge>}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{campaign.description}</p>
                <p className="text-xs text-muted-foreground">/{campaign.slug} · {new Date(campaign.starts_at).toLocaleString("en-IN")} – {new Date(campaign.ends_at).toLocaleString("en-IN")}</p>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => void toggle(campaign, "is_active")}>{campaign.is_active ? "Deactivate" : "Activate"}</Button>
                  <Button size="sm" variant="outline" onClick={() => void toggle(campaign, "is_verified")}>{campaign.is_verified ? "Unverify" : "Verify"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => void remove(campaign)}>Delete</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
