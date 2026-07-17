import { model } from "@medusajs/framework/utils";

/**
 * P1.2: state -> area -> (fee, ETA, courier) mapping (ops playbook flat-
 * rate menu: Lagos NGN1,500/24-48h, major cities NGN2,500/2-3d, other
 * states NGN3,000/3-5d, free >=NGN60,000 basket -- the free-shipping
 * threshold itself lives in checkout/cart logic, not per-zone).
 *
 * Ops-editable data, not code -- matches the garment-fit module's own
 * "never hardcode what changes without a deploy" principle.
 */
const DeliveryZone = model.define("delivery_zone", {
  id: model.id().primaryKey(),
  state: model.text(), // Nigerian state name, e.g. "Lagos"
  area: model.text().nullable(), // optional finer-grained area within the state
  fee_kobo: model.number(),
  eta_min_days: model.number(),
  eta_max_days: model.number(),
  courier: model.enum(["gig", "kwik", "sendbox", "manual"]),
  active: model.boolean().default(true),
});

export default DeliveryZone;
