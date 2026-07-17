import { sdk } from "@lib/config"

export type DeliveryQuote = {
  state: string
  area: string | null
  fee_kobo: number
  eta_min_days: number
  eta_max_days: number
  courier: string
}

/**
 * Cart-level delivery estimator (P1.2, Layer 3 cart spec: "delivery-fee
 * estimator live-updating from delivery-zones"). Client-callable --
 * unlike lib/data/fit.ts, this is invoked directly from a "use client"
 * component on state-select, not server-fetched at render time.
 */
export const getDeliveryQuote = async (
  state: string,
  area?: string
): Promise<DeliveryQuote | null> => {
  const params = new URLSearchParams({ state })
  if (area) params.set("area", area)

  return sdk.client
    .fetch<DeliveryQuote>(`/store/delivery-zones?${params.toString()}`, {
      method: "GET",
    })
    .catch(() => null)
}
