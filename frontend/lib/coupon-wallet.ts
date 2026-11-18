const KEY = "discountai_coupon_wallet";

export function getWalletIds(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is number => typeof value === "number") : [];
  } catch {
    return [];
  }
}

export function toggleWalletCoupon(couponId: number): number[] {
  const current = getWalletIds();
  const next = current.includes(couponId) ? current.filter((id) => id !== couponId) : [...current, couponId];
  window.localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
