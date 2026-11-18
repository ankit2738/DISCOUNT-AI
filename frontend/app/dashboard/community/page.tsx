"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Flag, Loader2, ThumbsDown, ThumbsUp, Users } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import type { CommunityReport, Product, SearchResponse } from "@/lib/types";

type Leaderboard = { user_id: number; display_name: string; reputation: number };

export default function CommunityPage() {
  const { token } = useAuth();
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [mine, setMine] = useState<CommunityReport[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [leaderboard, setLeaderboard] = useState<Leaderboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [reportType, setReportType] = useState("price");
  const [productId, setProductId] = useState("");
  const [claimedValue, setClaimedValue] = useState("");
  const [description, setDescription] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [approved, minePayload, productsPayload, leaderboardPayload] = await Promise.all([
        apiFetch<{ items: CommunityReport[] }>("/api/community/reports?status_filter=approved"),
        token
          ? apiFetch<{ items: CommunityReport[] }>("/api/community/reports?mine=true", { token })
          : Promise.resolve({ items: [] }),
        apiFetch<SearchResponse>("/api/products?limit=100"),
        apiFetch<{ items: Leaderboard[] }>("/api/community/leaderboard"),
      ]);
      setReports(approved.items);
      setMine(minePayload.items);
      setProducts(productsPayload.items);
      setLeaderboard(leaderboardPayload.items);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Could not load community data");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setMessage(null);
    setError(null);
    try {
      const response = await apiFetch<CommunityReport & { duplicate_detected?: boolean; note?: string }>("/api/community/reports", {
        method: "POST",
        token,
        body: {
          report_type: reportType,
          product_id: productId ? Number(productId) : null,
          claimed_value: claimedValue,
          description,
          evidence_url: evidenceUrl || null,
        },
      });
      setMessage(response.note ?? "Report submitted for moderation.");
      setClaimedValue("");
      setDescription("");
      setEvidenceUrl("");
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not submit report");
    }
  }

  async function vote(reportId: number, value: 1 | -1) {
    if (!token) {
      setMessage("Log in to vote.");
      return;
    }
    try {
      await apiFetch(`/api/community/reports/${reportId}/vote`, { method: "POST", token, body: { vote: value } });
      await load();
    } catch (voteError) {
      setError(voteError instanceof Error ? voteError.message : "Could not vote");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold"><Users className="h-6 w-6 text-primary" /> Community verification</h1>
          <p className="mt-1 text-sm text-muted-foreground">Community reports are never labelled retailer-verified until moderation confirms evidence.</p>
        </div>
        <Badge variant="warning">Community reports</Badge>
      </div>

      {message && <Alert className="mt-4" variant="success"><AlertDescription>{message}</AlertDescription></Alert>}
      {error && <Alert className="mt-4" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <div className="mt-5 grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Flag className="h-4 w-4" /> Report a price or offer</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="report-type">Report type</Label>
                  <select id="report-type" className="h-10 w-full rounded-lg border bg-card px-3 text-sm" value={reportType} onChange={(event) => setReportType(event.target.value)}>
                    <option value="price">Price</option>
                    <option value="coupon">Coupon</option>
                    <option value="bank_offer">Bank offer</option>
                    <option value="fake_discount">Suspicious discount</option>
                    <option value="expired_offer">Expired offer</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="report-product">Product (optional)</Label>
                  <select id="report-product" className="h-10 w-full rounded-lg border bg-card px-3 text-sm" value={productId} onChange={(event) => setProductId(event.target.value)}>
                    <option value="">No specific product</option>
                    {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="claimed-value">Claimed value</Label>
                  <Input id="claimed-value" value={claimedValue} onChange={(event) => setClaimedValue(event.target.value)} placeholder="e.g. ₹24,999 or SAVE10" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="report-description">Description</Label>
                  <Textarea id="report-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What did you observe and when?" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="evidence-url">Evidence URL (optional)</Label>
                  <Input id="evidence-url" value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} placeholder="https://..." />
                </div>
                <Button type="submit" className="w-full">Submit for moderation</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Your submissions</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {mine.map((report) => (
                <div key={report.id} className="rounded-lg border p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">#{report.id} {report.report_type}</span>
                    <Badge variant={report.status === "approved" ? "success" : report.status === "pending" ? "warning" : "secondary"}>{report.status}</Badge>
                  </div>
                  <p className="mt-1 text-muted-foreground">{report.claimed_value || report.description}</p>
                </div>
              ))}
              {mine.length === 0 && <p className="text-sm text-muted-foreground">No submissions yet.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Reputation leaderboard</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {leaderboard.map((entry, index) => (
                <div key={entry.user_id} className="flex items-center justify-between text-sm">
                  <span>#{index + 1} {entry.display_name}</span>
                  <span className="font-semibold text-primary">{entry.reputation}</span>
                </div>
              ))}
              {leaderboard.length === 0 && <p className="text-sm text-muted-foreground">No reputation yet.</p>}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3">
          {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading reports...</p>}
          {reports.map((report) => (
            <Card key={report.id}>
              <CardContent className="space-y-2 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary">{report.report_type}</Badge>
                    <Badge variant="outline">{report.verification_label}</Badge>
                    <Badge variant="warning">Votes {report.vote_score}</Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">Reporter rep {report.reporter_reputation}</span>
                </div>
                {report.product && (
                  <p className="font-medium">
                    <Link href={`/products/${report.product.slug}`} className="hover:text-primary">{report.product.name}</Link>
                  </p>
                )}
                <p className="text-sm">{report.claimed_value}</p>
                <p className="text-sm text-muted-foreground">{report.description}</p>
                {report.evidence_url && <a href={report.evidence_url} target="_blank" rel="noopener noreferrer nofollow" className="text-xs text-primary hover:underline">View evidence</a>}
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => void vote(report.id, 1)}><ThumbsUp className="mr-1 h-3.5 w-3.5" /> Helpful ({report.upvotes})</Button>
                  <Button size="sm" variant="ghost" onClick={() => void vote(report.id, -1)}><ThumbsDown className="mr-1 h-3.5 w-3.5" /> Not helpful ({report.downvotes})</Button>
                </div>
                <p className="text-[11px] text-muted-foreground">Submitted {new Date(report.created_at).toLocaleString("en-IN")} · not official retailer verification.</p>
              </CardContent>
            </Card>
          ))}
          {!loading && reports.length === 0 && (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No approved community reports yet.</CardContent></Card>
          )}
        </div>
      </div>
    </div>
  );
}
