import { MedusaService } from "@medusajs/framework/utils";
import GarmentMeasurement from "./models/garment-measurement";
import ProductFitMetadata from "./models/product-fit-metadata";
import VariantFitMetadata from "./models/variant-fit-metadata";

class GarmentFitModuleService extends MedusaService({
  GarmentMeasurement,
  ProductFitMetadata,
  VariantFitMetadata,
}) {
  /**
   * "Update" a measurement without ever mutating history (EC1.1): mark
   * the current row superseded, insert a new one at version+1.
   */
  async setMeasurement(input: {
    productId: string;
    size: string;
    dimension: string;
    valueCm: number;
  }): Promise<void> {
    const existing = await this.listGarmentMeasurements({
      product_id: input.productId,
      size: input.size,
      dimension: input.dimension,
      is_current: true,
    });

    const nextVersion = existing.length > 0 ? (existing[0]!.version ?? 1) + 1 : 1;

    if (existing.length > 0) {
      await this.updateGarmentMeasurements(
        existing.map((row) => ({ id: row.id, is_current: false })),
      );
    }

    await this.createGarmentMeasurements({
      product_id: input.productId,
      size: input.size,
      dimension: input.dimension,
      value_cm: input.valueCm,
      version: nextVersion,
      is_current: true,
    });
  }

  /**
   * Publish-guard check (E1 AC2/AC3): every size present in `sizes` must
   * have a complete measurement row per required dimension, and the
   * product must carry fit metadata. Returns a list of human-readable
   * problems — empty means publishable.
   */
  async checkPublishable(input: {
    productId: string;
    sizes: string[];
    requiredDimensions: string[];
  }): Promise<string[]> {
    const problems: string[] = [];

    const measurements = await this.listGarmentMeasurements({
      product_id: input.productId,
      is_current: true,
    });

    for (const size of input.sizes) {
      for (const dimension of input.requiredDimensions) {
        const found = measurements.find((m) => m.size === size && m.dimension === dimension);
        if (!found) {
          problems.push(`missing measurement: size=${size} dimension=${dimension}`);
        }
      }
    }

    const [fitMeta] = await this.listProductFitMetadata({ product_id: input.productId });
    if (!fitMeta) {
      problems.push("missing product fit metadata (fit_descriptor, model reference)");
    } else {
      if (!fitMeta.fit_descriptor) problems.push("missing fit_descriptor");
      if (fitMeta.model_height_cm == null) problems.push("missing model_height_cm");
      if (!fitMeta.model_size_worn) problems.push("missing model_size_worn");
    }

    return problems;
  }
}

export default GarmentFitModuleService;
