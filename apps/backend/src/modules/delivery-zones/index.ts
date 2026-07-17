import { Module } from "@medusajs/framework/utils";
import DeliveryZonesModuleService from "./service";

export const DELIVERY_ZONES_MODULE = "deliveryZones";
export { DEFAULT_ZONE_STATE } from "./service";

export default Module(DELIVERY_ZONES_MODULE, {
  service: DeliveryZonesModuleService,
});
