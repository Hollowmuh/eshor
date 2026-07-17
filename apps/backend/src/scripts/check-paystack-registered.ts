/** P1.3 structural check: is the paystack provider actually registered in the payment module? */
import type { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

export default async function checkPaystackRegistered({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve("logger");
  const paymentModuleService = container.resolve(Modules.PAYMENT);
  const providers = await paymentModuleService.listPaymentProviders({});
  logger.info(`Registered payment providers: ${JSON.stringify(providers.map((p: { id: string }) => p.id))}`);
}
