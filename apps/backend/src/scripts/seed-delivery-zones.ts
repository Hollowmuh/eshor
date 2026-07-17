/**
 * P1.2: seeds the flat-rate delivery menu from the ops playbook
 * (operations_playbook_design_0109.md S1.2). Idempotent: clears and
 * reseeds every time, since this is small reference data ops will edit
 * via the admin, not accumulate duplicates of.
 *
 * Run: npx medusa exec ./src/scripts/seed-delivery-zones.ts
 */
import type { ExecArgs } from "@medusajs/framework/types";
import { DELIVERY_ZONES_MODULE, DEFAULT_ZONE_STATE } from "../modules/delivery-zones";
import type DeliveryZonesModuleService from "../modules/delivery-zones/service";

const ZONES = [
  { state: "Lagos", area: null, fee_kobo: 150000, eta_min_days: 1, eta_max_days: 2, courier: "kwik" as const },
  { state: "Abuja", area: null, fee_kobo: 250000, eta_min_days: 2, eta_max_days: 3, courier: "gig" as const },
  { state: "Rivers", area: null, fee_kobo: 250000, eta_min_days: 2, eta_max_days: 3, courier: "gig" as const },
  { state: "Oyo", area: null, fee_kobo: 250000, eta_min_days: 2, eta_max_days: 3, courier: "gig" as const },
  // ops playbook's "other states" tier -- catches every state not
  // listed above (quoteFor's third fallback).
  { state: DEFAULT_ZONE_STATE, area: null, fee_kobo: 300000, eta_min_days: 3, eta_max_days: 5, courier: "gig" as const },
];

export default async function seedDeliveryZones({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve("logger");
  const deliveryZonesService: DeliveryZonesModuleService = container.resolve(
    DELIVERY_ZONES_MODULE,
  );

  const existing = await deliveryZonesService.listDeliveryZones({});
  if (existing.length > 0) {
    await deliveryZonesService.deleteDeliveryZones(existing.map((z) => z.id));
  }

  await deliveryZonesService.createDeliveryZones(ZONES);
  logger.info(`Seeded ${ZONES.length} delivery zones (incl. the "${DEFAULT_ZONE_STATE}" wildcard tier).`);
  logger.info("SEED-DELIVERY-ZONES-OK");
}
