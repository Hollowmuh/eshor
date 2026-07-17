"use client"

import { useState } from "react"
import { getDeliveryQuote, type DeliveryQuote } from "@lib/data/delivery-zones"
import { NIGERIAN_STATES } from "@lib/util/nigerian-states"

/** kobo -> "NGN24,500" (no decimals -- matches @eshor/kernel's formatNaira convention). */
function formatNaira(kobo: number): string {
  return `₦${Math.round(kobo / 100).toLocaleString("en-NG")}`
}

/**
 * Cart-level delivery estimator (P1.2). Deliberately standalone from
 * full checkout (P1.4 -- which doesn't exist yet): research confirmed
 * showing the delivery estimate at the cart stage, not just at
 * checkout, is what cuts the #1 cart-abandonment cause (surprise
 * shipping cost, Layer 1 S3.1). State-level only -- 774 LGAs is far too
 * granular for a flat-rate courier menu.
 */
export default function DeliveryEstimator() {
  const [state, setState] = useState("")
  const [quote, setQuote] = useState<DeliveryQuote | null>(null)
  const [loading, setLoading] = useState(false)
  const [notFound, setNotFound] = useState(false)

  const handleStateChange = async (value: string) => {
    setState(value)
    setQuote(null)
    setNotFound(false)
    if (!value) return

    setLoading(true)
    const result = await getDeliveryQuote(value)
    setLoading(false)

    if (result) {
      setQuote(result)
    } else {
      setNotFound(true)
    }
  }

  return (
    <div className="flex flex-col gap-y-2 py-2" data-testid="delivery-estimator">
      <label htmlFor="delivery-state" className="text-small-regular text-ui-fg-subtle">
        Estimate delivery
      </label>
      <select
        id="delivery-state"
        data-testid="delivery-state-select"
        className="border border-ui-border-base rounded-md p-2 text-small-regular bg-ui-bg-field"
        value={state}
        onChange={(e) => handleStateChange(e.target.value)}
      >
        <option value="">Select your state</option>
        {NIGERIAN_STATES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      {loading && (
        <p className="text-small-regular text-ui-fg-subtle" data-testid="delivery-loading">
          Checking delivery options...
        </p>
      )}

      {quote && (
        <p className="text-small-regular" data-testid="delivery-quote">
          {formatNaira(quote.fee_kobo)} delivery &middot; arrives in {quote.eta_min_days}
          {quote.eta_min_days !== quote.eta_max_days ? `–${quote.eta_max_days}` : ""} days
        </p>
      )}

      {notFound && (
        <p className="text-small-regular text-ui-fg-subtle" data-testid="delivery-not-found">
          We don&apos;t have a delivery rate for that state yet &mdash; message us on WhatsApp
          and we&apos;ll sort it out.
        </p>
      )}
    </div>
  )
}
