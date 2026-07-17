import { Module } from "@medusajs/framework/utils";
import GarmentFitModuleService from "./service";

export const GARMENT_FIT_MODULE = "garmentFit";

export default Module(GARMENT_FIT_MODULE, {
  service: GarmentFitModuleService,
});
