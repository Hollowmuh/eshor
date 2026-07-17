import { model } from "@medusajs/framework/utils";

/**
 * Per-variant made-to-order state (feature spec E1 AC1/EC1.2). A mixed
 * cart of in-stock + MTO sizes must itemize the longer promise — the
 * storefront reads lead_time_days per line, not a product-level guess.
 */
const VariantFitMetadata = model.define("variant_fit_metadata", {
  id: model.id().primaryKey(),
  variant_id: model.text().unique(), // Medusa variant id (linked, not FK)
  made_to_order: model.boolean().default(false),
  lead_time_days: model.number().nullable(),
});

export default VariantFitMetadata;
