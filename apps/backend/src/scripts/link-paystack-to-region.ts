/** P1.3: link the paystack provider to the Nigeria region (idempotent). */
import type { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows";

export default async function linkPaystackToRegion({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve("logger");
  const regionModuleService = container.resolve(Modules.REGION);

  const [region] = await regionModuleService.listRegions({ name: "Nigeria" });
  if (!region) throw new Error("Nigeria region not found -- run seed-demo.ts first");

  await updateRegionsWorkflow(container).run({
    input: {
      selector: { id: region.id },
      update: { payment_providers: ["pp_system_default", "pp_paystack_paystack"] },
    },
  });

  logger.info(`Linked pp_paystack_paystack to region ${region.id}`);
}
