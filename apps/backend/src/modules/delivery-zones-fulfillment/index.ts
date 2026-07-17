import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import DeliveryZonesFulfillmentProviderService from "./service";

export default ModuleProvider(Modules.FULFILLMENT, {
  services: [DeliveryZonesFulfillmentProviderService],
});
