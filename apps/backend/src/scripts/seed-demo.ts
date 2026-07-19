/**
 * seed:demo — the fixture set storefront, tests, and staging all share
 * (hardening §5 test-data rule). 12 products x 4 sizes x 2 colors, real
 * garment measurement tables, mixed stock/MTO/sold-out states, plus a
 * final deliberately-incomplete product that proves the publish guard
 * (checkpoint C3 exit criterion 4).
 *
 * Run: npx medusa exec ./src/scripts/seed-demo.ts
 */
import type { ExecArgs, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  createInventoryLevelsWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createTaxRegionsWorkflow,
  deleteProductsWorkflow,
  updateProductsWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows";
import { GARMENT_FIT_MODULE } from "../modules/garment-fit";
import type GarmentFitModuleService from "../modules/garment-fit/service";

/**
 * Idempotent: create the Nigeria region + NGN currency support + tax
 * region if they don't already exist. Layer 1's whole premise is NGN
 * pricing for a Nigerian buyer — reusing the starter's Europe/EUR region
 * for our catalog would be a silent, misleading shortcut.
 */
async function ensureNigeriaRegion(
  container: MedusaContainer,
): Promise<{ regionId: string; stockLocationId: string }> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const storeModuleService = container.resolve(Modules.STORE);
  const regionModuleService = container.resolve(Modules.REGION);
  const stockLocationModuleService = container.resolve(Modules.STOCK_LOCATION);

  const [store] = await storeModuleService.listStores();
  if (!store) throw new Error("no store found — run `medusa db:migrate` first");

  // listStores() doesn't populate the supported_currencies relation;
  // query.graph does (this is the pattern initial-data-seed.ts itself
  // uses for every nested read — module service list() calls are
  // shallow by default in v2).
  const { data: storesWithCurrencies } = await query.graph({
    entity: "store",
    filters: { id: store.id },
    fields: ["id", "supported_currencies.currency_code", "supported_currencies.is_default"],
  });
  const currencies = storesWithCurrencies[0]?.supported_currencies ?? [];

  const hasNgn = currencies.some((c) => c!.currency_code === "ngn");
  if (!hasNgn) {
    logger.info("Adding NGN as a supported store currency...");
    await updateStoresWorkflow(container).run({
      input: {
        selector: { id: store.id },
        update: {
          supported_currencies: [
            ...currencies.map((c) => ({
              currency_code: c!.currency_code,
              is_default: c!.is_default,
            })),
            { currency_code: "ngn", is_default: false },
          ],
        },
      },
    });
  }

  let [region] = await regionModuleService.listRegions({ name: "Nigeria" });
  if (!region) {
    logger.info("Creating Nigeria region...");
    const { result } = await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: "Nigeria",
            currency_code: "ngn",
            countries: ["ng"],
            payment_providers: ["pp_system_default"],
          },
        ],
      },
    });
    region = result[0]!;

    await createTaxRegionsWorkflow(container).run({
      input: [{ country_code: "ng", provider_id: "tp_system" }],
    });
  }

  // Reuse whichever stock location the starter's own seed created — a
  // dedicated Lagos warehouse + fulfillment set is real P1 delivery-zone
  // work (Layer 4/5), out of scope for a P0 browsable-catalog milestone.
  const [stockLocation] = await stockLocationModuleService.listStockLocations({});
  if (!stockLocation) {
    throw new Error("no stock location found — run `medusa db:migrate` first");
  }

  return { regionId: region.id, stockLocationId: stockLocation.id };
}

const SIZES = ["S", "M", "L", "XL"] as const;
const DIMENSIONS = ["bust", "waist", "length"] as const;

// base cm per dimension at size M; other sizes derived with a per-size delta,
// which is realistic garment grading, not just arbitrary demo numbers.
const BASE_CM: Record<(typeof DIMENSIONS)[number], number> = {
  bust: 92,
  waist: 74,
  length: 133,
};
const SIZE_DELTA: Record<(typeof SIZES)[number], number> = {
  S: -4,
  M: 0,
  L: 4,
  XL: 10,
};

interface DemoProductSpec {
  title: string;
  colors: [string, string];
  priceNaira: number;
  modelHeightCm: number;
  modelSizeWorn: (typeof SIZES)[number];
  fitDescriptor: "runs_small" | "true_to_size" | "runs_large";
  /** index into SIZES that is made-to-order; -1 = none */
  mtoSizeIndex: number;
  /** index into SIZES that is sold out (stock 0); -1 = none */
  soldOutSizeIndex: number;
}

