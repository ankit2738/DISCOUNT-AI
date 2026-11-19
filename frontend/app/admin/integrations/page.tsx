"use client";

import { useEffect, useState } from "react";
import { Loader2, PlugZap } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

type Integrations = {
  adapters: {
    slug: string;
    name: string;
    integration_status: string;
    live_ready: boolean;
    demo_data: boolean;
    requires_credentials: string[];
    note: string;
  }[];
  ai_provider: string;
  ai_configured: boolean;
  telegram_configured: boolean;
  whatsapp_configured: boolean;
  payment_provider: string;
  email_provider: string;
  note: string;
};

export default function AdminIntegrationsPage() {
  const { token } = useAuth();
  const [integrations, setIntegrations] = useState<Integrations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    apiFetch<Integrations>("/api/admin/integrations", { token, signal: controller.signal })
      .then(setIntegrations)
      .catch((fetchError) => {
        if (!controller.signal.aborted) setError(fetchError instanceof Error ? fetchError.message : "Could not load integration status");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [token]);

  return (
    <div>
      <h1 className="flex items-center gap-2 text-3xl font-bold"><PlugZap className="h-6 w-6 text-primary" /> Integrations</h1>
      <p className="mt-1 text-sm text-muted-foreground">Configured is not the same as live. Credentials and adapter code are both required before claiming an external integration.</p>

      {error && <Alert className="mt-4" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {loading && <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading integration status...</p>}

      {integrations && (
        <>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[
              { label: "AI provider", value: integrations.ai_provider, ok: integrations.ai_configured, note: integrations.ai_configured ? "Credentials configured; verify a live response before claiming delivery." : "Using deterministic fallback." },
              { label: "Telegram", value: integrations.telegram_configured ? "configured" : "not configured", ok: integrations.telegram_configured },
              { label: "WhatsApp", value: integrations.whatsapp_configured ? "configured" : "not configured", ok: integrations.whatsapp_configured },
              { label: "Payments", value: integrations.payment_provider, ok: integrations.payment_provider === "sandbox", note: integrations.payment_provider === "sandbox" ? "Sandbox only. No real money moves." : "Review provider status before enabling checkout." },
              { label: "Email", value: integrations.email_provider, ok: integrations.email_provider !== "console", note: "Console/email delivery must be verified per environment." },
            ].map((item) => (
              <Card key={item.label}>
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
                    <Badge variant={item.ok ? "success" : "warning"}>{item.ok ? "configured" : "not configured"}</Badge>
                  </div>
                  <p className="mt-2 break-words font-semibold">{item.value}</p>
                  {item.note && <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="mt-4">
            <CardHeader><CardTitle className="text-base">Retailer adapters</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {integrations.adapters.map((adapter) => (
                <div key={adapter.slug} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{adapter.name}</p>
                      <p className="text-xs text-muted-foreground">{adapter.slug}</p>
                    </div>
                    <div className="flex gap-1.5">
                      <Badge variant={adapter.integration_status === "live" ? "success" : "secondary"}>{adapter.integration_status}</Badge>
                      {adapter.live_ready ? <Badge variant="success">live ready</Badge> : <Badge variant="outline">demo/fixture</Badge>}
                      {adapter.demo_data && <Badge variant="warning">Demo data</Badge>}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{adapter.note}</p>
                  {adapter.requires_credentials.length > 0 && <p className="mt-1 text-xs text-amber-700">Requires: {adapter.requires_credentials.join(", ")}</p>}
                </div>
              ))}
              <p className="text-xs text-muted-foreground">{integrations.note}</p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
