"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BellRing, Heart, Package, ShoppingCart, Sparkles } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { formatINR } from "@/lib/format";
import type { Alert, CartPayload, Notification, Purchase, WatchlistItem } from "@/lib/types";

export default function DashboardPage() {
  const { user, token } = useAuth();
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [cart, setCart] = useState<CartPayload | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    Promise.all([
      apiFetch<{ items: WatchlistItem[] }>("/api/watchlist", { token, signal: controller.signal }),
      apiFetch<{ items: Alert[] }>("/api/alerts", { token, signal: controller.signal }),
      apiFetch<CartPayload>("/api/cart", { token, signal: controller.signal }),
      apiFetch<{ items: Purchase[] }>("/api/purchases", { token, signal: controller.signal }),
      apiFetch<{ items: Notification[]; has_unread: boolean }>("/api/notifications?limit=5", { token, signal: controller.signal }),
    ])
      .then(([watchlistPayload, alertsPayload, cartPayload, purchasesPayload, notificationsPayload]) => {
        setWatchlist(watchlistPayload.items);
        setAlerts(alertsPayload.items);
        setCart(cartPayload);
        setPurchases(purchasesPayload.items);
        setNotifications(notificationsPayload.items);
      })
      .catch((fetchError) => {
        if (!controller.signal.aborted) setError(fetchError instanceof Error ? fetchError.message : "Could not load dashboard");
      });
    return () => controller.abort();
  }, [token]);

  const activeAlerts = alerts.filter((alert) => alert.status === "active");
  const unread = notifications.filter((notification) => !notification.read);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Welcome, {user?.full_name?.split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your price intelligence at a glance.</p>
        </div>
        <Button asChild variant="outline"><Link href="/dashboard/assistant"><Sparkles className="mr-1 h-4 w-4" /> Ask the Copilot</Link></Button>
      </div>

      {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Saved products", value: watchlist.length, href: "/dashboard/saved", icon: Heart },
          { label: "Active alerts", value: activeAlerts.length, href: "/dashboard/alerts", icon: BellRing },
          { label: "Cart items", value: cart?.item_count ?? 0, href: "/dashboard/cart", icon: ShoppingCart },
          { label: "Purchases tracked", value: purchases.length, href: "/dashboard/purchases", icon: Package },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <stat.icon className="h-4 w-4 text-primary" />
                <span className="text-2xl font-bold">{stat.value}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{stat.label}</p>
              <Link href={stat.href} className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                Open <ArrowRight className="h-3 w-3" />
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Recent saved products</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {watchlist.slice(0, 4).map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <Link href={`/products/${item.product.slug}`} className="text-sm font-medium hover:text-primary">{item.product.name}</Link>
                  <p className="text-xs text-muted-foreground">{item.list_type}</p>
                </div>
                <p className="text-sm font-semibold">{formatINR(item.lowest_effective_price)}</p>
              </div>
            ))}
            {watchlist.length === 0 && <p className="text-sm text-muted-foreground">No saved products yet. <Link href="/search" className="text-primary hover:underline">Browse products</Link>.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Recent notifications</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {notifications.map((notification) => (
              <div key={notification.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{notification.title}</p>
                  {!notification.read && <Badge variant="warning">Unread</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{notification.body}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Channel {notification.channel} · status {notification.status}</p>
              </div>
            ))}
            {notifications.length === 0 && <p className="text-sm text-muted-foreground">No notifications yet.</p>}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle className="text-base">Cart snapshot</CardTitle></CardHeader>
        <CardContent>
          {cart && cart.items.length > 0 ? (
            <div className="space-y-2">
              {cart.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>{item.listing.product_name ?? item.listing.title} × {item.quantity}</span>
                  <span className="font-medium">{formatINR(item.line_total)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t pt-2 text-sm font-semibold">
                <span>Subtotal</span>
                <span>{formatINR(cart.subtotal)}</span>
              </div>
              <Button asChild size="sm" className="mt-2"><Link href="/dashboard/cart">Optimise cart</Link></Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Your cart is empty. Open a product and add a retailer listing to get started.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
