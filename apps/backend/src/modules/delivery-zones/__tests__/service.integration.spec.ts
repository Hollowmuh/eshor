import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { DELIVERY_ZONES_MODULE, DEFAULT_ZONE_STATE } from "../../delivery-zones";
import type DeliveryZonesModuleService from "../service";

medusaIntegrationTestRunner({
  testSuite: ({ getContainer }) => {
    describe("DeliveryZonesModuleService.quoteFor 3-tier fallback", () => {
      let service: DeliveryZonesModuleService;

      beforeAll(async () => {
        service = getContainer().resolve(DELIVERY_ZONES_MODULE);
        await service.createDeliveryZones([
          { state: "Lagos", area: "Ikeja", fee_kobo: 100000, eta_min_days: 1, eta_max_days: 1, courier: "kwik" },
          { state: "Lagos", area: null, fee_kobo: 150000, eta_min_days: 1, eta_max_days: 2, courier: "kwik" },
          { state: DEFAULT_ZONE_STATE, area: null, fee_kobo: 300000, eta_min_days: 3, eta_max_days: 5, courier: "gig" },
        ]);
      });

      it("tier 1: returns the exact state+area match when one exists", async () => {
        const quote = await service.quoteFor({ state: "Lagos", area: "Ikeja" });
        expect(quote?.feeKobo).toBe(100000);
      });

      it("tier 2: falls back to the state default when no area match exists", async () => {
        const quote = await service.quoteFor({ state: "Lagos", area: "Somewhere Else" });
        expect(quote?.feeKobo).toBe(150000);
      });

      it("tier 2: falls back to the state default when no area is given at all", async () => {
        const quote = await service.quoteFor({ state: "Lagos" });
        expect(quote?.feeKobo).toBe(150000);
      });

      it("tier 3: falls back to the wildcard for an unconfigured state", async () => {
        const quote = await service.quoteFor({ state: "Kano" });
        expect(quote?.feeKobo).toBe(300000);
      });

      it("returns null when even the wildcard is missing", async () => {
        const zones = await service.listDeliveryZones({ state: DEFAULT_ZONE_STATE });
        await service.deleteDeliveryZones(zones.map((z) => z.id));

        const quote = await service.quoteFor({ state: "Kano" });
        expect(quote).toBeNull();
      });
    });
  },
});
