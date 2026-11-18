"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  BadgePercent,
  CalendarDays,
  LayoutDashboard,
  ShieldCheck,
  Store,
  Users,
  Boxes,
} from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/catalog", label: "Catalogue & prices", icon: Boxes },
  { href: "/admin/offers", label: "Coupons & bank offers", icon: BadgePercent },
  { href: "/admin/community", label: "Community moderation", icon: ShieldCheck },
  { href: "/admin/marketplace", label: "Marketplace", icon: Store },
  { href: "/admin/campaigns", label: "Sale campaigns", icon: CalendarDays },
  { href: "/admin/system", label: "System & analytics", icon: BarChart3 },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useAuth();

  if (loading) return <main className="px-4 py-16 text-sm text-muted-foreground">Checking admin session...</main>;

  if (!user || user.role !== "admin") {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <Card>
          <CardContent className="space-y-3 pt-6 text-center">
            <h1 className="text-xl font-bold">Admin access required</h1>
            <p className="text-sm text-muted-foreground">Log in with the seeded admin account to access owner-only controls.</p>
            <p className="rounded-lg bg-muted p-2 text-xs">admin@discountai.in / AdminPass123!</p>
            <div className="flex justify-center gap-2">
              <Button asChild><Link href="/login?next=/admin">Log in</Link></Button>
              <Button asChild variant="outline"><Link href="/dashboard">Dashboard</Link></Button>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside>
          <Card className="sticky top-24">
            <CardContent className="space-y-1 p-3">
              <p className="flex items-center gap-2 px-2 py-2 text-sm font-semibold"><Activity className="h-4 w-4 text-primary" /> Admin console</p>
              {LINKS.map((link) => {
                const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
                return (
                  <Link key={link.href} href={link.href} className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground", active && "bg-primary/10 font-medium text-primary")}>
                    <link.icon className="h-4 w-4" /> {link.label}
                  </Link>
                );
              })}
              <Link href="/dashboard" className="mt-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                Back to shopper view
              </Link>
            </CardContent>
          </Card>
        </aside>
        <section className="min-w-0">{children}</section>
      </div>
    </main>
  );
}
