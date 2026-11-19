"use client";

import { useCallback, useEffect, useState } from "react";
import { Boxes, Loader2, Trash2 } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import type { Product } from "@/lib/types";

export default function AdminProductsPage() {
  const { token } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<{ items: Product[] }>("/api/admin/products", { token });
      setProducts(payload.items);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Could not load products");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createProduct(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    setMessage(null);
    try {
      await apiFetch("/api/admin/products", {
        method: "POST",
        token,
        body: { name, brand, model, category, description, specs: {} },
      });
      setMessage(`Product created: ${name}. Add variants before listings can reference it.`);
      setName("");
      setBrand("");
      setModel("");
      setCategory("");
      setDescription("");
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create product");
    }
  }

  async function deleteProduct(product: Product) {
    if (!token) return;
    if (!window.confirm(`Delete ${product.name}? This only succeeds when no dependent records remain.`)) return;
    setError(null);
    try {
      await apiFetch(`/api/admin/products/${product.id}`, { method: "DELETE", token });
      setMessage(`Product #${product.id} deleted.`);
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete product");
    }
  }

  const filtered = products.filter((product) => {
    const term = query.trim().toLowerCase();
    return !term || `${product.name} ${product.brand} ${product.model} ${product.category}`.toLowerCase().includes(term);
  });

  return (
    <div>
      <h1 className="flex items-center gap-2 text-3xl font-bold"><Boxes className="h-6 w-6 text-primary" /> Products</h1>
      <p className="mt-1 text-sm text-muted-foreground">Catalogue records, exact variants and demo status. Listings and prices are managed separately.</p>

      {message && <Alert className="mt-4" variant="success"><AlertDescription>{message}</AlertDescription></Alert>}
      {error && <Alert className="mt-4" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Catalogue ({products.length})</CardTitle>
              <Input className="h-9 max-w-xs" placeholder="Filter products..." value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Filter products" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading products...</p>}
            {filtered.map((product) => (
              <div key={product.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">#{product.id} {product.name}</p>
                    <p className="text-xs text-muted-foreground">{product.brand} · {product.model} · {product.category}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {product.is_demo && <Badge variant="warning">Demo</Badge>}
                    <Badge variant="outline">{product.variants?.length ?? 0} variants</Badge>
                    <Button size="icon" variant="ghost" aria-label="Delete product" onClick={() => void deleteProduct(product)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                {product.variants?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {product.variants.map((variant) => <Badge key={variant.id} variant="secondary">{variant.name} · {variant.sku}</Badge>)}
                  </div>
                ) : <p className="mt-2 text-xs text-amber-700">No variants yet.</p>}
              </div>
            ))}
            {!loading && filtered.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No matching products.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Create product</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={createProduct} className="space-y-2">
              <div className="space-y-1"><Label htmlFor="admin-product-name">Name</Label><Input id="admin-product-name" required value={name} onChange={(event) => setName(event.target.value)} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label htmlFor="admin-product-brand">Brand</Label><Input id="admin-product-brand" required value={brand} onChange={(event) => setBrand(event.target.value)} /></div>
                <div className="space-y-1"><Label htmlFor="admin-product-model">Model</Label><Input id="admin-product-model" required value={model} onChange={(event) => setModel(event.target.value)} /></div>
              </div>
              <div className="space-y-1"><Label htmlFor="admin-product-category">Category</Label><Input id="admin-product-category" required value={category} onChange={(event) => setCategory(event.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="admin-product-description">Description</Label><Textarea id="admin-product-description" value={description} onChange={(event) => setDescription(event.target.value)} /></div>
              <Button type="submit" className="w-full">Create product</Button>
            </form>
            <p className="mt-2 text-[11px] text-muted-foreground">Add variants from the combined catalogue screen, then attach retailer listings with real demo observations.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
