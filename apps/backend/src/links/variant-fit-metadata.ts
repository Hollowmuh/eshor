import ProductModule from "@medusajs/medusa/product";
import { defineLink } from "@medusajs/framework/utils";
import GarmentFitModule from "../modules/garment-fit";

/** One-to-one: a Medusa product variant carries at most one MTO/lead-time row. */
export default defineLink(
  ProductModule.linkable.productVariant,
  GarmentFitModule.linkable.variantFitMetadata,
);
