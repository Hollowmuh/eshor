import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { Modules } from "@medusajs/framework/utils";
import { closePool, ensureOrderState } from "@eshor/kernel";
import {
  createApiKeysWorkflow,
  createOrderWorkflow,
  createRegionsWorkflow,
  createProductsWorkflow,
  createStockLocationsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows";

/**
 * P1.5 order tracking (found untested by the 2026-07-19 proof-of-work
 * audit -- both routes had only ever been curl-verified by hand). Proves
 * the real chain against a real Postgres + real HTTP routes: a real
 * order's tracking token issued by /store/orders/:id/tracking-token
 * resolves through /store/orders/track/:token to the same order's real
 * state + minimal projection (display_id/first_name/city only, per
 * EC4.4 -- confirmed no other shipping_address field leaks), and an
 * unknown token correctly 404s rather than leaking a stack trace or
 * defaulting to some other order.
 */
medusaIntegrationTestRunner({
  // Distinct from delivery-fulfillment.spec.ts's "eshor_test" -- both
  // files' medusaIntegrationTestRunner calls run in separate parallel
  // Jest worker PROCESSES (no --runInBand: found live 2026-07-19 that
  // running 2+ full Medusa app boots serially in ONE process corrupts a
  // static module registry -- "Loaders for module Payment failed:
  // Method Map.prototype.set called on incompatible receiver #<Map>",
  // reproduced even between the two PRE-EXISTING spec files with none of
  // this session's code involved, so parallel workers, not serial, is
  // the correct fix). A shared literal dbName across parallel processes
  // would otherwise race on CREATE DATABASE / migrations against the
  // same Postgres database. @eshor/kernel's getPool() still reads
  // process.env.DATABASE_URL directly (not this dbName) -- fine here,
  // since both this file's own ensureOrderState/getOrderStateByTrackingToken
  // calls AND the route handler under test (same worker process) always
  // resolve to the same DATABASE_URL, so they stay internally consistent
  // regardless of which physical database the Medusa order itself lives in.
  dbName: "eshor_test_tracking",
  testSuite: ({ api, getContainer }) => {
    describe("order tracking: issue token -> resolve token -> minimal projection", () => {
      let publishableKey: string;
      let orderId: string;
      let orderDisplayId: number;

      beforeAll(async () => {
        const container = getContainer();

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

        const { result: regions } = await createRegionsWorkflow(container).run({
          input: {
            regions: [
              { name: "Nigeria Test", currency_code: "ngn", countries: ["ng"], payment_providers: ["pp_system_default"] },
            ],
          },
        });
        const regionId = regions[0]!.id;

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
                    sku: "TRACK-TEST-M",
                    options: { Size: "M" },
                    prices: [{ amount: 24500, currency_code: "ngn" }],
                    manage_inventory: false,
                  },
                ],
                sales_channels: [{ id: salesChannel!.id }],
              },
            ],
          },
        });
        const variantId = products[0]!.variants![0]!.id;

        const { result: apiKeys } = await createApiKeysWorkflow(container).run({
          input: { api_keys: [{ type: "publishable", title: "test", created_by: "test" }] },
        });
        publishableKey = apiKeys[0]!.token;
        await linkSalesChannelsToApiKeyWorkflow(container).run({
          input: { id: apiKeys[0]!.id, add: [salesChannel!.id] },
        });

        // createOrderWorkflow (not a full cart->checkout flow) -- this
        // test's job is proving the tracking routes' own logic, not
        // re-proving checkout, which the fulfillment/guest-checkout
        // drills already cover.
        const { result: order } = await createOrderWorkflow(container).run({
          input: {
            region_id: regionId,
            currency_code: "ngn",
            email: "tracking-test@eshor.dev",
            sales_channel_id: salesChannel!.id,
            status: "pending",
            items: [{ variant_id: variantId, quantity: 1, title: "Test Product M", unit_price: 24500 }],
            shipping_address: {
              first_name: "Tracking",
              last_name: "Tester",
              address_1: "1 Test Street",
              city: "Ikeja",
              province: "Lagos",
              postal_code: "100001",
              country_code: "ng",
              phone: "+2348012345678",
            },
          },
        });
        orderId = order.id;
        orderDisplayId = order.display_id;
      });

      afterAll(async () => {
        await closePool();
      });

      it("GET /store/orders/:id/tracking-token issues a token, idempotently", async () => {
        const headers = { "x-publishable-api-key": publishableKey };

        const first = await api.get(`/store/orders/${orderId}/tracking-token`, { headers });
        expect(typeof first.data.tracking_token).toBe("string");
        expect(first.data.tracking_token.length).toBeGreaterThan(0);

        const second = await api.get(`/store/orders/${orderId}/tracking-token`, { headers });
        expect(second.data.tracking_token).toBe(first.data.tracking_token);
      });

      it("GET /store/orders/track/:token resolves the real order's state + minimal projection only", async () => {
        const headers = { "x-publishable-api-key": publishableKey };

        const { trackingToken } = await ensureOrderState(orderId);

        const res = await api.get(`/store/orders/track/${trackingToken}`, { headers });
        expect(res.status).toBe(200);
        expect(res.data).toEqual({
          state: "pending_payment",
          display_id: orderDisplayId,
          first_name: "Tracking",
          city: "Ikeja",
        });
        // EC4.4: no phone, no address_1, no last_name -- must never leak.
        expect(res.data.phone).toBeUndefined();
        expect(res.data.address_1).toBeUndefined();
        expect(res.data.last_name).toBeUndefined();
      });

      it("GET /store/orders/track/:token 404s for an unknown token instead of leaking a default order", async () => {
        const headers = { "x-publishable-api-key": publishableKey };

        await expect(
          api.get("/store/orders/track/0000000000000000000000000000000f", { headers }),
        ).rejects.toMatchObject({ response: { status: 404 } });
      });
    });
  },
});
