import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

// NonNullable<Parameters<typeof defineConfig>[0]>['modules'] resolves to
// an object-keyed Record type in this Medusa version's own typings, but
// the array form below is what Medusa's runtime module loader actually
// accepts (confirmed live all session -- every module/provider here
// registers and works correctly). Typed explicitly rather than trusting
// that inferred type, which was blocking `medusa build` on a type-only
// mismatch with no real bug behind it.
type ModuleEntry = { resolve: string; id?: string; options?: Record<string, unknown> }
const modules: ModuleEntry[] = [
  {
    resolve: './src/modules/garment-fit',
  },
  {
    resolve: './src/modules/delivery-zones',
  },
  {
    // P1.4: turns delivery-zones' rates into a real, calculated shipping
    // option price so the cart's shipping_total (and Paystack's charge
    // amount, which is sourced from it) actually includes delivery --
    // no external keys needed, so this registers unconditionally like
    // delivery-zones itself.
    resolve: '@medusajs/medusa/fulfillment',
    options: {
      providers: [
        {
          resolve: './src/modules/delivery-zones-fulfillment',
          id: 'delivery-zones',
        },
      ],
    },
  },
]

// P1.3: conditional registration -- real PAYSTACK_SECRET_KEY is now set
// (D1/D3, both done -- see docs/2026-07-17/p1_money_path_0947.md).
// Registering unconditionally would still crash the entire server on
// boot in any environment where the key isn't set (the provider's
// validateOptions throws on a missing key), taking the
// catalog/delivery-zones/storefront down with it for no reason, so this
// stays conditional rather than becoming a hard dependency.
if (process.env.PAYSTACK_SECRET_KEY) {
  modules.push({
    resolve: '@medusajs/medusa/payment',
    options: {
      providers: [
        {
          resolve: './src/modules/paystack',
          id: 'paystack',
          options: {
            secretKey: process.env.PAYSTACK_SECRET_KEY,
          },
        },
        {
          // Distinct resolve path + a genuine subclass with its own
          // static `identifier` (src/modules/paystack-transfer/index.ts)
          // -- confirmed live 2026-07-18 that BOTH are required: same
          // class registered twice (even under a distinct resolve path
          // and config `id`) silently produces no usable provider,
          // because Medusa's actual provider_id is
          // pp_{module-id}_{class.identifier}, and it's the class's own
          // `identifier` that was colliding. Real id ends up
          // pp_paystack-transfer_paystack-transfer (not the shorter
          // pp_paystack-transfer_paystack one might expect).
          resolve: './src/modules/paystack-transfer',
          id: 'paystack-transfer',
          options: {
            secretKey: process.env.PAYSTACK_SECRET_KEY,
            channel: 'bank_transfer',
          },
        },
      ],
    },
  })
}

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
    }
  },
  modules,
})
