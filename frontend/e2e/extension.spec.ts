import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

async function parseFixture(page, fixture: string, url: string) {
  const html = readFileSync(resolve(process.cwd(), `../extension/tests/fixtures/${fixture}`), "utf8");
  await page.setContent(html);
  await page.addScriptTag({ path: resolve(process.cwd(), "../extension/parser.js") });
  return page.evaluate((pageUrl) => {
    const parser = (window as unknown as { DISCOUNT_AI_PARSER: { detectProduct: (doc: Document, value: string) => Record<string, unknown> } }).DISCOUNT_AI_PARSER;
    return parser.detectProduct(document, pageUrl);
  }, url);
}

test("extension parser extracts Amazon ASIN, price and selected variant", async ({ page }) => {
  const product = await parseFixture(page, "amazon.html", "https://www.amazon.in/dp/B0CHX1W1XY");
  expect(product.sku).toBe("B0CHX1W1XY");
  expect(product.price).toBe(69999);
  expect(product.name).toContain("iPhone 15");
  expect(product.variantHint).toContain("128GB");
  expect(product.variantHint).toContain("Black");
  expect(product.retailer).toBe("amazon");
  expect(product.isProductPage).toBe(true);
});

test("extension parser extracts Flipkart FSN and exact variant", async ({ page }) => {
  const product = await parseFixture(
    page,
    "flipkart.html",
    "https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm123?pid=MOBGTAGPXXXX",
  );
  expect(product.sku).toBe("MOBGTAGPXXXX");
  expect(product.price).toBe(69499);
  expect(product.variantHint).toContain("128 GB");
  expect(product.retailer).toBe("flipkart");
  expect(product.isProductPage).toBe(true);
});

test("extension resolve API identifies the exact variant and intelligence payload", async ({ request }) => {
  const resolved = await request.get("/api/extension/resolve", {
    params: {
      title: "Apple iPhone 15 (128GB, Black)",
      retailer: "amazon",
      external_id: "B0CHX1W1XY",
      variant_hint: "128GB Black",
    },
  });
  expect(resolved.ok()).toBeTruthy();
  const match = await resolved.json();
  expect(match.matched).toBe(true);
  expect(match.confidence).toBeGreaterThan(0);
  expect(match.variant.attributes.storage.toLowerCase()).toContain("128");
  expect(match.listing.id).toBeGreaterThan(0);

  const intelligence = await request.get("/api/extension/intelligence", {
    params: { listing_id: match.listing.id },
  });
  expect(intelligence.ok()).toBeTruthy();
  const payload = await intelligence.json();
  expect(payload.final_price).toBeGreaterThan(0);
  expect(payload.deal_score.score).toBeGreaterThanOrEqual(0);
  expect(payload.price_history.points.length).toBeGreaterThan(0);
  expect(payload.buy_or_wait.recommendation).toBeTruthy();
  expect(payload.comparison.length).toBeGreaterThan(1);
});
