import { Metadata } from "next"
import { Heading, Text } from "@modules/common/components/ui"

export const metadata: Metadata = {
  title: "Returns & Exchanges | eshor",
  description: "eshor's defect and size-exchange policy.",
}

const SECTION_HEADING = "text-2xl-semi text-ui-fg-base mt-8 mb-3"
const BODY = "txt-medium text-ui-fg-subtle mb-3"

export default function PoliciesPage() {
  return (
    <div className="content-container py-12 max-w-3xl">
      <div className="bg-ui-bg-subtle border border-ui-border-base rounded-lg p-4 mb-8">
        <Text className="txt-small-plus text-ui-fg-base">
          DRAFT — pending legal review.
        </Text>
      </div>

      <Heading level="h1" className="text-3xl-regular mb-2">
        Returns &amp; Exchanges
      </Heading>
      <Text className="txt-small text-ui-fg-muted mb-6">
        Version 1 (draft) — last updated 2026-07-18
      </Text>

      <Heading level="h2" className={SECTION_HEADING}>
        Defects — always free, no exceptions
      </Heading>
      <Text className={BODY}>
        If an item arrives damaged, defective, or genuinely not what you
        ordered, you&apos;re entitled to a free replacement or a full refund.
        This applies regardless of any promotional terms, exchange
        kill-switches, or other conditions described below — a defect claim
        is never subject to a fee, a time-limited window trick, or a
        &quot;store credit only&quot; downgrade. If you&apos;re not sure
        whether your issue counts as a defect, tell us anyway — we resolve
        it in your favor when it&apos;s ambiguous.
      </Text>

      <Heading level="h2" className={SECTION_HEADING}>
        Size exchanges — free within Lagos, subject to availability
      </Heading>
      <Text className={BODY}>
        If the size doesn&apos;t fit, we offer a free exchange for customers
        within Lagos, subject to size availability. This is a courtesy
        program, not a legal entitlement the way a defect remedy is — it may
        be paused or adjusted (for example, if exchange requests exceed a
        sustainable share of orders) without affecting your defect rights
        above.
      </Text>

      <Heading level="h2" className={SECTION_HEADING}>
        How to start a return or exchange
      </Heading>
      <Text className={BODY}>
        Message us on WhatsApp (link in your order confirmation) with your
        order number and a description of the issue. We&apos;ll route
        defect claims and size exchanges differently, but you don&apos;t
        need to know which one applies — just tell us what happened.
      </Text>
    </div>
  )
}
