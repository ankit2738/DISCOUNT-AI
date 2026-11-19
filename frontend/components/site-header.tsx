"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, LogOut, Menu, Search, ShoppingCart, ShieldCheck } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/search", label: "Search" },
  { href: "/deals", label: "Today's deals" },
  { href: "/coupons", label: "Coupons" },
  { href: "/sale-events", label: "Sale events" },
  { href: "/dashboard/assistant", label: "AI Copilot" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (pathname === "/search") {
      setQuery("");
    }
  }, [pathname]);

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    router.push(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search");
  }

  return (
    <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-bold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-sm text-primary-foreground">D</span>
          <span className="hidden text-base sm:inline">DISCOUNT AI</span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                pathname.startsWith(item.href) && "bg-muted text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <form onSubmit={submitSearch} className="ml-auto hidden min-w-0 flex-1 items-center gap-2 md:flex lg:max-w-md">
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search iPhone, laptop, TV..."
              className="pl-9"
              aria-label="Search products"
            />
          </div>
          <Button type="submit" size="sm" variant="outline">
            Search
          </Button>
        </form>

        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <Button asChild variant="ghost" size="icon" aria-label="Cart">
            <Link href="/dashboard/cart">
              <ShoppingCart className="h-4 w-4" />
            </Link>
          </Button>
          {!loading && user ? (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/dashboard">
                  <LayoutDashboard className="mr-1 h-4 w-4" />
                  Dashboard
                </Link>
              </Button>
              {user.role === "admin" && (
                <Button asChild variant="ghost" size="icon" aria-label="Admin">
                  <Link href="/admin">
                    <ShieldCheck className="h-4 w-4" />
                  </Link>
                </Button>
              )}
              <Button variant="ghost" size="icon" aria-label="Log out" onClick={logout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            !loading && (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">Log in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/register">Sign up</Link>
                </Button>
              </>
            )
          )}
          <details className="relative lg:hidden">
            <summary className="grid h-9 w-9 cursor-pointer list-none place-items-center rounded-md hover:bg-muted">
              <Menu className="h-4 w-4" />
            </summary>
            <div className="absolute right-0 mt-2 w-64 rounded-lg border bg-card p-2 shadow-lg">
              <form onSubmit={submitSearch} className="mb-2 flex gap-2 p-1">
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search products..."
                  aria-label="Search products on mobile"
                  className="h-9"
                />
                <Button type="submit" size="sm" variant="outline">Go</Button>
              </form>
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-md px-3 py-2 text-sm hover:bg-muted"
                >
                  {item.label}
                </Link>
              ))}
              <Link href="/dashboard" className="block rounded-md px-3 py-2 text-sm hover:bg-muted">
                Dashboard
              </Link>
              <Link href="/how-it-works" className="block rounded-md px-3 py-2 text-sm hover:bg-muted">
                How it works
              </Link>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
