"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Loader2, Send } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import type { Notification } from "@/lib/types";

export default function NotificationsPage() {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const payload = await apiFetch<{ items: Notification[] }>("/api/notifications?limit=100", { token });
      setNotifications(payload.items);
    } catch (fetchError) {
      setMessage(fetchError instanceof Error ? fetchError.message : "Could not load notifications");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markAll() {
    if (!token) return;
    await apiFetch("/api/notifications/read-all", { method: "POST", token });
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
  }

  async function markRead(id: number) {
    if (!token) return;
    await apiFetch(`/api/notifications/${id}/read`, { method: "PATCH", token });
    setNotifications((current) => current.map((item) => (item.id === id ? { ...item, read: true } : item)));
  }

  async function sendTest() {
    if (!token) return;
    try {
      const response = await apiFetch<{ results: { channel: string; status: string; detail: string }[]; note: string }>("/api/notifications/test?channel=in_app", {
        method: "POST",
        token,
      });
      setMessage(response.note);
      await load();
    } catch (testError) {
      setMessage(testError instanceof Error ? testError.message : "Test notification failed");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold"><Bell className="h-6 w-6 text-primary" /> Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">Delivery status is reported per channel. Only “sent” with a provider ID confirms external delivery.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void markAll()}>Mark all read</Button>
          <Button onClick={() => void sendTest()}><Send className="mr-1 h-4 w-4" /> Test in-app</Button>
        </div>
      </div>

      {message && <p className="mt-4 rounded-lg border bg-card p-3 text-sm">{message}</p>}

      <div className="mt-5 space-y-3">
        {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</p>}
        {notifications.map((notification) => (
          <Card key={notification.id}>
            <CardContent className="space-y-2 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{notification.title}</p>
                <div className="flex gap-1.5">
                  <Badge variant={notification.read ? "secondary" : "warning"}>{notification.read ? "Read" : "Unread"}</Badge>
                  <Badge variant="outline">{notification.channel}</Badge>
                  <Badge variant={notification.status === "sent" || notification.status === "stored" || notification.status === "delivered" ? "success" : notification.status === "failed" ? "destructive" : "secondary"}>
                    {notification.status}
                  </Badge>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{notification.body}</p>
              {notification.error && <p className="text-xs text-red-700">{notification.error}</p>}
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">{new Date(notification.created_at).toLocaleString("en-IN")}</p>
                {!notification.read && <Button size="sm" variant="ghost" onClick={() => void markRead(notification.id)}>Mark read</Button>}
              </div>
            </CardContent>
          </Card>
        ))}
        {!loading && notifications.length === 0 && (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No notifications yet.</CardContent></Card>
        )}
      </div>
    </div>
  );
}
