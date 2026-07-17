import { model } from "@medusajs/framework/utils";

/**
 * Per-size garment measurements (Layer 3 §4 / feature spec E1 AC2, R1).
 * Versioned per EC1.1: editing measurements after orders exist must not
 * silently rewrite history, so rows are immutable once created — a new
 * version row is inserted and `is_current` flips instead of an UPDATE.
 */
const GarmentMeasurement = model.define("garment_measurement", {
  id: model.id().primaryKey(),
  product_id: model.text(), // Medusa product id (linked, not FK — G-M2)
  size: model.text(), // e.g. "S", "M", "L", "XL"
  dimension: model.text(), // e.g. "bust", "waist", "hip", "length", "inseam"
  value_cm: model.number(),
  version: model.number().default(1),
  is_current: model.boolean().default(true),
});

export default GarmentMeasurement;
