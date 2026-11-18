import type { Metadata } from "next";

import { ContentPage } from "@/components/content-page";

export const metadata: Metadata = { title: "Terms & conditions" };

export default function TermsPage() {
  return (
    <ContentPage
      eyebrow="Legal"
      title="Terms & conditions"
      intro="The rules for using this demo deployment of DISCOUNT AI, including price-data limitations, affiliate disclosure, community content and marketplace sandbox payments."
    >
      <h2>Acceptance</h2>
      <p>
        By using DISCOUNT AI, you agree to these terms. If you do not agree, do not use the service. The service is a demo and may be changed, suspended or reset without notice.
      </p>

      <h2>Price and availability information</h2>
      <p>
        Prices, coupons, bank offers, availability, delivery charges, ratings and campaign dates may be delayed, incomplete or incorrect. Seeded records are labelled demo data. The retailer checkout is authoritative. DISCOUNT AI does not guarantee a price, discount, stock level, cashback or eligibility.
      </p>

      <h2>No financial or legal advice</h2>
      <p>
        Deal scores, fake-discount signals and buy-or-wait recommendations are informational. They are not guarantees, accusations of wrongdoing, financial advice or a promise of future prices. You are responsible for your purchase decisions.
      </p>

      <h2>Affiliate links</h2>
      <p>
        Some retailer links may be affiliate links. DISCOUNT AI may earn a commission if you purchase. Ranking, Deal Score and recommendations are independent of commission. Sponsored placement must be labelled and must not override the cheaper-store result.
      </p>

      <h2>Accounts</h2>
      <p>
        Keep credentials secure and provide accurate information. Do not attempt to access other users’ data, scrape the service, bypass rate limits or interfere with security. Accounts may be suspended for abuse, fraud or violation of these terms.
      </p>

      <h2>Community content</h2>
      <p>
        Reports, votes and evidence are user submissions, not retailer verification. Do not upload unlawful, misleading, private or infringing content. Moderation may remove content and preserve records for safety. Reputation is a product feature, not a guarantee of accuracy.
      </p>

      <h2>Coupon marketplace</h2>
      <p>
        Marketplace transactions use a sandbox payment flow. No real money transfer, escrow, settlement or live payment processing is claimed. Users must not attempt to transfer prohibited coupons or violate retailer terms. Disputes and moderation flows exist, but production launch requires legal, payment-provider and fraud review.
      </p>

      <h2>AI Copilot</h2>
      <p>
        AI output may be incorrect or incomplete. The Copilot is constrained to catalogue records where possible and uses a rule-based fallback when no external provider is configured. Do not rely on it for safety-critical, legal, medical or financial decisions.
      </p>

      <h2>Intellectual property</h2>
      <p>
        The service interface, original content and software are protected by applicable law. Retailer names, logos and product names belong to their owners. Demo product imagery is replaced by placeholders.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the maximum extent permitted by applicable law, the operator is not liable for indirect or consequential loss, lost savings, missed deals or reliance on inaccurate data. Nothing in these terms excludes liability that cannot lawfully be excluded.
      </p>

      <h2>Governing law</h2>
      <p>
        These terms are intended to be governed by Indian law. Production launch requires jurisdiction-specific legal review. The demo does not create a consumer guarantee or a binding service-level agreement.
      </p>
    </ContentPage>
  );
}
