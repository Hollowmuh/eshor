import ProductModule from "@medusajs/medusa/product";
import { defineLink } from "@medusajs/framework/utils";
import GarmentFitModule from "../modules/garment-fit";

/** One product has many measurement rows (one per size×dimension×version). */
export default defineLink(
  ProductModule.linkable.product,
  { linkable: GarmentFitModule.linkable.garmentMeasurement, isList: true },
);
