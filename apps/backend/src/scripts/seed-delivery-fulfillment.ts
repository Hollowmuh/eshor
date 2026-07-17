/**
 * P1.4: turns delivery-zones' rates into a real Medusa fulfillment path
 * so a cart's shipping_total (and therefore Paystack's charge amount)
 * actually includes delivery. Two things were genuinely missing before
 * this script, discovered live while wiring checkout up, not assumed:
 *
 * 1. No fulfillment_set/service_zone/shipping_option existed for Nigeria
 *    at all (only the starter's demo "European Warehouse delivery" set).
 * 2. Checked directly: none of eshor's 12 real live products have a
 *    shipping_profile linked. The only product_shipping_profile rows in
 *    the DB point at the starter's 4 demo products (Medusa T-Shirt/
 *    Sweatshirt/Sweatpants/Shorts), which were already soft-deleted in
 *    P0's Lighthouse-budget cleanup -- the product-shipping-profile link
 *    rows just weren't cascade-cleaned when those products were removed
 *    (expected: Medusa v2 module links aren't FK-cascaded). Without a
 *    shipping profile, a product can't resolve any shipping option at
 *    checkout, regardless of which fulfillment provider is used.
 *
 * Idempotent: safe to rerun (clears and recreates the Nigeria
 * fulfillment_set the same way seed-delivery-zones.ts treats its own
 * rows as small, ops-owned reference data).
 *
 * Run: npx medusa exec ./src/scripts/seed-delivery-fulfillment.ts
 */
import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  createServiceZonesWorkflow,
  createShippingOptionsWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows";

const FULFILLMENT_SET_NAME = "Nigeria delivery";
const SERVICE_ZONE_NAME = "Nigeria";
const SHIPPING_OPTION_NAME = "Standard delivery";

export default async function seedDeliveryFulfillment({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve("logger");
  const fulfillmentService = container.resolve(Modules.FULFILLMENT);
  const productService = container.resolve(Modules.PRODUCT);
  const stockLocationService = container.resolve(Modules.STOCK_LOCATION);
  const remoteLink = container.resolve(ContainerRegistrationKeys.LINK);
  const stockLocations = await stockLocationService.listStockLocations({});

  // 1. Fulfillment set + service zone (idempotent: delete and recreate,
  // same reasoning as seed-delivery-zones.ts -- this is small,
  // rarely-changing reference data, not something to accumulate
  // duplicates of across reruns).
  //
  // Found live, the hard way: deleteFulfillmentSets does NOT clean up
  // the location_fulfillment_set link rows pointing at it (same "module
  // links aren't cascade-cleaned" gap as the orphaned
  // product_shipping_profile rows in this file's header comment) --
  // rerunning this script left an orphaned link row, which crashed
  // Medusa's own listShippingOptionsForCartWorkflow with a raw
  // "Cannot read properties of undefined (reading 'id')" the next time
  // any cart tried to list shipping options, since it iterates
  // stock_location.fulfillment_sets assuming every linked id still
  // resolves to a real row. Dismissing the link explicitly here closes
  // that gap for every future rerun, not just this one.
  const existingSets = await fulfillmentService.listFulfillmentSets({
    name: FULFILLMENT_SET_NAME,
  });
  if (existingSets.length > 0) {
    await remoteLink.dismiss(
      existingSets.flatMap((set) =>
        stockLocations.map((location) => ({
          [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
          [Modules.FULFILLMENT]: { fulfillment_set_id: set.id },
        })),
      ),
    );
    await fulfillmentService.deleteFulfillmentSets(existingSets.map((s) => s.id));
    logger.info(`Removed existing "${FULFILLMENT_SET_NAME}" fulfillment set (and its location links) before reseeding.`);
  }

  const fulfillmentSet = await fulfillmentService.createFulfillmentSets({
    name: FULFILLMENT_SET_NAME,
    type: "shipping",
  });

  const { result: serviceZones } = await createServiceZonesWorkflow(container).run({
    input: {
      data: [
        {
          name: SERVICE_ZONE_NAME,
          fulfillment_set_id: fulfillmentSet.id,
          geo_zones: [{ type: "country", country_code: "ng" }],
        },
      ],
    },
  });
  const serviceZone = serviceZones[0];
  logger.info(`Created service zone ${serviceZone.id} for Nigeria.`);

  // 2. The real provider id, read from what actually registered on boot
  // (medusa-config.ts's `id: 'delivery-zones'` + the service's
  // `static identifier = "delivery-zones"`) -- confirmed live via
  // `select id from fulfillment_provider`, not assumed from the
  // `fp_{identifier}_{id}` convention documented for payment providers,
  // which turned out not to apply here the same way.
  const providers = await fulfillmentService.listFulfillmentProviders({
    id: ["delivery-zones_delivery-zones"],
  });
  if (providers.length === 0) {
    throw new Error(
      "delivery-zones_delivery-zones fulfillment provider isn't registered -- check medusa-config.ts and that the server has rebooted since it was added.",
    );
  }

  // Registering a provider globally isn't enough. The validate-fulfillment-
  // providers step (read directly from its installed source) checks
  // service_zone.fulfillment_set.locations.fulfillment_providers -- so a
  // stock location needs BOTH: linked to this fulfillment_set, AND that
  // provider enabled on it. Neither existed for this new "Nigeria
  // delivery" set (found live via two successive failed runs of this
  // script, each surfacing one missing link at a time). Both links use
  // the same remote-link mechanism the admin API routes for this use
  // directly (POST /admin/stock-locations/:id/fulfillment-sets and
  // .../fulfillment-providers), read from their route sources rather
  // than assumed.
  for (const location of stockLocations) {
    await remoteLink.create([
      {
        [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
        [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
      },
      {
        [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
        [Modules.FULFILLMENT]: { fulfillment_provider_id: "delivery-zones_delivery-zones" },
      },
    ]);
  }
  logger.info(
    `Linked ${stockLocations.length} stock location(s) to the Nigeria fulfillment set and enabled the delivery-zones provider on them.`,
  );

  const shippingProfiles = await fulfillmentService.listShippingProfiles({
    type: "default",
  });
  const shippingProfile = shippingProfiles[0];
  if (!shippingProfile) {
    throw new Error("No default shipping profile found.");
  }

  await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: SHIPPING_OPTION_NAME,
        service_zone_id: serviceZone.id,
        shipping_profile_id: shippingProfile.id,
        provider_id: "delivery-zones_delivery-zones",
        price_type: "calculated",
        type: {
          label: "Standard",
          description: "Flat-rate delivery, fee and ETA depend on your state.",
          code: "standard",
        },
      },
    ],
  });
  logger.info(`Created calculated-price shipping option "${SHIPPING_OPTION_NAME}".`);

  // 3. Link every live product to the default shipping profile -- the
  // real gap found live: none were linked (see file header).
  const [products, productCount] = await productService.listAndCountProducts({});
  if (productCount > 0) {
    await updateProductsWorkflow(container).run({
      input: {
        selector: { id: products.map((p) => p.id) },
        update: { shipping_profile_id: shippingProfile.id },
      },
    });
    logger.info(`Linked ${productCount} live products to shipping profile ${shippingProfile.id}.`);
  }

  logger.info("SEED-DELIVERY-FULFILLMENT-OK");
}
