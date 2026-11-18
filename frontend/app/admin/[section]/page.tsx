import { notFound, redirect } from "next/navigation";

const CONSOLIDATED_ADMIN_ROUTES: Record<string, string> = {
  analytics: "/admin/system",
  products: "/admin/catalog",
  variants: "/admin/catalog",
  retailers: "/admin/catalog",
  prices: "/admin/catalog",
  coupons: "/admin/offers",
  "bank-offers": "/admin/offers",
  ai: "/admin/system",
  affiliate: "/admin/system",
  "api-health": "/admin/system",
  reports: "/admin/community",
  audit: "/admin/system",
};

export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const target = CONSOLIDATED_ADMIN_ROUTES[section];
  if (!target) notFound();
  redirect(target);
}
