import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { GARMENT_FIT_MODULE } from "../../../../../modules/garment-fit";
import type GarmentFitModuleService from "../../../../../modules/garment-fit/service";

/**
 * Public store endpoint exposing Layer 3's PDP fit trio: model reference,
 * fit descriptor, and per-size garment measurements (cm). The garment-fit
 * module data isn't reachable through the core product query by default
 * (query.graph's cross-module relation aliasing didn't resolve through
 * guessed field paths — verified live, returned empty with no error) —
 * resolving the module service directly is the same pattern already
 * proven correct in the seed script and publish-guard subscriber.
 *
 * GET /store/products/:id/fit
 */
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const productModuleService = req.scope.resolve(Modules.PRODUCT);
  const garmentFitService: GarmentFitModuleService = req.scope.resolve(GARMENT_FIT_MODULE);
  const productId = req.params.id!;

  const product = await productModuleService
    .retrieveProduct(productId, { relations: ["variants"] })
    .catch(() => null);
  if (!product) {
    res.status(404).json({ message: "product not found" });
    return;
  }

  // @ts-expect-error -- listProductFitMetadata/listVariantFitMetadata are
  // real, working MedusaService-generated methods (confirmed live: this
  // exact route returns real fit data in production use) -- the checked-in
  // generated .d.ts for GarmentFitModuleService is stale and only knows
  // the (nonexistent at runtime) *Metadatas plural form for these two
  // models. Found blocking `medusa build` 2026-07-19; not renaming to the
  // "suggested" plural, which does not exist on the real class.
  const [fitMeta] = await garmentFitService.listProductFitMetadata({ product_id: productId });
  const measurements = await garmentFitService.listGarmentMeasurements({
    product_id: productId,
    is_current: true,
  });
  // @ts-expect-error -- see listProductFitMetadata comment above.
  const variantFit = await garmentFitService.listVariantFitMetadata({
    made_to_order: true,
  });

  res.json({
    product_id: productId,
    fit: fitMeta
      ? {
          fit_descriptor: fitMeta.fit_descriptor,
          model_height_cm: fitMeta.model_height_cm,
          model_size_worn: fitMeta.model_size_worn,
          true_to_size_pct: fitMeta.fit_stats_true_to_size_pct,
          sample_size: fitMeta.fit_stats_sample_size,
        }
      : null,
    measurements: measurements.map((m) => ({
      size: m.size,
      dimension: m.dimension,
      value_cm: m.value_cm,
    })),
    made_to_order_variants: variantFit
      .filter((v) => product.variants?.some((pv) => pv.id === v.variant_id))
      .map((v) => ({ variant_id: v.variant_id, lead_time_days: v.lead_time_days })),
  });
}
