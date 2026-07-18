/** P1.3/P1.4: link both paystack providers (card + transfer) to the Nigeria region (idempotent). */
import type { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows";

export default async function linkPaystackToRegion({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve("logger");
  const regionModuleService = container.resolve(Modules.REGION);

  const [region] = await regionModuleService.listRegions({ name: "Nigeria" });
  if (!region) throw new Error("Nigeria region not found -- run seed-demo.ts first");

  // pp_paystack-transfer_paystack-transfer, not pp_paystack-transfer_paystack
  // -- Medusa's provider_id is pp_{module-id}_{class.static.identifier},
  // and the transfer variant needed its OWN class with its own
  // `identifier` override (see paystack-transfer/index.ts's own
  // comment) to avoid silently colliding with the card provider.
  const providers = [
    "pp_system_default",
    "pp_paystack_paystack",
    "pp_paystack-transfer_paystack-transfer",
  ];

  await updateRegionsWorkflow(container).run({
    input: {
      selector: { id: region.id },
      update: { payment_providers: providers },
    },
  });

  logger.info(`Linked ${providers.join(", ")} to region ${region.id}`);
}
