"use client";

import { useEffect, useState } from "react";
import { Loader2, ScrollText } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

type AuditLog = {
  id: number;
  actor_id: number | null;
  action: string;
  entity_type: string;
  entity_id: number | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
};

export default function AdminAuditPage() {
  const { token } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    apiFetch<{ items: AuditLog[] }>("/api/admin/audit-logs?limit=500", { token, signal: controller.signal })
      .then((payload) => setLogs(payload.items))
      .catch((fetchError) => {
        if (!controller.signal.aborted) setError(fetchError instanceof Error ? fetchError.message : "Could not load audit log");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [token]);

  const filtered = logs.filter((log) => {
    const term = query.trim().toLowerCase();
    return !term || `${log.action} ${log.entity_type} ${log.actor_id ?? "system"}`.toLowerCase().includes(term);
  });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold"><ScrollText className="h-6 w-6 text-primary" /> Audit log</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every administrative mutation is recorded with actor, entity and before/after snapshots. Secrets are not intended to appear here.</p>
        </div>
        <Input className="h-9 w-64" placeholder="Filter action or entity..." value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Filter audit log" />
      </div>

      {error && <Alert className="mt-4" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <Card className="mt-5">
        <CardHeader><CardTitle className="text-base">Events ({filtered.length}/{logs.length})</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading audit events...</p>}
          {filtered.map((log) => (
            <div key={log.id} className="rounded-lg border p-2">
              <button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 text-left text-xs" onClick={() => setExpanded(expanded === log.id ? null : log.id)}>
                <span>
                  <span className="font-medium">{log.action}</span>
                  <span className="text-muted-foreground"> · {log.entity_type} #{log.entity_id ?? "—"} · actor #{log.actor_id ?? "system"}</span>
                </span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  {log.ip_address && <Badge variant="outline">{log.ip_address}</Badge>}
                  {new Date(log.created_at).toLocaleString("en-IN")}
                </span>
              </button>
              {expanded === log.id && (
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <pre className="overflow-x-auto rounded bg-muted p-2 text-[10px]">{JSON.stringify(log.before ?? {}, null, 2)}</pre>
                  <pre className="overflow-x-auto rounded bg-muted p-2 text-[10px]">{JSON.stringify(log.after ?? {}, null, 2)}</pre>
                </div>
              )}
            </div>
          ))}
          {!loading && filtered.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No matching audit events.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