const DEMO_PRODUCTS: DemoProductSpec[] = [
  { title: "Aja Dress", colors: ["Forest Adire", "Midnight Black"], priceNaira: 24500, modelHeightCm: 175, modelSizeWorn: "M", fitDescriptor: "true_to_size", mtoSizeIndex: -1, soldOutSizeIndex: 3 },
  { title: "Kola Wrap Top", colors: ["Terracotta", "Ivory"], priceNaira: 18000, modelHeightCm: 168, modelSizeWorn: "S", fitDescriptor: "runs_small", mtoSizeIndex: -1, soldOutSizeIndex: -1 },
  { title: "Eko Wide-Leg Trousers", colors: ["Charcoal", "Sand"], priceNaira: 32000, modelHeightCm: 172, modelSizeWorn: "M", fitDescriptor: "true_to_size", mtoSizeIndex: 3, soldOutSizeIndex: -1 },
  { title: "Lumina Occasion Gown", colors: ["Wine", "Emerald"], priceNaira: 58000, modelHeightCm: 178, modelSizeWorn: "L", fitDescriptor: "runs_large", mtoSizeIndex: 0, soldOutSizeIndex: -1 },
  { title: "Yaba Denim Jacket", colors: ["Indigo", "Black Wash"], priceNaira: 27500, modelHeightCm: 174, modelSizeWorn: "M", fitDescriptor: "true_to_size", mtoSizeIndex: -1, soldOutSizeIndex: -1 },
  { title: "Ibeju Linen Set", colors: ["Cream", "Olive"], priceNaira: 35000, modelHeightCm: 170, modelSizeWorn: "S", fitDescriptor: "true_to_size", mtoSizeIndex: -1, soldOutSizeIndex: 0 },
  { title: "Bode Kaftan", colors: ["Royal Blue", "Rust"], priceNaira: 29500, modelHeightCm: 180, modelSizeWorn: "L", fitDescriptor: "runs_large", mtoSizeIndex: 2, soldOutSizeIndex: -1 },
  { title: "Femi Tailored Blazer", colors: ["Black", "Camel"], priceNaira: 42000, modelHeightCm: 176, modelSizeWorn: "M", fitDescriptor: "runs_small", mtoSizeIndex: -1, soldOutSizeIndex: -1 },
  { title: "Nike Ankara Coord Set", colors: ["Sunburst", "Ocean"], priceNaira: 26000, modelHeightCm: 166, modelSizeWorn: "S", fitDescriptor: "true_to_size", mtoSizeIndex: -1, soldOutSizeIndex: 2 },
  { title: "Tola Midi Skirt", colors: ["Blush", "Slate"], priceNaira: 19500, modelHeightCm: 169, modelSizeWorn: "M", fitDescriptor: "true_to_size", mtoSizeIndex: -1, soldOutSizeIndex: -1 },
  { title: "Wande Silk Blouse", colors: ["Champagne", "Noir"], priceNaira: 22000, modelHeightCm: 171, modelSizeWorn: "S", fitDescriptor: "runs_small", mtoSizeIndex: -1, soldOutSizeIndex: -1 },
  { title: "Doyin Statement Jumpsuit", colors: ["Cobalt", "Blackout"], priceNaira: 38500, modelHeightCm: 177, modelSizeWorn: "L", fitDescriptor: "true_to_size", mtoSizeIndex: 3, soldOutSizeIndex: -1 },
];

