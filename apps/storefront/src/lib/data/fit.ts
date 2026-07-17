import { sdk } from "@lib/config"

export type ProductFit = {
  product_id: string
  fit: {
    fit_descriptor: "runs_small" | "true_to_size" | "runs_large" | null
    model_height_cm: number | null
    model_size_worn: string | null
    true_to_size_pct: number | null
    sample_size: number
  } | null
  measurements: Array<{ size: string; dimension: string; value_cm: number }>
  made_to_order_variants: Array<{ variant_id: string; lead_time_days: number | null }>
}

/**
 * Layer 3's PDP fit trio, fetched from the custom store route (P0 day 8:
 * apps/backend/src/api/store/products/[id]/fit). Not part of Medusa's
 * default product payload -- deliberately a separate fetch so a missing
 * garment-fit module (or an older product without fit data) degrades to
 * `fit: null` rather than breaking the whole PDP fetch.
 */
export const getProductFit = async (productId: string): Promise<ProductFit | null> => {
  return sdk.client
    .fetch<ProductFit>(`/store/products/${productId}/fit`, { method: "GET" })
    .catch(() => null)
}
