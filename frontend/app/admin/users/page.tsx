"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, ShieldCheck } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch, buildQuery } from "@/lib/api";

type AdminUser = {
  id: number;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  deleted: boolean;
};

export default function AdminUsersPage() {
  const { token } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load(q = "") {
    if (!token) return;
    setLoading(true);
    try {
      const payload = await apiFetch<{ items: AdminUser[]; total: number }>(`/api/admin/users${buildQuery({ q, limit: 200 })}`, { token });
      setUsers(payload.items);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Could not load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function changeRole(userId: number, role: string) {
    if (!token) return;
    setError(null);
    try {
      await apiFetch(`/api/admin/users/${userId}/role`, { method: "PATCH", token, body: { role } });
      setUsers((current) => current.map((user) => (user.id === userId ? { ...user, role } : user)));
      setMessage(`Role for user #${userId} updated to ${role}.`);
    } catch (roleError) {
      setError(roleError instanceof Error ? roleError.message : "Could not update role");
    }
  }

  async function toggleActive(user: AdminUser) {
    if (!token) return;
    try {
      await apiFetch(`/api/admin/users/${user.id}/active?active=${!user.is_active}`, { method: "PATCH", token });
      setUsers((current) => current.map((item) => (item.id === user.id ? { ...item, is_active: !item.is_active } : item)));
      setMessage(`User #${user.id} ${user.is_active ? "deactivated" : "activated"}.`);
    } catch (activeError) {
      setError(activeError instanceof Error ? activeError.message : "Could not update user");
    }
  }

  return (
    <div>
      <h1 className="flex items-center gap-2 text-3xl font-bold"><ShieldCheck className="h-6 w-6 text-primary" /> Users & roles</h1>
      <p className="mt-1 text-sm text-muted-foreground">Owner-only controls. Role changes and deactivation take effect immediately.</p>

      <form onSubmit={(event) => { event.preventDefault(); void load(query); }} className="mt-4 flex max-w-md gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search email or name" className="pl-9" />
        </div>
        <Button type="submit" variant="outline">Search</Button>
      </form>

      {message && <p className="mt-3 rounded-lg border bg-card p-3 text-sm">{message}</p>}
      {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {loading && <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading users...</p>}

      <div className="mt-5 space-y-2">
        {users.map((user) => (
          <Card key={user.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
              <div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant={user.role === "admin" ? "success" : user.role === "seller" ? "warning" : "secondary"}>{user.role}</Badge>
                  <Badge variant={user.is_active ? "success" : "destructive"}>{user.is_active ? "active" : "inactive"}</Badge>
                  {user.is_verified && <Badge variant="outline">verified</Badge>}
                  {user.deleted && <Badge variant="destructive">deleted</Badge>}
                </div>
                <p className="mt-1 font-medium">{user.full_name} <span className="text-xs font-normal text-muted-foreground">#{user.id}</span></p>
                <p className="text-xs text-muted-foreground">{user.email} · joined {new Date(user.created_at).toLocaleDateString("en-IN")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select aria-label={`Role for ${user.email}`} className="h-9 rounded-lg border bg-card px-2 text-xs" value={user.role} onChange={(event) => void changeRole(user.id, event.target.value)}>
                  <option value="user">user</option>
                  <option value="seller">seller</option>
                  <option value="admin">admin</option>
                </select>
                <Button size="sm" variant={user.is_active ? "destructive" : "outline"} onClick={() => void toggleActive(user)}>
                  {user.is_active ? "Deactivate" : "Activate"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!loading && users.length === 0 && <p className="text-sm text-muted-foreground">No users matched.</p>}
      </div>
    </div>
  );
}
