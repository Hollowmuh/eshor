import ProductModule from "@medusajs/medusa/product";
import { defineLink } from "@medusajs/framework/utils";
import GarmentFitModule from "../modules/garment-fit";

/**
 * Module link (G-M2: no cross-module FKs). One-to-one: a Medusa product
 * carries at most one ProductFitMetadata row.
 */
export default defineLink(ProductModule.linkable.product, GarmentFitModule.linkable.productFitMetadata);
