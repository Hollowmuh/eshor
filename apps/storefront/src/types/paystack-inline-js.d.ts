/**
 * @paystack/inline-js@2.23.1 ships no TypeScript types (confirmed by
 * inspecting the installed package -- only lib/dist/es JS bundles + a
 * README). Declared here against that README's documented API for
 * resumeTransaction, the only method this app uses.
 */
declare module "@paystack/inline-js" {
  export interface PaystackTransactionResponse {
    id: number
    reference: string
    message: string
  }

  export interface PaystackLoadResponse {
    id: number
    customer: Record<string, unknown>
    accessCode: string
  }

  export interface PaystackErrorResponse {
    message: string
  }

  export interface PaystackTransactionCallbacks {
    onSuccess?: (response: PaystackTransactionResponse) => void
    onCancel?: () => void
    onLoad?: (response: PaystackLoadResponse) => void
    onError?: (error: PaystackErrorResponse) => void
  }

  export default class PaystackPop {
    resumeTransaction(
      accessCode: string,
      callbacks?: PaystackTransactionCallbacks
    ): unknown
  }
}
