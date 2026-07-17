/**
 * P0 day 10: the starter's own db:migrate seed (initial-data-seed.ts)
 * creates 4 sample products (t-shirt, sweatshirt, sweatpants, shorts)
 * with large unoptimized demo images from a Medusa-hosted S3 bucket.
 * They aren't eshor's catalog and were the real root cause of the
 * Lighthouse total-byte-weight failure on the PDP (2.7MB of 2.99MB) --
 * RelatedProducts was pulling them in as filler. Idempotent: safe to
 * rerun, only ever touches these four known handles.
 *
 * Run: npx medusa exec ./src/scripts/remove-starter-samples.ts
 */
import type { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { deleteProductsWorkflow } from "@medusajs/medusa/core-flows";

const STARTER_SAMPLE_HANDLES = ["t-shirt", "sweatshirt", "sweatpants", "shorts"];

export default async function removeStarterSamples({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve("logger");
  const productModuleService = container.resolve(Modules.PRODUCT);

  const existing = await productModuleService.listProducts({ handle: STARTER_SAMPLE_HANDLES });
  if (existing.length === 0) {
    logger.info("No starter sample products found — already clean.");
    return;
  }

  await deleteProductsWorkflow(container).run({
    input: { ids: existing.map((p) => p.id) },
  });

  logger.info(`Removed ${existing.length} starter sample product(s): ${existing.map((p) => p.handle).join(", ")}`);
  logger.info("REMOVE-STARTER-SAMPLES-OK");
}
