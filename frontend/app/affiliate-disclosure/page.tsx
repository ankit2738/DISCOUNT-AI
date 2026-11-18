import type { Metadata } from "next";
import Link from "next/link";

import { ContentPage } from "@/components/content-page";

export const metadata: Metadata = { title: "Affiliate disclosure" };

export default function AffiliateDisclosurePage() {
  return (
    <ContentPage
      eyebrow="Transparency"
      title="Affiliate disclosure"
      intro="DISCOUNT AI may earn commissions from some retailer links. This page explains what that means and what it does not change."
    >
      <h2>The short version</h2>
      <p>
        Some outbound links to retailers may be affiliate or tracked links. If you click one and buy something, DISCOUNT AI may receive a commission or referral fee at no extra cost to you. The demo dataset contains placeholder retailer links and no live affiliate contract is claimed.
      </p>

      <h2>What commission never changes</h2>
      <ul>
        <li>Exact-variant matching and the set of compared listings.</li>
        <li>The effective-price calculation shown to you.</li>
        <li>Deal Score factors, confidence and explanations.</li>
        <li>Buy-or-wait recommendations.</li>
        <li>The identity of the cheapest store.</li>
      </ul>

      <h2>Sponsored content</h2>
      <p>
        If DISCOUNT AI introduces sponsored placements in production, they must be clearly labelled and separated from organic comparison results. A sponsor cannot purchase a “cheapest” badge or suppress a cheaper competitor.
      </p>

      <h2>Retailer terms</h2>
      <p>
        Prices, availability and offer eligibility are controlled by the retailer. DISCOUNT AI does not process the retailer purchase, does not control delivery or returns, and cannot guarantee that a coupon or card offer will be honoured at checkout.
      </p>

      <h2>Primary metric</h2>
      <p>
        The product is optimised primarily for cheaper-store click-through rate — the share of comparison sessions that lead to a genuinely cheaper exact-variant store — rather than raw commission or click volume. See the <Link href="/about" className="text-primary hover:underline">About page</Link> for more.
      </p>

      <h2>Questions</h2>
      <p>
        Use the <Link href="/contact" className="text-primary hover:underline">contact form</Link> for questions about affiliate relationships or ranking.
      </p>
    </ContentPage>
  );
}
