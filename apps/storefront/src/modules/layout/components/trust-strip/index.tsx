/**
 * Layer 3 §1.2 site-wide trust strip -- the delivery promise + free
 * exchange offer no competitor in Layer 2's teardown publishes. Content
 * is a hardcoded constant for P0 (no products moving yet -- there is no
 * real SLA to report); wiring it through packages/config-client with a
 * remote, ops-editable source and the EC2.4 last-cached fallback is P1
 * scope (feature spec E3/ops runbook), once real delivery data exists to
 * calibrate the promise against (gotcha G-B3: publish from the first 20
 * real deliveries, not courier marketing).
 */
const TRUST_STRIP_MESSAGE =
  "Lagos 24–48h · Nationwide 2–4 days · Free size exchange in Lagos"

export default function TrustStrip() {
  return (
    <div
      className="w-full bg-ui-bg-subtle text-center text-small-regular py-2 px-4"
      data-testid="trust-strip"
    >
      {TRUST_STRIP_MESSAGE}
    </div>
  )
}
