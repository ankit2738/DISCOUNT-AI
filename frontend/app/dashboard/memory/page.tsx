"use client";

import { useCallback, useEffect, useState } from "react";
import { Brain, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { formatINR } from "@/lib/format";
import type { MemoryContext, Product, RecurringPurchase, ShoppingMemory } from "@/lib/types";

const MEMORY_TYPES: ShoppingMemory["memory_type"][] = ["preference", "budget", "category", "brand", "note", "shopping_goal"];

export default function MemoryPage() {
  const { token } = useAuth();
  const [memories, setMemories] = useState<ShoppingMemory[]>([]);
  const [context, setContext] = useState<MemoryContext | null>(null);
  const [recurring, setRecurring] = useState<RecurringPurchase[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [memoryType, setMemoryType] = useState<ShoppingMemory["memory_type"]>("preference");
  const [memoryKey, setMemoryKey] = useState("");
  const [memoryValue, setMemoryValue] = useState("");
  const [consent, setConsent] = useState(true);

  const [productId, setProductId] = useState("");
  const [recurringLabel, setRecurringLabel] = useState("");
  const [intervalDays, setIntervalDays] = useState("30");
  const [lastPrice, setLastPrice] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [memoryPayload, contextPayload, recurringPayload, productPayload] = await Promise.all([
        apiFetch<{ items: ShoppingMemory[] }>("/api/memory", { token }),
        apiFetch<MemoryContext>("/api/memory/context", { token }),
        apiFetch<{ items: RecurringPurchase[] }>("/api/recurring-purchases", { token }),
        apiFetch<{ items: Product[] }>("/api/products?limit=100"),
      ]);
      setMemories(memoryPayload.items);
      setContext(contextPayload);
      setRecurring(recurringPayload.items);
      setProducts(productPayload.items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load shopping memory");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveMemory(event: React.FormEvent) {
    event.preventDefault();
    if (!token || saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await apiFetch<ShoppingMemory>("/api/memory", {
        method: "POST",
        token,
        body: {
          memory_type: memoryType,
          memory_key: memoryKey,
          memory_value: memoryValue,
          consent,
          context: {},
        },
      });
      setMemoryKey("");
      setMemoryValue("");
      setMessage("Memory saved. Only entries with consent enabled are shared with the Copilot.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save memory");
    } finally {
      setSaving(false);
    }
  }

  async function updateConsent(memory: ShoppingMemory) {
    if (!token) return;
    setError(null);
    try {
      await apiFetch<ShoppingMemory>("/api/memory", {
        method: "POST",
        token,
        body: {
          memory_type: memory.memory_type,
          memory_key: memory.memory_key,
          memory_value: memory.memory_value,
          consent: !memory.consent,
          context: memory.context,
        },
      });
      await load();
    } catch (consentError) {
      setError(consentError instanceof Error ? consentError.message : "Could not update consent");
    }
  }

  async function removeMemory(memory: ShoppingMemory) {
    if (!token) return;
    setError(null);
    try {
      await apiFetch(`/api/memory/${memory.id}`, { method: "DELETE", token });
      setMessage("Memory entry deleted.");
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete memory");
    }
  }

  async function clearMemory() {
    if (!token || !window.confirm("Delete all shopping memory for this account? This cannot be undone.")) return;
    setError(null);
    try {
      await apiFetch("/api/memory?confirm=true", { method: "DELETE", token });
      setMessage("All shopping memory cleared.");
      await load();
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "Could not clear memory");
    }
  }

  async function addRecurring(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    setMessage(null);
    try {
      await apiFetch("/api/recurring-purchases", {
        method: "POST",
        token,
        body: {
          product_id: Number(productId),
          label: recurringLabel,
          interval_days: Number(intervalDays),
          last_price: Number(lastPrice),
        },
      });
      setRecurringLabel("");
      setLastPrice("");
      setMessage("Recurring purchase reminder created.");
      await load();
    } catch (recurringError) {
      setError(recurringError instanceof Error ? recurringError.message : "Could not create reminder");
    }
  }

  async function pauseRecurring(record: RecurringPurchase) {
    if (!token) return;
    setError(null);
    try {
      await apiFetch(`/api/recurring-purchases/${record.id}`, { method: "DELETE", token });
      setMessage("Recurring purchase reminder paused.");
      await load();
    } catch (pauseError) {
      setError(pauseError instanceof Error ? pauseError.message : "Could not pause reminder");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold"><Brain className="h-6 w-6 text-primary" /> Shopping memory</h1>
          <p className="mt-1 text-sm text-muted-foreground">Review and control what the AI Copilot remembers. Every entry is editable and deletable.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="destructive" onClick={() => void clearMemory()} disabled={memories.length === 0}>
            <Trash2 className="mr-1 h-4 w-4" /> Clear all
          </Button>
        </div>
      </div>

      {message && <Alert className="mt-4" variant="success"><AlertDescription>{message}</AlertDescription></Alert>}
      {error && <Alert className="mt-4" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Consented memories", value: context?.counts.memory_entries ?? 0 },
          { label: "Saved products", value: context?.counts.saved_products ?? 0 },
          { label: "Active alerts", value: context?.counts.active_alerts ?? 0 },
          { label: "Purchases", value: context?.counts.purchases ?? 0 },
          { label: "Recurring", value: context?.counts.recurring_purchases ?? 0 },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-5">
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {context && (
        <p className="mt-3 text-xs text-muted-foreground">
          {context.consent_note} Tracked spend: {formatINR(context.spend_tracked)}.
        </p>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader><CardTitle className="text-base">Remembered details</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading memory...</p>}
            {!loading && memories.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No shopping memory yet. Add a preference or budget on the right.</p>
            )}
            {memories.map((memory) => (
              <div key={memory.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary">{memory.memory_type}</Badge>
                      <span className="text-sm font-medium">{memory.memory_key}</span>
                      <Badge variant={memory.consent ? "success" : "outline"}>{memory.consent ? "Consented" : "Not shared"}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{memory.memory_value || "No value stored"}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">Source {memory.source} · updated {new Date(memory.updated_at).toLocaleString("en-IN")}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => void updateConsent(memory)}>
                      {memory.consent ? "Stop sharing" : "Allow sharing"}
                    </Button>
                    <Button size="icon" variant="ghost" aria-label="Delete memory" onClick={() => void removeMemory(memory)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Plus className="h-4 w-4" /> Add memory</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={saveMemory} className="space-y-2">
              <div className="space-y-1">
                <Label htmlFor="memory-type">Type</Label>
                <Select id="memory-type" value={memoryType} onChange={(event) => setMemoryType(event.target.value as ShoppingMemory["memory_type"])}>
                  {MEMORY_TYPES.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="memory-key">Key</Label>
                <Input id="memory-key" required maxLength={160} placeholder="e.g. monthly budget" value={memoryKey} onChange={(event) => setMemoryKey(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="memory-value">Value</Label>
                <Input id="memory-value" maxLength={2000} placeholder="e.g. 45000" value={memoryValue} onChange={(event) => setMemoryValue(event.target.value)} />
              </div>
              <label className="flex items-start gap-2 text-xs">
                <input type="checkbox" className="mt-0.5" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                <span>Allow the Copilot to use this memory for personalised, evidence-based answers. You can revoke this at any time.</span>
              </label>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />} Save memory
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle className="text-base">Recurring purchases</CardTitle></CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="space-y-2">
            {recurring.map((record) => (
              <div key={record.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                <div>
                  <p className="font-medium">{record.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {record.product?.name ?? `Product #${record.product?.id ?? "—"}`} · every {record.interval_days} days · last {formatINR(record.last_price)} · now {formatINR(record.current_lowest_price)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Next reminder {record.next_reminder_at ? new Date(record.next_reminder_at).toLocaleDateString("en-IN") : "not scheduled"} · savings if rebought {formatINR(record.savings_if_rebought)}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => void pauseRecurring(record)}>Pause</Button>
              </div>
            ))}
            {recurring.length === 0 && <p className="text-sm text-muted-foreground">No recurring purchases tracked yet.</p>}
          </div>
          <form onSubmit={addRecurring} className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="recurring-product">Product</Label>
              <Select id="recurring-product" required value={productId} onChange={(event) => {
                setProductId(event.target.value);
                const product = products.find((item) => item.id === Number(event.target.value));
                if (product && !recurringLabel) setRecurringLabel(product.name.slice(0, 120));
              }}>
                <option value="">Select a product</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
              </Select>
            </div>
            <div className="space-y-1"><Label htmlFor="recurring-label">Label</Label><Input id="recurring-label" required maxLength={120} value={recurringLabel} onChange={(event) => setRecurringLabel(event.target.value)} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label htmlFor="recurring-interval">Every (days)</Label><Input id="recurring-interval" type="number" min={1} max={365} required value={intervalDays} onChange={(event) => setIntervalDays(event.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="recurring-price">Last price (₹)</Label><Input id="recurring-price" type="number" min={1} required value={lastPrice} onChange={(event) => setLastPrice(event.target.value)} /></div>
            </div>
            <Button type="submit" className="w-full" disabled={!productId}>Add reminder</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
