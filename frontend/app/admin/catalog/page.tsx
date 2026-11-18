"use client";

import { useEffect, useState } from "react";
import { Boxes, Loader2, RefreshCw } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import { formatINR } from "@/lib/format";
import type { Listing, Product, Retailer } from "@/lib/types";

function PriceEditor({ listing, token }: { listing: Listing; token: string | null }) {
  const [price, setPrice] = useState(String(listing.price));
  const [availability, setAvailability] = useState(listing.availability);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    if (!token) return;
    setSaving(true);
    setMessage(null);
    try {
      await apiFetch(`/api/admin/listings/${listing.id}/price`, {
        method: "PATCH",
        token,
        body: { price: Number(price), availability },
      });
      setMessage("Saved + history point added");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="text-[11px] text-muted-foreground" htmlFor={`price-${listing.id}`}>Price</label>
        <Input id={`price-${listing.id}`} type="number" className="h-8 w-28 text-xs" value={price} onChange={(event) => setPrice(event.target.value)} />
      </div>
      <select aria-label="Availability" className="h-8 rounded-md border bg-card px-2 text-xs" value={availability} onChange={(event) => setAvailability(event.target.value)}>
        <option value="in_stock">in_stock</option>
        <option value="limited">limited</option>
        <option value="out_of_stock">out_of_stock</option>
      </select>
      <Button size="sm" variant="outline" onClick={() => void save()} disabled={saving}>Save</Button>
      {message && <span className="text-[11px] text-muted-foreground">{message}</span>}
    </div>
  );
}

