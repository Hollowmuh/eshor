import { Metadata } from "next"
import { notFound } from "next/navigation"
import { Heading, Text, clx } from "@modules/common/components/ui"
import { getTrackingByToken } from "@lib/data/orders"

export const metadata: Metadata = {
  title: "Track your order | eshor",
}

type Props = {
  params: Promise<{ token: string }>
}

// The state machine's main happy-path progression (packages/kernel's
// order-states.ts is the source of truth). `sewing` (made-to-order) is
// deliberately excluded -- no MTO products are live yet (P0 decision
// Q6) -- and pending_cod/pending_review/partially_paid are real states
// but don't fit a single linear path; a shopper in one of those sees
// their state named directly rather than forced onto this stepper.
const HAPPY_PATH = ["paid", "dispatched", "out_for_delivery", "delivered"] as const

const STATE_LABELS: Record<string, string> = {
  pending_payment: "Awaiting payment",
  partially_paid: "Partial payment received",
  pending_cod: "Awaiting cash-on-delivery confirmation",
  pending_review: "Under review",
  paid: "Payment confirmed",
  sewing: "Being made",
  dispatched: "Dispatched",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  closed: "Complete",
  cancelled: "Cancelled",
  refunded: "Refunded",
}

export default async function TrackPage(props: Props) {
  const { token } = await props.params
  const tracking = await getTrackingByToken(token)

  if (!tracking) {
    notFound()
  }

  const isTerminalAlert = tracking.state === "cancelled" || tracking.state === "refunded"
  const happyPathIndex = HAPPY_PATH.indexOf(tracking.state as (typeof HAPPY_PATH)[number])

  return (
    <div className="content-container py-12 max-w-2xl">
      <Heading level="h1" className="text-3xl-regular mb-2">
        Order {tracking.display_id ? `#${tracking.display_id}` : ""}
      </Heading>
      {tracking.first_name && (
        <Text className="txt-medium text-ui-fg-subtle mb-8">
          {tracking.first_name}{tracking.city ? ` · ${tracking.city}` : ""}
        </Text>
      )}

      {isTerminalAlert ? (
        <div className="bg-ui-bg-subtle border border-ui-border-base rounded-lg p-6">
          <Text className="txt-large-plus text-ui-fg-base">
            {STATE_LABELS[tracking.state]}
          </Text>
        </div>
      ) : happyPathIndex >= 0 ? (
        <ol className="flex flex-col gap-y-4">
          {HAPPY_PATH.map((state, i) => (
            <li key={state} className="flex items-center gap-x-3">
              <div
                className={clx(
                  "w-3 h-3 rounded-full flex-shrink-0",
                  i <= happyPathIndex ? "bg-ui-fg-interactive" : "bg-ui-border-base"
                )}
              />
              <Text
                className={clx(
                  "txt-medium",
                  i <= happyPathIndex ? "text-ui-fg-base" : "text-ui-fg-muted"
                )}
              >
                {STATE_LABELS[state]}
              </Text>
            </li>
          ))}
        </ol>
      ) : (
        <Text className="txt-large-plus text-ui-fg-base">
          {STATE_LABELS[tracking.state] ?? tracking.state}
        </Text>
      )}
    </div>
  )
}
