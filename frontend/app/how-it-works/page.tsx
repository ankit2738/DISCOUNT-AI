import type { Metadata } from "next";
import Link from "next/link";

import { ContentPage } from "@/components/content-page";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "How it works" };

export default function HowItWorksPage() {
  return (
    <ContentPage
      eyebrow="How it works"
      title="Evidence before discounts"
      intro="A practical walkthrough of search, exact-variant comparison, price history, offer calculation, alerts, and the AI Copilot."
    >
      <h2>1. Search and choose the exact variant</h2>
      <p>
        Search by product, brand or category. Filters narrow the catalogue by price, rating and availability. Open a product and select the exact variant (for example, 128GB vs 256GB). The comparison endpoint only uses listings attached to that variant.
      </p>

      <h2>2. Read the effective price</h2>
      <p>
        Each retailer row shows list price, delivery charge, available coupon, coupon discount, and the effective price. Eligible bank offers appear as optional payment scenarios. Cashback is separated from the immediate payable amount because it is not an instant discount.
      </p>

      <h2>3. Check the evidence</h2>
      <ul>
        <li><strong>Price history:</strong> observed points over 30, 90, 180 or 365 days with range statistics.</li>
        <li><strong>Deal Score:</strong> a 0–100 score with factor explanations and a confidence value.</li>
        <li><strong>Fake-discount check:</strong> compares claimed MRP and discount against recorded observations; it does not accuse a retailer of fraud.</li>
        <li><strong>Buy now or wait:</strong> a grounded recommendation with reasons and limitations, using your product’s own history and configured sale windows.</li>
      </ul>

      <h2>4. Save, alert and optimise</h2>
      <p>
        Save products, watch specific variants and set a target price. In-app notifications work without external credentials. Email, Telegram and WhatsApp delivery require server credentials and are reported honestly. The smart cart optimiser can split a basket across stores, applying one eligible verified coupon per retailer and an eligible bank offer where configured.
      </p>

      <h2>5. Use the AI Copilot carefully</h2>
      <p>
        The Copilot retrieves real catalogue rows within your budget and category. If an external AI provider is not configured, a deterministic rule-based response is used. Recommendations are labelled, limitations are shown, and the model is not allowed to invent products or prices.
      </p>

      <h2>6. Verify before checkout</h2>
      <p>
        Retailer prices, availability, coupons and card eligibility change. DISCOUNT AI shows the observation time and source, but the retailer checkout is authoritative. This demo deployment uses seeded data and does not guarantee any price.
      </p>

      <div className="not-prose flex flex-wrap gap-2 pt-2">
        <Button asChild><Link href="/search">Start comparing</Link></Button>
        <Button asChild variant="outline"><Link href="/deals">See today&apos;s deals</Link></Button>
      </div>
    </ContentPage>
  );
}
