import { describe, expect, it } from "vitest";

import { formatDate, formatDateTime, formatINR, titleCase } from "@/lib/format";

describe("formatINR", () => {
  it("formats positive INR values", () => {
    expect(formatINR(79990)).toContain("79,990");
  });

  it("returns an em dash for missing or invalid values", () => {
    expect(formatINR(null)).toBe("—");
    expect(formatINR(undefined)).toBe("—");
    expect(formatINR(Number.NaN)).toBe("—");
  });
});

describe("date formatting", () => {
  it("returns an em dash for empty dates", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
  });

  it("formats ISO timestamps", () => {
    expect(formatDate("2026-01-15T10:30:00Z")).toContain("2026");
    expect(formatDateTime("2026-01-15T10:30:00Z")).toContain("2026");
  });
});

describe("titleCase", () => {
  it("capitalises each word", () => {
    expect(titleCase("smart price alerts")).toBe("Smart Price Alerts");
  });
});
