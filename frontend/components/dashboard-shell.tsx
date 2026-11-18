"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgePercent,
  BellRing,
  Bot,
  Heart,
  LayoutDashboard,
  LogOut,
  MapPin,
  Megaphone,
  Package,
  Settings,
  ShoppingCart,
  Sparkles,
  Store,
  Users,
} from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/saved", label: "Saved & wishlist", icon: Heart },
  { href: "/dashboard/alerts", label: "Price alerts", icon: BellRing },
  { href: "/dashboard/assistant", label: "AI Copilot", icon: Bot },
  { href: "/dashboard/cart", label: "Smart cart", icon: ShoppingCart },
  { href: "/dashboard/coupons", label: "Coupon wallet", icon: BadgePercent },
  { href: "/dashboard/purchases", label: "Purchases", icon: Package },
  { href: "/dashboard/community", label: "Community", icon: Users },
  { href: "/dashboard/marketplace", label: "Marketplace", icon: Store },
  { href: "/dashboard/notifications", label: "Notifications", icon: Megaphone },
  { href: "/dashboard/preferences", label: "Preferences & privacy", icon: Settings },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();

  if (loading) {
    return <main className="px-4 py-16 text-sm text-muted-foreground">Checking your session...</main>;
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <Card>
          <CardContent className="space-y-3 pt-6 text-center">
            <h1 className="text-xl font-bold">Log in to continue</h1>
            <p className="text-sm text-muted-foreground">
              Your dashboard contains personal watchlists, alerts, cart, purchases and privacy controls.
            </p>
            <div className="flex justify-center gap-2">
              <Button asChild><Link href="/login?next=/dashboard">Log in</Link></Button>
              <Button asChild variant="outline"><Link href="/register">Sign up</Link></Button>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="grid gap-6 lg:grid-cols-[250px_1fr]">
        <aside>
          <Card className="sticky top-24">
            <CardContent className="space-y-4 p-4">
              <div>
                <p className="text-sm font-semibold">{user.full_name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <MapPin className="h-3 w-3" /> {user.profile.city ?? "City not set"} · {user.role}
                </p>
              </div>
              <nav className="space-y-1">
                {LINKS.map((link) => {
                  const active = link.href === "/dashboard" ? pathname === link.href : pathname.startsWith(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
                        active && "bg-primary/10 font-medium text-primary",
                      )}
                    >
                      <link.icon className="h-4 w-4" />
                      {link.label}
                    </Link>
                  );
                })}
              </nav>
              {user.role === "admin" && (
                <Button asChild variant="outline" className="w-full">
                  <Link href="/admin"><Sparkles className="mr-1 h-4 w-4" /> Admin console</Link>
                </Button>
              )}
              <Button variant="ghost" className="w-full justify-start" onClick={logout}>
                <LogOut className="mr-2 h-4 w-4" /> Log out
              </Button>
            </CardContent>
          </Card>
        </aside>
        <section className="min-w-0">{children}</section>
      </div>
    </main>
  );
}
