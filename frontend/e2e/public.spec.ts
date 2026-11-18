import { expect, test } from "@playwright/test";

test("home page exposes the product promise and demo disclosure", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Buy Smarter/i })).toBeVisible();
  await expect(page.getByText(/demo/i).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Search/i }).first()).toBeVisible();
});

test("search finds the seeded iPhone and opens its exact-variant analysis", async ({ page }) => {
  await page.goto("/search?q=iphone%2015");
  const iPhone = page.getByRole("heading", { name: "Apple iPhone 15" });
  await expect(iPhone).toBeVisible();
  await page.getByRole("link", { name: /Apple iPhone 15/i }).first().click();
  await expect(page).toHaveURL(/\/products\/apple-iphone-15$/);
  await expect(page.getByRole("heading", { name: "Apple iPhone 15" })).toBeVisible();
  await expect(page.getByText(/Exact-variant retailer comparison/i)).toBeVisible();
  await expect(page.getByText(/effective price includes coupon/i)).toBeVisible();
});

test("demo shopper can log in and reach the dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@discountai.in");
  await page.getByLabel("Password").fill("DemoPass123!");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: /Welcome/i })).toBeVisible();
  await expect(page.getByRole("complementary").getByRole("link", { name: "Price alerts" })).toBeVisible();
});

test("admin route rejects anonymous visitors and admits the seeded admin", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Admin access required" })).toBeVisible();

  await page.goto("/login?next=/admin");
  await page.getByLabel("Email").fill("admin@discountai.in");
  await page.getByLabel("Password").fill("AdminPass123!");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Admin overview" })).toBeVisible();
});

test("comparison page shows sorted exact-variant retailer cards", async ({ page, request }) => {
  const search = await request.get("/api/products/search?q=iphone%2015");
  expect(search.ok()).toBeTruthy();
  const product = (await search.json()).items[0];

  await page.goto(`/compare?product=${product.id}`);
  await expect(page.getByRole("heading", { name: "Apple iPhone 15" })).toBeVisible();
  await expect(page.getByText("Potential saving vs highest store")).toBeVisible();
  await expect(page.getByText(/Amazon|Flipkart|Croma/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Go to / }).first()).toBeVisible();
});
