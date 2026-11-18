"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BadgePercent,
  BellRing,
  Bot,
  Brain,
  Building2,
  CreditCard,
  History,
  Puzzle,
  Search,
  ShieldAlert,
  ShoppingBasket,
  Sparkles,
  Store,
  TrendingDown,
  Users,
} from "lucide-react";

import { HealthStatus } from "@/components/health-status";
import { ProductCard } from "@/components/product-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { formatINR } from "@/lib/format";
import type { Campaign, DealsResponse, Product } from "@/lib/types";

const FEATURES = [
  { icon: Search, title: "Exact-variant comparison", body: "128GB is never compared with 256GB. Retailer, delivery, coupons and bank offers are shown separately." },
  { icon: History, title: "Historical price tracking", body: "30-day, 90-day, 6-month and 1-year charts backed by stored observations, with demo records labelled." },
  { icon: Brain, title: "Deal Quality Score", body: "A transparent 0–100 score built from historical lows, competitor prices, freshness and confidence." },
  { icon: ShieldAlert, title: "Fake discount detector", body: "Checks claimed MRPs against recorded history and explains suspicious signals without accusing anyone." },
  { icon: TrendingDown, title: "Buy now or wait", body: "Grounded recommendations using your product's price history, trends and configured sale windows." },
  { icon: Bot, title: "AI shopping copilot", body: "Conversational recommendations grounded on real catalogue records, with a rule-based fallback." },
  { icon: ShoppingBasket, title: "Smart cart optimizer", body: "Multi-store basket optimisation using delivery costs, eligible coupons and bank offers." },
  { icon: BellRing, title: "Price-drop alerts", body: "Watchlists, target prices and honest delivery statuses for in-app, email, Telegram and WhatsApp." },
  { icon: BadgePercent, title: "Coupons and bank offers", body: "Verified and community-reported offers with expiry, minimum order and eligibility rules." },
  { icon: Store, title: "Coupon marketplace", body: "Buyer and seller workflows with proof, moderation, sandbox payments, disputes and refunds." },
  { icon: Users, title: "Community verification", body: "Report prices and offers, vote, build reputation and separate community reports from retailer verification." },
  { icon: Puzzle, title: "Chrome extension", body: "Manifest V3 popup and side panel for Amazon.in and Flipkart with comparison, history and alerts." },
];

