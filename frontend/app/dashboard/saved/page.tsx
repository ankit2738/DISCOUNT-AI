"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Heart, Loader2, Trash2 } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch, buildQuery } from "@/lib/api";
import { formatINR } from "@/lib/format";
import type { WatchlistItem } from "@/lib/types";

const TYPES = [
  { value: "", label: "All" },
  { value: "saved", label: "Saved" },
  { value: "wishlist", label: "Wishlist" },
  { value: "watchlist", label: "Watchlist" },
];

export default function SavedPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [listType, setListType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<{ items: WatchlistItem[] }>(`/api/watchlist${buildQuery({ list_type: listType })}`, { token });
      setItems(payload.items);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Could not load saved products");
    } finally {
      setLoading(false);
    }
  }, [token, listType]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(id: number) {
    if (!token) return;
    try {
      await apiFetch(`/api/watchlist/${id}`, { method: "DELETE", token });
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not remove item");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold"><Heart className="h-6 w-6 text-primary" /> Saved & wishlist</h1>
          <p className="mt-1 text-sm text-muted-foreground">Products you saved, wishlisted or watch for price changes.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => setListType(type.value)}
              className={listType === type.value ? "rounded-lg border border-primary bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary" : "rounded-lg border px-3 py-1.5 text-xs text-muted-foreground"}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <div className="mt-5 space-y-3">
        {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</p>}
        {!loading && items.map((item) => (
          <Card key={item.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary">{item.list_type}</Badge>
                  <Badge variant="outline">{item.product.category}</Badge>
                  {item.product.is_demo && <Badge variant="warning">Demo</Badge>}
                </div>
                <Link href={`/products/${item.product.slug}`} className="mt-1 block font-semibold hover:text-primary">
                  {item.product.name}
                </Link>
                <p className="text-xs text-muted-foreground">{item.product.brand} · {item.product.model}</p>
                {item.notes && <p className="text-xs text-muted-foreground">Note: {item.notes}</p>}
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="font-bold text-primary">{formatINR(item.lowest_effective_price)}</p>
                  <p className="text-[11px] text-muted-foreground">best effective price</p>
                </div>
                <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => void remove(item.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!loading && items.length === 0 && (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nothing here yet. <Link href="/search" className="text-primary hover:underline">Browse products</Link> and use Save or Wishlist.
          </CardContent></Card>
        )}
      </div>
    </div>
  );
}
