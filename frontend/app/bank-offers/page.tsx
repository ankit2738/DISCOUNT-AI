"use client";

import { useEffect, useMemo, useState } from "react";
import { CreditCard, Landmark } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { formatINR } from "@/lib/format";
import type { BankOffer } from "@/lib/types";

export default function BankOffersPage() {
  const [offers, setOffers] = useState<BankOffer[]>([]);
  const [bank, setBank] = useState("");
  const [cardType, setCardType] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<{ items: BankOffer[] }>("/api/bank-offers?limit=100", { signal: controller.signal })
      .then((payload) => setOffers(payload.items))
      .catch((fetchError) => {
        if (!controller.signal.aborted) setError(fetchError instanceof Error ? fetchError.message : "Could not load bank offers");
      });
    return () => controller.abort();
  }, []);

  const banks = useMemo(() => Array.from(new Set(offers.map((offer) => offer.bank_name))).sort(), [offers]);
  const filtered = offers.filter(
    (offer) =>
      (!bank || offer.bank_name === bank) &&
      (!cardType || offer.card_type === cardType || offer.card_type === "any"),
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <Landmark className="h-6 w-6 text-primary" /> Bank offers
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Illustrative bank and card offers from the demo dataset. Eligibility, caps and tenure must be confirmed with your bank and the retailer.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <select aria-label="Filter by bank" className="h-10 rounded-lg border bg-card px-3 text-sm" value={bank} onChange={(event) => setBank(event.target.value)}>
          <option value="">All banks</option>
          {banks.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <select aria-label="Filter by card type" className="h-10 rounded-lg border bg-card px-3 text-sm" value={cardType} onChange={(event) => setCardType(event.target.value)}>
          <option value="">All card types</option>
          <option value="credit">Credit card</option>
          <option value="debit">Debit card</option>
          <option value="any">Any card</option>
        </select>
        <Badge variant="warning">Demo offers</Badge>
      </div>

      {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((offer) => (
          <Card key={offer.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="secondary">{offer.bank_name}</Badge>
                <Badge variant="outline">{offer.card_type.replaceAll("_", " ")}</Badge>
              </div>
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="h-4 w-4" /> {offer.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-xl font-bold text-primary">
                {offer.discount_type === "percent" ? `${offer.discount_value}% off` : `${formatINR(offer.discount_value)} off`}
                {offer.max_discount ? <span className="ml-1 text-xs font-normal text-muted-foreground">up to {formatINR(offer.max_discount)}</span> : null}
              </p>
              <p className="text-xs text-muted-foreground">Minimum transaction {formatINR(offer.min_transaction)}</p>
              <div className="flex flex-wrap gap-1.5">
                {offer.is_cashback && <Badge variant="warning">Cashback</Badge>}
                {offer.emi_only && <Badge variant="outline">EMI only</Badge>}
                {offer.no_cost_emi && <Badge variant="success">No-cost EMI</Badge>}
                {offer.is_demo && <Badge variant="warning">Demo</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">{offer.terms}</p>
              <p className="text-[11px] text-muted-foreground">
                Source: {offer.source} · Expires {offer.expires_at ? new Date(offer.expires_at).toLocaleDateString("en-IN") : "not specified"}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {!error && filtered.length === 0 && (
        <Card className="mt-6">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">No bank offers match these filters.</CardContent>
        </Card>
      )}
    </main>
  );
}
