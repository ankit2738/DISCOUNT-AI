import { beforeEach, describe, expect, it } from "vitest";

import { getWalletIds, toggleWalletCoupon } from "@/lib/coupon-wallet";

beforeEach(() => {
  window.localStorage.clear();
});

describe("coupon wallet", () => {
  it("starts empty", () => {
    expect(getWalletIds()).toEqual([]);
  });

  it("adds and removes coupon ids", () => {
    expect(toggleWalletCoupon(4)).toEqual([4]);
    expect(toggleWalletCoupon(9)).toEqual([4, 9]);
    expect(toggleWalletCoupon(4)).toEqual([9]);
  });

  it("ignores corrupt stored values", () => {
    window.localStorage.setItem("discountai_coupon_wallet", "not-json");
    expect(getWalletIds()).toEqual([]);

    window.localStorage.setItem("discountai_coupon_wallet", '["bad", 12, null]');
    expect(getWalletIds()).toEqual([12]);
  });
});
