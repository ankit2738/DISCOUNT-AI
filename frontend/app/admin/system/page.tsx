"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, BarChart3, Loader2, PlugZap } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { formatINR } from "@/lib/format";

type Health = {
  status: string;
  database: { status: string; scheme: string };
  adapters: { slug: string; name: string; integration_status: string; live_ready: boolean; demo_data: boolean; requires_credentials: string[]; note: string }[];
  environment: string;
  demo_mode: boolean;
  checked_at: string;
};

type Integrations = {
  adapters: { slug: string; name: string; integration_status: string; live_ready: boolean; demo_data: boolean; requires_credentials: string[]; note: string }[];
  ai_provider: string;
  ai_configured: boolean;
  telegram_configured: boolean;
  whatsapp_configured: boolean;
  payment_provider: string;
  email_provider: string;
  note: string;
};

type Affiliate = {
  total_clicks: number;
  cheapest_clicks: number;
  primary_metric: { value_pct: number | null; cheaper_store_clicks: number; comparison_sessions: number; definition: string };
  by_retailer: { retailer_id: number; clicks: number; cheapest_clicks: number }[];
  recent_clicks: { id: number; listing_id: number; effective_price: number; comparison_cheapest: boolean; source_page: string; created_at: string }[];
  disclosure: string;
};

type AuditLog = { id: number; actor_id: number | null; action: string; entity_type: string; entity_id: number | null; created_at: string };

export default function AdminSystemPage() {
  const { token } = useAuth();
  const [health, setHealth] = useState<Health | null>(null);
  const [integrations, setIntegrations] = useState<Integrations | null>(null);
  const [affiliate, setAffiliate] = useState<Affiliate | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    Promise.all([
      apiFetch<Health>("/api/admin/health", { token, signal: controller.signal }),
      apiFetch<Integrations>("/api/admin/integrations", { token, signal: controller.signal }),
      apiFetch<Affiliate>("/api/admin/affiliate", { token, signal: controller.signal }),
      apiFetch<{ items: AuditLog[] }>("/api/admin/audit-logs?limit=100", { token, signal: controller.signal }),
    ])
      .then(([healthPayload, integrationsPayload, affiliatePayload, auditPayload]) => {
        setHealth(healthPayload);
        setIntegrations(integrationsPayload);
        setAffiliate(affiliatePayload);
        setLogs(auditPayload.items);
      })
      .catch((fetchError) => {
        if (!controller.signal.aborted) setError(fetchError instanceof Error ? fetchError.message : "Could not load system data");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [token]);

  return (
    <div>
      <h1 className="flex items-center gap-2 text-3xl font-bold"><Activity className="h-6 w-6 text-primary" /> System, integrations & analytics</h1>
      <p className="mt-1 text-sm text-muted-foreground">Honest operational status. Configured is not the same as delivered or live.</p>

      {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {loading && <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading system status...</p>}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><PlugZap className="h-4 w-4" /> API health</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-1.5">
              <Badge variant={health?.status === "ok" ? "success" : "destructive"}>{health?.status ?? "unknown"}</Badge>
              <Badge variant="secondary">DB {health?.database.status ?? "—"}</Badge>
              <Badge variant="outline">{health?.environment ?? "—"}</Badge>
              {health?.demo_mode && <Badge variant="warning">Demo mode</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">Checked {health ? new Date(health.checked_at).toLocaleString("en-IN") : "—"} · scheme {health?.database.scheme}.</p>
            <div className="space-y-1">
              {health?.adapters.map((adapter) => (
                <div key={adapter.slug} className="rounded-lg border p-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{adapter.name}</span>
                    <span className="flex gap-1.5">
                      <Badge variant={adapter.integration_status === "live" ? "success" : "secondary"}>{adapter.integration_status}</Badge>
                      {adapter.demo_data && <Badge variant="warning">Demo data</Badge>}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{adapter.note}</p>
                  {adapter.requires_credentials.length > 0 && <p className="text-muted-foreground">Requires: {adapter.requires_credentials.join(", ")}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Providers</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between border-b pb-1"><span className="text-muted-foreground">AI provider</span><span>{integrations?.ai_provider ?? "—"} ({integrations?.ai_configured ? "configured" : "fallback"})</span></div>
            <div className="flex justify-between border-b pb-1"><span className="text-muted-foreground">Telegram</span><span>{integrations?.telegram_configured ? "configured" : "not configured"}</span></div>
            <div className="flex justify-between border-b pb-1"><span className="text-muted-foreground">WhatsApp</span><span>{integrations?.whatsapp_configured ? "configured" : "not configured"}</span></div>
            <div className="flex justify-between border-b pb-1"><span className="text-muted-foreground">Payment provider</span><span>{integrations?.payment_provider ?? "—"}</span></div>
            <div className="flex justify-between border-b pb-1"><span className="text-muted-foreground">Email provider</span><span>{integrations?.email_provider ?? "—"}</span></div>
            <p className="text-xs text-muted-foreground">{integrations?.note}</p>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary">No paid service auto-activated</Badge>
              <Badge variant="secondary">Secrets server-side only</Badge>
            </div>
            <Card className="mt-2 bg-muted/40">
              <CardContent className="pt-4 text-xs text-muted-foreground">
                AI provider details: <Link href="/admin/system" className="text-primary">checked via environment</Link>. External AI is used only when credentials are configured; otherwise deterministic fallback is used.
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4" /> Affiliate attribution & primary metric</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div><p className="text-xs text-muted-foreground">Cheaper-store CTR</p><p className="text-2xl font-bold text-primary">{affiliate?.primary_metric.value_pct !== null && affiliate?.primary_metric.value_pct !== undefined ? `${affiliate.primary_metric.value_pct}%` : "No data"}</p></div>
            <div><p className="text-xs text-muted-foreground">Cheapest clicks</p><p className="text-2xl font-bold">{affiliate?.cheapest_clicks ?? 0}</p></div>
            <div><p className="text-xs text-muted-foreground">Total tracked clicks</p><p className="text-2xl font-bold">{affiliate?.total_clicks ?? 0}</p></div>
          </div>
          <p className="text-xs text-muted-foreground">{affiliate?.primary_metric.definition} {affiliate?.disclosure}</p>
          <div className="space-y-1">
            {affiliate?.by_retailer.map((row) => (
              <div key={row.retailer_id} className="flex justify-between rounded border px-2 py-1 text-xs">
                <span>Retailer #{row.retailer_id}</span>
                <span>{row.clicks} clicks · {row.cheapest_clicks} cheapest</span>
              </div>
            ))}
          </div>
          {affiliate?.recent_clicks.slice(0, 8).map((click) => (
            <div key={click.id} className="flex flex-wrap justify-between gap-2 border-b py-1 text-xs last:border-b-0">
              <span>Listing #{click.listing_id} · {click.source_page}</span>
              <span>{formatINR(click.effective_price)} · {click.comparison_cheapest ? "cheapest" : "not cheapest"} · {new Date(click.created_at).toLocaleString("en-IN")}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle className="text-base">Audit log</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {logs.map((log) => (
            <div key={log.id} className="grid gap-1 border-b py-1.5 text-xs last:border-b-0 sm:grid-cols-[1fr_auto]">
              <div>
                <span className="font-medium">{log.action}</span>
                <span className="text-muted-foreground"> · {log.entity_type} #{log.entity_id ?? "—"} · actor #{log.actor_id ?? "system"}</span>
              </div>
              <span className="text-muted-foreground">{new Date(log.created_at).toLocaleString("en-IN")}</span>
            </div>
          ))}
          {logs.length === 0 && <p className="text-sm text-muted-foreground">No audit events yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
