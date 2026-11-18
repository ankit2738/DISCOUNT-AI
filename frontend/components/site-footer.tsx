import Link from "next/link";

const COLUMNS = [
  {
    title: "Shop smarter",
    links: [
      { href: "/search", label: "Product search" },
      { href: "/deals", label: "Today's deals" },
      { href: "/coupons", label: "Coupon discovery" },
      { href: "/bank-offers", label: "Bank offers" },
      { href: "/sale-events", label: "Sale events" },
    ],
  },
  {
    title: "Your account",
    links: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/dashboard/saved", label: "Saved products" },
      { href: "/dashboard/alerts", label: "Price alerts" },
      { href: "/dashboard/assistant", label: "AI Copilot" },
      { href: "/dashboard/preferences", label: "Preferences" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/contact", label: "Contact" },
      { href: "/affiliate-disclosure", label: "Affiliate disclosure" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy policy" },
      { href: "/terms", label: "Terms & conditions" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t bg-card">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-1">
          <div className="flex items-center gap-2 font-bold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-sm text-primary-foreground">D</span>
            DISCOUNT AI
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Buy Smarter. Not Just Cheaper. Independent price intelligence for Indian online shoppers.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Demo deployment. Retailer records are labelled demo data and are not live retailer quotes.
          </p>
        </div>
        {COLUMNS.map((column) => (
          <div key={column.title}>
            <h4 className="text-sm font-semibold">{column.title}</h4>
            <ul className="mt-3 space-y-2">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-muted-foreground hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t px-4 py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} DISCOUNT AI. Affiliate links may earn a commission; rankings are never influenced by commission.
      </div>
    </footer>
  );
}