export default function AdminCatalogPage() {
  const { token } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");

  const [variantProductId, setVariantProductId] = useState("");
  const [sku, setSku] = useState("");
  const [variantName, setVariantName] = useState("");

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const [productsPayload, listingsPayload, retailersPayload] = await Promise.all([
        apiFetch<{ items: Product[] }>("/api/admin/products", { token }),
        apiFetch<{ items: Listing[] }>("/api/admin/listings?limit=200", { token }),
        apiFetch<{ items: Retailer[] }>("/api/admin/retailers", { token }),
      ]);
      setProducts(productsPayload.items);
      setListings(listingsPayload.items);
      setRetailers(retailersPayload.items);
      if (!variantProductId && productsPayload.items[0]) setVariantProductId(String(productsPayload.items[0].id));
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Could not load catalogue");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function createProduct(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    try {
      await apiFetch("/api/admin/products", {
        method: "POST",
        token,
        body: { name, brand, model, category, description, specs: {} },
      });
      setMessage(`Product created: ${name}.`);
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

  async function createVariant(event: React.FormEvent) {
    event.preventDefault();
    if (!token || !variantProductId) return;
    try {
      await apiFetch(`/api/admin/products/${variantProductId}/variants`, {
        method: "POST",
        token,
        body: { sku, variant_name: variantName, attributes: {} },
      });
      setMessage(`Variant created for product #${variantProductId}. Add a retailer listing through the API/admin workflow.`);
      setSku("");
      setVariantName("");
      await load();
    } catch (variantError) {
      setError(variantError instanceof Error ? variantError.message : "Could not create variant");
    }
  }

  async function refreshDemo(slug: string) {
    if (!token) return;
    try {
      const response = await apiFetch<{ updated_listings: number; note: string }>(`/api/admin/retailers/${slug}/refresh-demo`, { method: "POST", token });
      setMessage(`${slug}: ${response.updated_listings} listings refreshed. ${response.note}`);
      await load();
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Could not refresh demo prices");
    }
  }

  async function toggleRetailer(retailer: Retailer) {
    if (!token) return;
    const nextStatus = retailer.integration_status === "live" ? "demo" : "live";
    try {
      await apiFetch(`/api/admin/retailers/${retailer.id}`, { method: "PATCH", token, body: { integration_status: nextStatus } });
      setMessage(`${retailer.name} integration status set to ${nextStatus}. Live claiming still requires real credentials.`);
      await load();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update retailer");
    }
  }

  return (
    <div>
      <h1 className="flex items-center gap-2 text-3xl font-bold"><Boxes className="h-6 w-6 text-primary" /> Catalogue & price monitoring</h1>
      <p className="mt-1 text-sm text-muted-foreground">Create catalogue records, add variants, and manually record price observations with audit history.</p>

      {message && <p className="mt-3 rounded-lg border bg-card p-3 text-sm">{message}</p>}
      {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {loading && <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading catalogue...</p>}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Create product</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={createProduct} className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label htmlFor="product-name">Name</Label><Input id="product-name" required value={name} onChange={(event) => setName(event.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="product-brand">Brand</Label><Input id="product-brand" required value={brand} onChange={(event) => setBrand(event.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="product-model">Model</Label><Input id="product-model" required value={model} onChange={(event) => setModel(event.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="product-category">Category</Label><Input id="product-category" required value={category} onChange={(event) => setCategory(event.target.value)} /></div>
              <div className="space-y-1 sm:col-span-2"><Label htmlFor="product-description">Description</Label><Textarea id="product-description" value={description} onChange={(event) => setDescription(event.target.value)} /></div>
              <Button type="submit" className="sm:col-span-2">Create product</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Add variant</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={createVariant} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="variant-product">Product</Label>
                <select id="variant-product" className="h-10 w-full rounded-lg border bg-card px-3 text-sm" value={variantProductId} onChange={(event) => setVariantProductId(event.target.value)}>
                  {products.map((product) => <option key={product.id} value={product.id}>#{product.id} {product.name}</option>)}
                </select>
              </div>
              <div className="space-y-1"><Label htmlFor="variant-sku">SKU</Label><Input id="variant-sku" required value={sku} onChange={(event) => setSku(event.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="variant-name">Variant name</Label><Input id="variant-name" required value={variantName} onChange={(event) => setVariantName(event.target.value)} placeholder="e.g. 256GB Black" /></div>
              <Button type="submit">Add variant</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle className="text-base">Price monitoring ({listings.length} listings)</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {listings.map((listing) => (
            <div key={listing.id} className="grid gap-2 rounded-lg border p-3 lg:grid-cols-[1fr_auto]">
              <div>
                <p className="text-sm font-medium">#{listing.id} {listing.product_name ?? listing.title}</p>
                <p className="text-xs text-muted-foreground">
                  {listing.retailer?.name} · {listing.variant?.name} · MRP {formatINR(listing.mrp)} · delivery {formatINR(listing.delivery_charge)} · checked {new Date(listing.last_checked_at).toLocaleString("en-IN")}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {listing.is_demo && <Badge variant="warning">Demo</Badge>}
                  <Badge variant="secondary">{listing.source}</Badge>
                </div>
              </div>
              <PriceEditor listing={listing} token={token} />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Products & variants</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {products.map((product) => (
              <div key={product.id} className="rounded-lg border p-3">
                <p className="text-sm font-medium">#{product.id} {product.name}</p>
                <p className="text-xs text-muted-foreground">{product.brand} · {product.category} · {product.variants.length} variants</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {product.variants.map((variant) => <Badge key={variant.id} variant="outline">{variant.name} ({variant.sku})</Badge>)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Retailers & adapters</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {retailers.map((retailer) => (
              <div key={retailer.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">#{retailer.id} {retailer.name}</p>
                  <p className="text-xs text-muted-foreground">{retailer.slug} · {retailer.website}</p>
                  <div className="mt-1 flex gap-1.5">
                    <Badge variant={retailer.integration_status === "live" ? "success" : "secondary"}>{retailer.integration_status}</Badge>
                    {retailer.is_demo && <Badge variant="warning">Demo</Badge>}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => void refreshDemo(retailer.slug)}><RefreshCw className="mr-1 h-3 w-3" /> Refresh demo</Button>
                  <Button size="sm" variant="ghost" onClick={() => void toggleRetailer(retailer)}>Toggle live</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
