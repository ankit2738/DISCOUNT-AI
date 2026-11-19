import { notFound, redirect } from "next/navigation";

const CONSOLIDATED_ADMIN_ROUTES: Record<string, string> = {
  analytics: "/admin/analytics",
  products: "/admin/products",
  variants: "/admin/catalog",
  retailers: "/admin/retailers",
  prices: "/admin/prices",
  "price-records": "/admin/prices",
  coupons: "/admin/offers",
  "bank-offers": "/admin/offers",
  integrations: "/admin/integrations",
  ai: "/admin/integrations",
  affiliate: "/admin/analytics",
  "api-health": "/admin/system",
  reports: "/admin/community",
  audit: "/admin/audit",
};

export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const target = CONSOLIDATED_ADMIN_ROUTES[section];
  if (!target) notFound();
  redirect(target);
}
