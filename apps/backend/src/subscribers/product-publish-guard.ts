import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";
import { GARMENT_FIT_MODULE } from "../modules/garment-fit";
import type GarmentFitModuleService from "../modules/garment-fit/service";

const REQUIRED_DIMENSIONS_BY_CATEGORY: Record<string, string[]> = {
  // conservative default: every product needs at least these two until
  // per-category dimension config lands (feature spec E1 AC1).
  default: ["bust", "waist", "length"],
};

function getProductSizes(product: {
  options?: Array<{ title: string; values?: Array<{ value: string }> }>;
}): string[] {
  const sizeOption = product.options?.find((o) => o.title.toLowerCase() === "size");
  return sizeOption?.values?.map((v) => v.value) ?? [];
}

/**
 * Publish guard (E1 AC2/AC3, hardening §7 build-order item "publish guard
 * blocks incomplete measurements"). Reactive enforcement: Medusa v2 core
 * workflows don't expose a stable pre-commit validation hook for every
 * Medusa version, so this listens for the product.updated event and, if
 * the product was just set to "published" without complete garment
 * measurements + fit metadata for every size, reverts it to draft and
 * logs the specific problems. The revert is immediate (same event loop
 * tick) so a published-without-data product is never customer-visible
 * for longer than one event dispatch.
 */
export default async function productPublishGuardHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>): Promise<void> {
  const productModuleService = container.resolve(Modules.PRODUCT);
  const garmentFitService: GarmentFitModuleService = container.resolve(GARMENT_FIT_MODULE);
  const logger = container.resolve("logger");

  const product = await productModuleService.retrieveProduct(data.id, {
    relations: ["options", "options.values"],
  });

  if (product.status !== "published") return;

  const sizes = getProductSizes(product);
  if (sizes.length === 0) {
    logger.warn(`publish guard: product ${product.id} has no "Size" option — skipping check`);
    return;
  }

  const requiredDimensions =
    REQUIRED_DIMENSIONS_BY_CATEGORY[product.type_id ?? "default"] ??
    REQUIRED_DIMENSIONS_BY_CATEGORY.default!;

  const problems = await garmentFitService.checkPublishable({
    productId: product.id,
    sizes,
    requiredDimensions,
  });

  if (problems.length > 0) {
    await productModuleService.updateProducts(product.id, { status: "draft" });
    logger.error(
      `publish guard: reverted product ${product.id} to draft — ${problems.join("; ")}`,
    );
  }
}

export const config: SubscriberConfig = {
  event: "product.updated",
};
