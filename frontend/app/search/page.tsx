"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal } from "lucide-react";

import { ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { apiFetch, buildQuery } from "@/lib/api";
import type { Product, SearchResponse } from "@/lib/types";

type Category = { name: string; count: number };

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();

  const [categories, setCategories] = useState<Category[]>([]);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [category, setCategory] = useState(searchParams.get("category") ?? "");
  const [maxPrice, setMaxPrice] = useState(searchParams.get("max_price") ?? "");
  const [availability, setAvailability] = useState(searchParams.get("availability") ?? "");
  const [minRating, setMinRating] = useState(searchParams.get("min_rating") ?? "");

  const offset = Number(searchParams.get("offset") ?? 0);
  const activeFilters = useMemo(
    () => [
      searchParams.get("category"),
      searchParams.get("max_price") ? `Under ₹${searchParams.get("max_price")}` : null,
      searchParams.get("availability"),
      searchParams.get("min_rating") ? `${searchParams.get("min_rating")}+ rating` : null,
    ].filter(Boolean) as string[],
    [searchParams],
  );

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<{ items: Category[] }>("/api/products/categories", { signal: controller.signal })
      .then((payload) => setCategories(payload.items))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setQ(searchParams.get("q") ?? "");
    setCategory(searchParams.get("category") ?? "");
    setMaxPrice(searchParams.get("max_price") ?? "");
    setAvailability(searchParams.get("availability") ?? "");
    setMinRating(searchParams.get("min_rating") ?? "");
  }, [searchParams]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const path = `/api/products${queryString ? `?${queryString}` : ""}`;
    apiFetch<SearchResponse>(path, { signal: controller.signal })
      .then(setResult)
      .catch((fetchError) => {
        if (!controller.signal.aborted) {
          setError(fetchError instanceof Error ? fetchError.message : "Search failed");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [queryString]);

  const applyFilters = useCallback(
    (event?: React.FormEvent) => {
      event?.preventDefault();
      const params: Record<string, string> = {};
      if (q.trim()) params.q = q.trim();
      if (category) params.category = category;
      if (maxPrice) params.max_price = maxPrice;
      if (availability) params.availability = availability;
      if (minRating) params.min_rating = minRating;
      router.push(`/search${buildQuery(params)}`);
    },
    [q, category, maxPrice, availability, minRating, router],
  );

  const goToOffset = (nextOffset: number) => {
    const params = Object.fromEntries(searchParams.entries());
    params.offset = String(Math.max(0, nextOffset));
    router.push(`/search${buildQuery(params)}`);
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{searchParams.get("q") ? `Results for “${searchParams.get("q")}”` : "Compare products"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Exact-variant matching across demo retailer listings. Confirm final price on the retailer site.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <SlidersHorizontal className="h-4 w-4" /> Filters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={applyFilters} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="filter-q">Search</Label>
                  <Input id="filter-q" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Product or brand" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="filter-category">Category</Label>
                  <Select id="filter-category" value={category} onChange={(event) => setCategory(event.target.value)}>
                    <option value="">All categories</option>
                    {categories.map((item) => (
                      <option key={item.name} value={item.name}>
                        {item.name} ({item.count})
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="filter-price">Maximum price (₹)</Label>
                  <Input
                    id="filter-price"
                    type="number"
                    min={0}
                    value={maxPrice}
                    onChange={(event) => setMaxPrice(event.target.value)}
                    placeholder="e.g. 80000"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="filter-rating">Minimum rating</Label>
                  <Select id="filter-rating" value={minRating} onChange={(event) => setMinRating(event.target.value)}>
                    <option value="">Any rating</option>
                    <option value="3">3+</option>
                    <option value="4">4+</option>
                    <option value="4.5">4.5+</option>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="filter-availability">Availability</Label>
                  <Select id="filter-availability" value={availability} onChange={(event) => setAvailability(event.target.value)}>
                    <option value="">Any</option>
                    <option value="in_stock">In stock</option>
                    <option value="out_of_stock">Out of stock</option>
                  </Select>
                </div>
                <Button type="submit" className="w-full">
                  <Search className="mr-1 h-4 w-4" /> Apply filters
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setQ("");
                    setCategory("");
                    setMaxPrice("");
                    setAvailability("");
                    setMinRating("");
                    router.push("/search");
                  }}
                >
                  Clear all
                </Button>
              </form>
            </CardContent>
          </Card>
        </aside>

        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {result ? `${result.total} product${result.total === 1 ? "" : "s"} found` : "Loading..."}
            </p>
            {activeFilters.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {activeFilters.map((filter) => (
                  <span key={filter} className="rounded-full bg-muted px-2.5 py-1 text-xs">
                    {filter}
                  </span>
                ))}
              </div>
            )}
          </div>

          {error && <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}

          {loading && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-72 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          )}

          {!loading && result && result.items.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="font-medium">No exact matches</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try a broader category, remove the price cap or search by brand.
                </p>
              </CardContent>
            </Card>
          )}

          {!loading && result && result.items.length > 0 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {result.items.map((product: Product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
              <div className="mt-6 flex items-center justify-between">
                <Button variant="outline" disabled={offset === 0} onClick={() => goToOffset(offset - result.limit)}>
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  Showing {offset + 1}–{Math.min(offset + result.limit, result.total)} of {result.total}
                </span>
                <Button
                  variant="outline"
                  disabled={offset + result.limit >= result.total}
                  onClick={() => goToOffset(offset + result.limit)}
                >
                  Next
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-7xl px-4 py-8 text-sm text-muted-foreground">Loading search...</main>}>
      <SearchContent />
    </Suspense>
  );
}