function handleize(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default async function seedDemo({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve("logger");
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL);
  const productModuleService = container.resolve(Modules.PRODUCT);
  const garmentFitService: GarmentFitModuleService = container.resolve(GARMENT_FIT_MODULE);

  const [defaultSalesChannel] = await salesChannelModuleService.listSalesChannels({
    name: "Default Sales Channel",
  });
  if (!defaultSalesChannel) {
    throw new Error(
      "no default sales channel found — run `medusa db:migrate` first (it seeds one)",
    );
  }

  const { stockLocationId } = await ensureNigeriaRegion(container);

  // idempotency: wipe any previous run of OUR demo products (by handle)
  // before reseeding, so `pnpm seed:demo` is safe to re-run — it never
  // touches products it didn't create (hardening §5 test-data rule).
  const demoHandles = [...DEMO_PRODUCTS.map((p) => handleize(p.title)), "publish-guard-proof"];
  const existing = await productModuleService.listProducts({ handle: demoHandles });
  if (existing.length > 0) {
    logger.info(`Removing ${existing.length} product(s) from a previous seed:demo run...`);
    await deleteProductsWorkflow(container).run({
      input: { ids: existing.map((p) => p.id) },
    });
  }

  logger.info(`Seeding ${DEMO_PRODUCTS.length} demo products...`);

  for (const spec of DEMO_PRODUCTS) {
    const variants = SIZES.flatMap((size) =>
      spec.colors.map((color) => ({
        title: `${size} / ${color}`,
        sku: `${handleize(spec.title)}-${size}-${handleize(color)}`.toUpperCase(),
        options: { Size: size, Color: color },
        // Medusa v2's price-creation API takes the plain decimal amount
        // (24500 for NGN24,500), NOT a subunit-multiplied integer --
        // confirmed live 2026-07-18 by creating a test product with
        // amount:100 and observing it render as "NGN 100.00" on the real
        // storefront. A prior *100 here (matching Stripe/Paystack's own
        // cents convention, which does NOT apply to Medusa's own price
        // API) silently inflated every seeded price 100x; see
        // paystack/service.ts's toKobo() for the other half of this fix.
        prices: [{ amount: spec.priceNaira, currency_code: "ngn" }],
        manage_inventory: true,
      })),
    );

    const { result } = await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: spec.title,
            handle: handleize(spec.title),
            status: "draft", // publish only after fit data is attached
            options: [
              { title: "Size", values: [...SIZES] },
              { title: "Color", values: [...spec.colors] },
            ],
            variants,
            sales_channels: [{ id: defaultSalesChannel.id }],
          },
        ],
      },
    });

    const product = result[0]!;

    // garment measurements: per size x dimension, graded from the base.
    for (const size of SIZES) {
      for (const dimension of DIMENSIONS) {
        await garmentFitService.setMeasurement({
          productId: product.id,
          size,
          dimension,
          valueCm: BASE_CM[dimension] + SIZE_DELTA[size],
        });
      }
    }

    // product-level fit metadata — required by the publish guard.
    // @ts-expect-error -- real, working generated method; the checked-in
    // .d.ts is stale for this model. See the matching comment in
    // src/api/store/products/[id]/fit/route.ts.
    await garmentFitService.createProductFitMetadata({
      product_id: product.id,
      fit_descriptor: spec.fitDescriptor,
      model_height_cm: spec.modelHeightCm,
      model_size_worn: spec.modelSizeWorn,
    });

    // variant-level MTO flags.
    const mtoSize = spec.mtoSizeIndex >= 0 ? SIZES[spec.mtoSizeIndex]! : null;
    const soldOutSize = spec.soldOutSizeIndex >= 0 ? SIZES[spec.soldOutSizeIndex]! : null;
    if (mtoSize) {
      const mtoVariants = product.variants!.filter((v) => v.title?.startsWith(`${mtoSize} /`));
      for (const v of mtoVariants) {
        // @ts-expect-error -- see createProductFitMetadata comment above.
        await garmentFitService.createVariantFitMetadata({
          variant_id: v.id,
          made_to_order: true,
          lead_time_days: 7,
        });
      }
    }

    // Inventory levels: made-to-order and deliberately-sold-out sizes get
    // 0 on-hand stock (MTO is built on demand, not held — the UI reads
    // made_to_order + lead_time_days for that state, not the stock
    // count); everything else gets a representative in-stock quantity.
    // This is what makes EC2.1/PLP "in-stock sizes on the card" real.
    const { data: variantsWithInventory } = await query.graph({
      entity: "product_variant",
      filters: { id: product.variants!.map((v) => v.id) },
      fields: ["id", "title", "inventory_items.inventory_item_id"],
    });

    const inventoryLevels = variantsWithInventory.flatMap((v) => {
      const isMto = mtoSize !== null && v.title?.startsWith(`${mtoSize} /`);
      const isSoldOut = soldOutSize !== null && v.title?.startsWith(`${soldOutSize} /`);
      const quantity = isMto || isSoldOut ? 0 : 40;
      return (v.inventory_items ?? []).map((ii) => ({
        location_id: stockLocationId,
        inventory_item_id: ii!.inventory_item_id!,
        stocked_quantity: quantity,
      }));
    });
    if (inventoryLevels.length > 0) {
      await createInventoryLevelsWorkflow(container).run({
        input: { inventory_levels: inventoryLevels },
      });
    }

    // Publish via the workflow (not the bare module service): only the
    // workflow emits the product.updated event the publish-guard
    // subscriber listens for. A direct service call would silently skip
    // the guard entirely.
    await updateProductsWorkflow(container).run({
      input: { products: [{ id: product.id, status: "published" }] },
    });

    logger.info(`  seeded + published: ${spec.title}`);
  }

  // --- publish-guard proof: a deliberately incomplete product (checkpoint
  // C3 exit criterion 4 — "publish guard blocks incomplete measurements,
  // test-proven"). Never left in the catalog: created, asserted, deleted.
  logger.info("Proving publish guard rejects incomplete measurements...");
  const { result: guardTestResult } = await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          title: "__publish_guard_proof__",
          handle: "publish-guard-proof",
          status: "draft",
          options: [{ title: "Size", values: [...SIZES] }],
          variants: SIZES.map((size) => ({
            title: size,
            sku: `GUARD-PROOF-${size}`,
            options: { Size: size },
            prices: [{ amount: 1000, currency_code: "ngn" }],
            manage_inventory: false,
          })),
          sales_channels: [{ id: defaultSalesChannel.id }],
        },
      ],
    },
  });
  const guardTestProduct = guardTestResult[0]!;
  // deliberately NOT attaching any measurements or fit metadata.
  await updateProductsWorkflow(container).run({
    input: { products: [{ id: guardTestProduct.id, status: "published" }] },
  });

  // subscribers dispatch off the event bus asynchronously; give it a beat.
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const reverted = await productModuleService.retrieveProduct(guardTestProduct.id);
  await deleteProductsWorkflow(container).run({ input: { ids: [guardTestProduct.id] } });

  if (reverted.status !== "draft") {
    throw new Error(
      `PUBLISH-GUARD-PROOF-FAILED: incomplete product was NOT reverted (status=${reverted.status})`,
    );
  }
  logger.info("PUBLISH-GUARD-PROOF-OK: incomplete product was reverted to draft");

  logger.info("SEED-DEMO-OK");
}
