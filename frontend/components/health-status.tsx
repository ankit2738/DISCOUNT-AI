"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";

type Health = {
  status: string;
  service: string;
  version: string;
  demo_mode: boolean;
  database: { status: string; scheme: string };
  integrations: {
    adapters: number;
    ai_provider: string;
    ai_external_configured: boolean;
    telegram_configured: boolean;
    whatsapp_configured: boolean;
    payment_provider: string;
  };
};

export function HealthStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const check = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<Health>("/api/health", { signal });
      setHealth(payload);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Backend health check failed");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void check(controller.signal);
    return () => controller.abort();
  }, [check]);

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-muted">
          <Activity className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-medium">Backend health</p>
          {loading && <p className="text-xs text-muted-foreground">Checking backend...</p>}
          {!loading && error && <p className="text-xs text-red-700">Error: {error}</p>}
          {!loading && health && (
            <p className="text-xs text-muted-foreground" data-testid="health-status">
              {health.status} · database {health.database.status} · {health.integrations.adapters} retailer adapters · AI {health.integrations.ai_provider}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {health?.demo_mode && <Badge variant="warning">Demo data</Badge>}
        <Button variant="outline" size="sm" onClick={() => void check()} disabled={loading}>
          <RefreshCw className={loading ? "mr-1 h-3 w-3 animate-spin" : "mr-1 h-3 w-3"} />
          Recheck
        </Button>
      </div>
    </div>
  );
}
