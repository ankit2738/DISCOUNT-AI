"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import type { Campaign } from "@/lib/types";

const STATE_VARIANT: Record<string, "success" | "warning" | "secondary"> = {
  live: "success",
  upcoming: "warning",
  ended: "secondary",
};

export default function SaleEventsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<{ items: Campaign[] }>("/api/sale-campaigns", { signal: controller.signal })
      .then((payload) => setCampaigns(payload.items))
      .catch((fetchError) => {
        if (!controller.signal.aborted) setError(fetchError instanceof Error ? fetchError.message : "Could not load sale events");
      });
    return () => controller.abort();
  }, []);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <CalendarDays className="h-6 w-6 text-primary" /> Sale events
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Configuration-driven sale windows. Dates are demo records; verify official dates with the retailer before planning purchases.
        </p>
      </div>

      {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {campaigns.map((campaign) => (
          <Card key={campaign.id} className="card-hover">
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant={STATE_VARIANT[campaign.state] ?? "secondary"}>{campaign.state}</Badge>
                {campaign.is_demo && <Badge variant="warning">Demo dates</Badge>}
                {campaign.is_verified && <Badge variant="success">Verified</Badge>}
              </div>
              <CardTitle className="text-lg">{campaign.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{campaign.description}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(campaign.starts_at).toLocaleDateString("en-IN")} – {new Date(campaign.ends_at).toLocaleDateString("en-IN")}
              </p>
              <p className="text-xs text-muted-foreground">{campaign.authenticity_note}</p>
              <Button asChild variant="outline" className="w-full">
                <Link href={`/sale-events/${campaign.slug}`}>
                  <Sparkles className="mr-1 h-4 w-4" /> View event
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {!error && campaigns.length === 0 && (
        <Card className="mt-6">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">No sale events configured.</CardContent>
        </Card>
      )}
    </main>
  );
}
