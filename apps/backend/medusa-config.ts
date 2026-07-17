import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

const modules: NonNullable<Parameters<typeof defineConfig>[0]>['modules'] = [
  {
    resolve: './src/modules/garment-fit',
  },
  {
    resolve: './src/modules/delivery-zones',
  },
]

// P1.3: conditional registration -- no PAYSTACK_SECRET_KEY exists in this
// environment yet (D1, external dependency: Abdul is getting test-mode
// keys). Registering unconditionally would crash the entire server on
// boot (the provider's validateOptions throws on a missing key), taking
// the catalog/delivery-zones/storefront down with it for no reason.
// Activates automatically the moment the env var is set -- no code
// change needed.
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
