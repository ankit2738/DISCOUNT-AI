"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch, buildQuery } from "@/lib/api";

type AdminReport = {
  id: number;
  user_id: number;
  report_type: string;
  product_id: number | null;
  listing_id: number | null;
  claimed_value: string;
  evidence_url: string | null;
  description: string;
  status: string;
  duplicate_of_id: number | null;
  moderation_note: string | null;
  created_at: string;
};

export default function AdminCommunityPage() {
  const { token } = useAuth();
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load(status = statusFilter) {
    if (!token) return;
    setLoading(true);
    try {
      const payload = await apiFetch<{ items: AdminReport[] }>(`/api/admin/community/reports${buildQuery({ status_filter: status })}`, { token });
      setReports(payload.items);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Could not load reports");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function moderate(report: AdminReport, status: "approved" | "rejected" | "duplicate") {
    if (!token) return;
    const note = window.prompt("Moderation note (required for an audit trail):", status === "approved" ? "Evidence reviewed." : "Report rejected after review.");
    if (note === null) return;
    try {
      await apiFetch(`/api/admin/community/reports/${report.id}/moderate`, {
        method: "POST",
        token,
        body: { status, note },
      });
      setMessage(`Report #${report.id} marked ${status}.`);
      await load();
    } catch (moderationError) {
      setError(moderationError instanceof Error ? moderationError.message : "Could not moderate report");
    }
  }

  return (
    <div>
      <h1 className="flex items-center gap-2 text-3xl font-bold"><ShieldCheck className="h-6 w-6 text-primary" /> Community moderation</h1>
      <p className="mt-1 text-sm text-muted-foreground">Approve only with evidence. Approved reports still remain community reports, not retailer verification.</p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {["pending", "approved", "rejected", "duplicate", ""].map((status) => (
          <button key={status || "all"} type="button" onClick={() => { setStatusFilter(status); void load(status); }} className={statusFilter === status ? "rounded-lg border border-primary bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary" : "rounded-lg border px-3 py-1.5 text-xs text-muted-foreground"}>
            {status || "all"}
          </button>
        ))}
      </div>

      {message && <p className="mt-3 rounded-lg border bg-card p-3 text-sm">{message}</p>}
      {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {loading && <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading reports...</p>}

      <div className="mt-5 space-y-3">
        {reports.map((report) => (
          <Card key={report.id}>
            <CardContent className="space-y-2 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary">{report.report_type}</Badge>
                  <Badge variant={report.status === "approved" ? "success" : report.status === "pending" ? "warning" : "secondary"}>{report.status}</Badge>
                  <Badge variant="outline">User #{report.user_id}</Badge>
                </div>
                <span className="text-xs text-muted-foreground">{new Date(report.created_at).toLocaleString("en-IN")}</span>
              </div>
              <p className="text-sm"><span className="font-semibold">Claim:</span> {report.claimed_value || "—"}</p>
              <p className="text-sm text-muted-foreground">{report.description || "No description"}</p>
              <p className="text-xs text-muted-foreground">Product #{report.product_id ?? "—"} · listing #{report.listing_id ?? "—"}{report.duplicate_of_id ? ` · duplicate of #${report.duplicate_of_id}` : ""}</p>
              {report.evidence_url && <a href={report.evidence_url} target="_blank" rel="noopener noreferrer nofollow" className="text-xs text-primary hover:underline">Open evidence</a>}
              {report.moderation_note && <p className="text-xs text-muted-foreground">Note: {report.moderation_note}</p>}
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" onClick={() => void moderate(report, "approved")}>Approve</Button>
                <Button size="sm" variant="ghost" onClick={() => void moderate(report, "rejected")}>Reject</Button>
                <Button size="sm" variant="ghost" onClick={() => void moderate(report, "duplicate")}>Mark duplicate</Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!loading && reports.length === 0 && <p className="text-sm text-muted-foreground">No reports with this status.</p>}
      </div>
    </div>
  );
}
