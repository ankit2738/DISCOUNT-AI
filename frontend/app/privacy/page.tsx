import type { Metadata } from "next";

import { ContentPage } from "@/components/content-page";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <ContentPage
      eyebrow="Legal"
      title="Privacy policy"
      intro="How DISCOUNT AI handles personal data in this demo deployment, with controls for access, correction, export and deletion."
    >
      <h2>Scope and status</h2>
      <p>
        This policy describes the demo deployment. It is a product-engineering baseline, not a substitute for legal review. Before production use, the operator must review the policy against applicable Indian law, including the Digital Personal Data Protection Act, 2023, and any sector-specific obligations.
      </p>

      <h2>Data we collect</h2>
      <ul>
        <li>Account data: email, name, optional phone, hashed password, role and verification status.</li>
        <li>Optional profile and preferences: city, state, pincode, shopping persona, preferred brands/categories/retailers, budget range, personalisation consent and notification preferences.</li>
        <li>Product activity: watchlist items, price alerts, smart cart contents, purchases you record, recurring purchase reminders and warranty records.</li>
        <li>Community and marketplace content: reports, evidence URLs, votes and listing text you submit.</li>
        <li>Operational data: owner-only analytics events, audit logs, notification logs and security metadata.</li>
      </ul>

      <h2>Data we do not collect</h2>
      <p>
        DISCOUNT AI does not collect or store card numbers, CVV, UPI PINs, bank passwords or raw payment credentials. Payments in the coupon marketplace use a sandbox flow and must be replaced with an approved payment provider before live use.
      </p>

      <h2>Purposes</h2>
      <ul>
        <li>Provide price comparison, alerts, cart optimisation, AI recommendations and account features.</li>
        <li>Secure accounts, prevent abuse, moderate community content and resolve marketplace disputes.</li>
        <li>Measure aggregate product performance, including the cheaper-store click-through rate.</li>
      </ul>

      <h2>Consent and personalisation</h2>
      <p>
        Personalisation is opt-in through preferences and can be disabled. Marketing consent is separate from analytics consent. You can change notification channels and provide Telegram/WhatsApp details only if you choose to use those integrations; external delivery is not claimed unless configured.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        Active account data is retained while the account exists. Account deletion anonymises account identifiers and disables access while preserving limited transactional or audit records where needed for integrity, fraud prevention or legal obligations. You can export your data from the dashboard.
      </p>

      <h2>Sharing</h2>
      <p>
        Demo data is not sold. In production, sharing with retailers or affiliate networks should be limited to what is necessary for click attribution, with contracts and disclosures in place. AI providers receive only the content necessary for a request and must be configured by the operator.
      </p>

      <h2>Your controls</h2>
      <ul>
        <li>Export account data from Dashboard → Preferences.</li>
        <li>Delete the account from Dashboard → Preferences.</li>
        <li>Disable personalisation and marketing consent.</li>
        <li>Delete watchlist items, alerts and cart items at any time.</li>
      </ul>

      <h2>Contact</h2>
      <p>
        Use the contact form for privacy requests or questions. Do not send identity documents or sensitive financial data through the form.
      </p>
    </ContentPage>
  );
}
