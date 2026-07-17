/**
 * P1.3 cleanup: revert the Nigeria region to system-default-only until
 * real PAYSTACK_SECRET_KEY exists permanently in the environment.
 * Without it, medusa-config.ts's conditional registration means the
 * paystack provider module won't load on a normal boot -- leaving the
 * region pointed at "pp_paystack_paystack" with no module loaded to
 * serve it would be a dangling reference. Re-run link-paystack-to-region.ts
 * once real keys are in .env for good.
 */
import type { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows";

export default async function unlinkPaystackFromRegion({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve("logger");
  const regionModuleService = container.resolve(Modules.REGION);

  const [region] = await regionModuleService.listRegions({ name: "Nigeria" });
  if (!region) throw new Error("Nigeria region not found");

  await updateRegionsWorkflow(container).run({
    input: {
      selector: { id: region.id },
      update: { payment_providers: ["pp_system_default"] },
    },
  });

  logger.info(`Reverted region ${region.id} to pp_system_default only.`);
}