export default function HomePage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [deals, setDeals] = useState<DealsResponse | null>(null);
  const [categories, setCategories] = useState<{ name: string; count: number }[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const [dealsPayload, categoryPayload, campaignPayload] = await Promise.all([
          apiFetch<DealsResponse>("/api/deals?limit=6", { signal: controller.signal }),
          apiFetch<{ items: { name: string; count: number }[] }>("/api/products/categories", { signal: controller.signal }),
          apiFetch<{ items: Campaign[] }>("/api/sale-campaigns", { signal: controller.signal }),
        ]);
        setDeals(dealsPayload);
        setCategories(categoryPayload.items);
        setCampaigns(campaignPayload.items);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Could not load homepage data");
        }
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(query.trim() ? `/search?q=${encodeURIComponent(query.trim())}` : "/search");
  }

  const liveCampaign = campaigns.find((campaign) => campaign.state === "live") ?? campaigns[0];

  return (
    <div>
      <section className="gradient-hero border-b">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="success" className="mb-4">
              <Sparkles className="mr-1 h-3 w-3" /> Independent price intelligence for India
            </Badge>
            <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
              Buy Smarter. <span className="text-primary">Not Just Cheaper.</span>
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
              Compare exact variants across Amazon, Flipkart, Croma, Reliance Digital, Myntra and Meesho.
              See the true payable price, historical lows, deal quality and whether to buy now or wait.
            </p>
            <form onSubmit={search} className="mx-auto mt-7 flex max-w-xl gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Try iPhone 15 128GB, laptop under ₹65,000..."
                  className="h-12 bg-white pl-9 text-base"
                  aria-label="Search for a product"
                />
              </div>
              <Button type="submit" size="lg">
                Compare
              </Button>
            </form>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {categories.slice(0, 6).map((category) => (
                <Link
                  key={category.name}
                  href={`/search?category=${encodeURIComponent(category.name)}`}
                  className="rounded-full border bg-white px-3 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary"
                >
                  {category.name} ({category.count})
                </Link>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Demo deployment: retailer data is labelled demo data. No paid services are activated.
            </p>
          </div>
          <div className="mx-auto mt-8 max-w-3xl">
            <HealthStatus />
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4 py-12">
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}. Make sure the backend is running on port 8000.
          </div>
        )}

        {liveCampaign && (
          <section className="mb-12 overflow-hidden rounded-2xl border bg-slate-900 p-6 text-white sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <Badge variant="warning">{liveCampaign.state === "live" ? "Sale live" : "Sale upcoming"}</Badge>
                <h2 className="mt-3 text-2xl font-bold">{liveCampaign.name}</h2>
                <p className="mt-1 max-w-2xl text-sm text-slate-300">
                  {liveCampaign.description} Demo dates configured for testing; official dates are not claimed.
                </p>
              </div>
              <Button asChild variant="accent">
                <Link href={`/sale-events/${liveCampaign.slug}`}>
                  Explore sale <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </section>
        )}

        <section className="mb-14">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-2xl font-bold">Today&apos;s top deals</h2>
              <p className="text-sm text-muted-foreground">
                Ranked by discount against tracked history — never by commission.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/deals">All deals</Link>
            </Button>
          </div>
          {!deals && !error && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <div key={index} className="h-72 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {deals?.items.map((deal) => (
              <Link key={deal.listing.id} href={`/products/${deal.product.slug}`} className="group">
                <Card className="card-hover h-full">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant={deal.deal_score.score >= 70 ? "success" : "warning"}>
                        Deal score {deal.deal_score.score}
                      </Badge>
                      <Badge variant="secondary">{deal.listing.retailer?.name}</Badge>
                    </div>
                    <CardTitle className="line-clamp-2 text-base group-hover:text-primary">{deal.product.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-end gap-2">
                      <span className="text-2xl font-bold text-primary">{formatINR(deal.effective.effective_price)}</span>
                      <span className="pb-1 text-xs text-muted-foreground line-through">{formatINR(deal.listing.mrp)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {deal.drop_from_average_pct > 0
                        ? `${deal.drop_from_average_pct.toFixed(1)}% below tracked 1-year average`
                        : "At tracked market level"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {deal.listing.variant?.name} · delivery {formatINR(deal.listing.delivery_charge)}
                    </p>
                    <div className="flex justify-between pt-1 text-xs text-muted-foreground">
                      <span>{deal.product.category}</span>
                      <span>{deal.is_demo ? "Demo data" : "Verified"}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        <section className="mb-14">
          <h2 className="text-2xl font-bold">Everything you need to buy well</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Real modules, real APIs, honest integration status. Where live credentials are absent, clearly labelled demo adapters are used.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <Card key={feature.title}>
                <CardHeader>
                  <feature.icon className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{feature.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="grid gap-6 rounded-2xl border bg-card p-6 sm:p-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h2 className="text-2xl font-bold">From search to smarter checkout</h2>
            <ol className="mt-4 grid gap-4 sm:grid-cols-2">
              {[
                "Search with exact variant filters and compare retailers.",
                "Read price history, Deal Score and fake-discount evidence.",
                "Apply coupons and bank offers to see the final payable price.",
                "Optimise your multi-store cart, save alerts and track purchases.",
              ].map((step, index) => (
                <li key={step} className="flex gap-3 text-sm">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 font-semibold text-primary">
                    {index + 1}
                  </span>
                  <span className="text-muted-foreground">{step}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-xl bg-muted p-4">
            <p className="text-sm font-semibold">Try the demo</p>
            <p className="mt-2 text-xs text-muted-foreground">Shopper: demo@discountai.in / DemoPass123!</p>
            <p className="text-xs text-muted-foreground">Admin: admin@discountai.in / AdminPass123!</p>
            <Button asChild className="mt-4 w-full">
              <Link href="/login">Log in to explore</Link>
            </Button>
            <Button asChild variant="outline" className="mt-2 w-full">
              <Link href="/sale-events">See sale events</Link>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
