import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import PaystackProviderService from "../paystack/service";

/**
 * Registering the exact same PaystackProviderService class a second time
 * (even under a distinct module resolve path and config `id`) silently
 * failed -- confirmed live 2026-07-18: no error at boot, but the
 * resulting provider was never recognized by GET /store/payment-providers
 * or the region-linking workflow. Root cause: the class's own static
 * `identifier = "paystack"` is the real dedupe key Medusa uses
 * internally, not the outer module/`id` wrapper. A genuine subclass with
 * its own `identifier` (below) is what actually produces a second,
 * distinct provider.
 */
class PaystackTransferProviderService extends PaystackProviderService {
  static identifier = "paystack-transfer";
}

export default ModuleProvider(Modules.PAYMENT, {
  services: [PaystackTransferProviderService],
});
