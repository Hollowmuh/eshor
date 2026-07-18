import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { Modules } from "@medusajs/framework/utils";
import { closePool } from "@eshor/kernel";
import {
  createApiKeysWorkflow,
  createRegionsWorkflow,
  createProductsWorkflow,
  createStockLocationsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows";
import { DELIVERY_ZONES_MODULE } from "../../src/modules/delivery-zones";
import type DeliveryZonesModuleService from "../../src/modules/delivery-zones/service";
import { seedDeliveryFulfillmentCore } from "../../src/scripts/seed-delivery-fulfillment";

/**
 * The real gap-closer this test exists for (found live 2026-07-17,
 * proved once by hand with p1-4-fulfillment-drill.ts, now permanent):
 * without the delivery-zones-fulfillment provider, a cart's
 * shipping_total never included the delivery fee at all, so Paystack
 * (whose charge amount is sourced straight from the cart/order total)
 * would have silently undercharged every real order. This test proves
 * that chain end to end against a real Postgres + real HTTP routes, not
 * a mock, and fails loudly the moment it regresses.
 */
medusaIntegrationTestRunner({
  // Pinned to match .env.test's literal DATABASE_URL. Necessary because
  // the delivery-zones-fulfillment provider's calculatePrice() reads
  // process.env.DATABASE_URL directly via @eshor/kernel's getPool()
  // (required workaround for a real cross-module DI limitation in
  // Medusa's provider-loader cradle, see service.ts's own comment) --
  // that bypasses medusaIntegrationTestRunner's usual mechanism for
  // pointing a test run at its dynamically-named database, which only
  // overrides Medusa's own config-level databaseUrl, not the raw env
  // var. Found live: without this, calculatePrice threw
  // 'database "eshor_test" does not exist' because the runner had
  // created a different, auto-named database while my provider's pool
  // still pointed at the literal .env.test name.
  dbName: "eshor_test",
  testSuite: ({ api, getContainer }) => {
    describe("delivery-zones-fulfillment: cart total includes the real delivery fee", () => {
      let publishableKey: string;
      let regionId: string;
      let variantId: string;

      beforeAll(async () => {
        const container = getContainer();
        const logger = container.resolve<any>("logger");

        // A fresh test DB only has what `medusa db:migrate` creates --
        // no default stock location or shipping profile (found live:
        // seedDeliveryFulfillmentCore failed with "No default shipping
        // profile found" the first time this test ran, because those
        // only exist in the real dev DB from a one-time seed step this
        // fresh environment never ran). Create them here so this test
        // fixture is self-contained.
        const salesChannelService = container.resolve(Modules.SALES_CHANNEL);
        let [salesChannel] = await salesChannelService.listSalesChannels({});
        if (!salesChannel) {
          salesChannel = await salesChannelService.createSalesChannels({ name: "Default Sales Channel" });
        }

        const fulfillmentService = container.resolve(Modules.FULFILLMENT);
        await fulfillmentService.createShippingProfiles({ name: "Default Shipping Profile", type: "default" });

        const { result: stockLocations } = await createStockLocationsWorkflow(container).run({
          input: { locations: [{ name: "Test Warehouse" }] },
        });
        await linkSalesChannelsToStockLocationWorkflow(container).run({
          input: { id: stockLocations[0]!.id, add: [salesChannel.id] },
        });

        const deliveryZones = container.resolve<DeliveryZonesModuleService>(DELIVERY_ZONES_MODULE);
        await deliveryZones.createDeliveryZones([
          { state: "Lagos", area: null, fee_kobo: 150000, eta_min_days: 1, eta_max_days: 2, courier: "kwik" },
        ]);

        await seedDeliveryFulfillmentCore(container, logger);

        const { result: regions } = await createRegionsWorkflow(container).run({
          input: {
            regions: [
              { name: "Nigeria Test", currency_code: "ngn", countries: ["ng"], payment_providers: ["pp_system_default"] },
            ],
          },
        });
        regionId = regions[0]!.id;

        const { result: products } = await createProductsWorkflow(container).run({
          input: {
            products: [
              {
                title: "Test Product",
                status: "published",
                options: [{ title: "Size", values: ["M"] }],
                variants: [
                  {
                    title: "M",
                    sku: "TEST-M",
                    options: { Size: "M" },
                    // Plain decimal Naira (24500 = NGN24,500), matching
                    // Medusa's real price-creation convention -- see
                    // seed-demo.ts's fix comment for the full story.
                    prices: [{ amount: 24500, currency_code: "ngn" }],
                    manage_inventory: false,
                  },
                ],
                sales_channels: [{ id: salesChannel!.id }],
              },
            ],
          },
        });
        variantId = products[0]!.variants![0]!.id;

        const { result: apiKeys } = await createApiKeysWorkflow(container).run({
          input: { api_keys: [{ type: "publishable", title: "test", created_by: "test" }] },
        });
        publishableKey = apiKeys[0]!.token;

        await linkSalesChannelsToApiKeyWorkflow(container).run({
          input: { id: apiKeys[0]!.id, add: [salesChannel!.id] },
        });
      });

      it("cart.shipping_total exactly matches the delivery-zones fee after setting a Lagos shipping method", async () => {
        const headers = { "x-publishable-api-key": publishableKey };

        const zonesQuote = await api.get("/store/delivery-zones?state=Lagos", { headers });
        expect(zonesQuote.data.fee_kobo).toBe(150000);

        const cartRes = await api.post(
          "/store/carts",
          { region_id: regionId, email: "test@eshor.dev" },
          { headers },
        );
        const cartId = cartRes.data.cart.id;

        await api.post(
          `/store/carts/${cartId}/line-items`,
          { variant_id: variantId, quantity: 1 },
          { headers },
        );

        await api.post(
          `/store/carts/${cartId}`,
          {
            shipping_address: {
              first_name: "Test",
              last_name: "Shopper",
              address_1: "1 Test Street",
              city: "Ikeja",
              province: "Lagos",
              postal_code: "100001",
              country_code: "ng",
              phone: "+2348012345678",
            },
          },
          { headers },
        );

        const optionsRes = await api.get(`/store/shipping-options?cart_id=${cartId}`, { headers });
        expect(optionsRes.data.shipping_options.length).toBeGreaterThan(0);
        const option = optionsRes.data.shipping_options[0];

        const setShippingRes = await api.post(
          `/store/carts/${cartId}/shipping-methods`,
          { option_id: option.id },
          { headers },
        );

        const finalCart = setShippingRes.data.cart;
        // delivery_zone.fee_kobo (150000) is genuinely kobo; cart.shipping_total
        // is Medusa's plain-decimal Naira, divided by the fulfillment
        // provider at the calculatePrice() boundary -- see that
        // service's own comment.
        expect(finalCart.shipping_total).toBe(1500);
        expect(finalCart.total).toBe(finalCart.item_total + finalCart.shipping_total);
      });

      // Must close before the runner's own afterAll tries to drop the
      // test database -- found live: without this, the assertion above
      // passed but the suite still failed because Postgres refused to
      // drop a database with an open connection from this pool.
      afterAll(async () => {
        await closePool();
      });
    });
  },
});
