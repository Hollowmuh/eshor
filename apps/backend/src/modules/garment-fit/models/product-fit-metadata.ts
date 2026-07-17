import { model } from "@medusajs/framework/utils";

/**
 * One row per product: the trio Layer 3 mandates above every size
 * selector — model reference, fit descriptor, and the PDP fit-stats
 * aggregate written by the review flow (P2). model_height_cm / size_worn
 * are required before a product can publish (E1 AC3, enforced by the
 * publish-guard subscriber, not just this model).
 */
const ProductFitMetadata = model.define("product_fit_metadata", {
  id: model.id().primaryKey(),
  product_id: model.text().unique(),
  fit_descriptor: model.enum(["runs_small", "true_to_size", "runs_large"]).nullable(),
  model_height_cm: model.number().nullable(),
  model_size_worn: model.text().nullable(),
  // materialized aggregate (hardening: computed at review-publish time,
  // never at PDP request time) — populated by the P2 fit-reviews module.
  fit_stats_true_to_size_pct: model.number().nullable(),
  fit_stats_sample_size: model.number().default(0),
});

export default ProductFitMetadata;
