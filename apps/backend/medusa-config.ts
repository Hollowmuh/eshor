import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

const modules: NonNullable<Parameters<typeof defineConfig>[0]>['modules'] = [
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
