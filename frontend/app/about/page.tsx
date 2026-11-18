import type { Metadata } from "next";

import { ContentPage } from "@/components/content-page";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <ContentPage
      eyebrow="About DISCOUNT AI"
      title="Buy Smarter. Not Just Cheaper."
      intro="DISCOUNT AI is a shopping-intelligence product for Indian online shoppers. It compares exact product variants, explains prices with evidence, and helps you decide what to buy, where, and when."
    >
      <h2>Why we exist</h2>
      <p>
        Search results show the biggest claimed discount, not the best real price. Variants get mixed together, coupon and bank rules are hidden until checkout, and “MRP” is often treated as a permanent reference even when the street price has been lower for months. DISCOUNT AI separates the facts: current listing price, delivery, eligible coupon, eligible bank offer, historical observations, and the final effective price.
      </p>

      <h2>What makes the product different</h2>
      <ul>
        <li>Exact-variant matching: a 128GB phone is never compared with a 256GB model.</li>
        <li>Historical context: charts and statistics are stored observations, not marketing claims.</li>
        <li>Transparent Deal Score: factors and evidence are exposed instead of a black-box badge.</li>
        <li>Honest limitations: demo data, unconfigured integrations and missing evidence are labelled.</li>
        <li>Affiliate independence: commission never changes ranking or recommendations.</li>
      </ul>

      <h2>Demo deployment</h2>
      <p>
        This deployment uses seeded retailer records, prices, coupons, bank offers, campaigns, marketplace entries and community reports. They are clearly labelled demo data. No live retailer feed, paid AI provider, payment gateway, Telegram or WhatsApp provider is claimed to be active unless server configuration verifies it.
      </p>

      <h2>Primary success metric</h2>
      <p>
        The primary product metric is cheaper-store click-through rate: the share of comparison sessions where a shopper clicks through to a genuinely cheaper exact-variant store. Page views and commission are secondary.
      </p>

      <h2>Data protection</h2>
      <p>
        Account, preference, watchlist, alert and purchase data are handled with purpose limitation and user controls. Card numbers and CVV are never collected by DISCOUNT AI. Privacy export and account deletion flows are available in the dashboard. See the privacy policy for details.
      </p>
    </ContentPage>
  );
}
