import { Metadata } from "next"
import { Heading, Text } from "@modules/common/components/ui"

export const metadata: Metadata = {
  title: "Privacy Policy | eshor",
  description: "How eshor collects, uses, and protects your personal data.",
}

const SECTION_HEADING = "text-2xl-semi text-ui-fg-base mt-8 mb-3"
const BODY = "txt-medium text-ui-fg-subtle mb-3"

export default function PrivacyPage() {
  return (
    <div className="content-container py-12 max-w-3xl">
      <div className="bg-ui-bg-subtle border border-ui-border-base rounded-lg p-4 mb-8">
        <Text className="txt-small-plus text-ui-fg-base">
          DRAFT — pending legal review. This page describes eshor&apos;s actual
          data practices as implemented, but has not been reviewed by a
          lawyer. Do not treat it as a finalized legal document.
        </Text>
      </div>

      <Heading level="h1" className="text-3xl-regular mb-2">
        Privacy Policy
      </Heading>
      <Text className="txt-small text-ui-fg-muted mb-6">
        Version 1 (draft) — last updated 2026-07-18
      </Text>

      <Heading level="h2" className={SECTION_HEADING}>
        1. What we collect
      </Heading>
      <Text className={BODY}>
        When you place an order, we collect your email address (to identify
        your account and send order updates), phone number (for delivery and
        WhatsApp order updates), and delivery address (to ship your order).
        If you leave a fit review with a photo, we store that photo. We keep
        basic technical logs (like your device/browser fingerprint) to
        detect fraud and account takeover attempts.
      </Text>

      <Heading level="h2" className={SECTION_HEADING}>
        2. Why we collect it
      </Heading>
      <Text className={BODY}>
        We use your data to process and deliver your order, communicate
        order status (email and, if you opt in, WhatsApp), prevent fraud,
        and — only with your separate, explicit consent — send marketing
        messages. Transactional messages (order confirmations, delivery
        updates) are not something you can opt out of while you have an
        active order; marketing is always a separate choice.
      </Text>

      <Heading level="h2" className={SECTION_HEADING}>
        3. How long we keep it
      </Heading>
      <Text className={BODY}>
        Account data (email, phone, name) is kept for the life of your
        account. Fraud-detection logs are kept for 90 days and then
        automatically deleted. WhatsApp message content is kept for 90 days
        then pruned. Order financial records (amounts, dates — not your full
        address) are retained longer where Nigerian tax law requires it,
        even after a deletion request.
      </Text>

      <Heading level="h2" className={SECTION_HEADING}>
        4. Your rights
      </Heading>
      <Text className={BODY}>
        You can request that we delete your personal data at any time by
        contacting us. When we process a deletion request, we anonymize your
        account (your name is replaced, your address is wiped) but keep the
        underlying order financial records anonymized, as required for tax
        purposes. This does not affect your statutory rights under the
        Nigeria Data Protection Act (NDPA).
      </Text>

      <Heading level="h2" className={SECTION_HEADING}>
        5. Consent
      </Heading>
      <Text className={BODY}>
        By checking the consent box at checkout, you agree to this policy as
        it applies to processing your order. Marketing communications
        (separate from order updates) always require a separate, explicit
        opt-in — checking the checkout consent box alone does not sign you
        up for marketing.
      </Text>

      <Heading level="h2" className={SECTION_HEADING}>
        6. Contact
      </Heading>
      <Text className={BODY}>
        Questions about your data? Message us on WhatsApp (link in your
        order confirmation) or reach out through our contact page.
      </Text>
    </div>
  )
}
