"use client"

import { isManual, isPaystack, isPaystackTransfer, isStripeLike } from "@lib/constants"
import { placeOrder } from "@lib/data/cart"
import { HttpTypes } from "@medusajs/types"
import { Button, Text } from "@modules/common/components/ui"
import { useElements, useStripe } from "@stripe/react-stripe-js"
import PaystackPop from "@paystack/inline-js"
import React, { useEffect, useState } from "react"
import ErrorMessage from "../error-message"

type PaymentButtonProps = {
  cart: HttpTypes.StoreCart
  "data-testid": string
}

const PaymentButton: React.FC<PaymentButtonProps> = ({
  cart,
  "data-testid": dataTestId,
}) => {
  const notReady =
    !cart ||
    !cart.shipping_address ||
    !cart.billing_address ||
    !cart.email ||
    (cart.shipping_methods?.length ?? 0) < 1

  const paymentSession = cart.payment_collection?.payment_sessions?.[0]

  switch (true) {
    case isStripeLike(paymentSession?.provider_id):
      return (
        <StripePaymentButton
          notReady={notReady}
          cart={cart}
          data-testid={dataTestId}
        />
      )
    case isManual(paymentSession?.provider_id):
      return (
        <ManualTestPaymentButton notReady={notReady} data-testid={dataTestId} />
      )
    case isPaystack(paymentSession?.provider_id):
      return (
        <PaystackPaymentButton
          notReady={notReady}
          cart={cart}
          data-testid={dataTestId}
        />
      )
    case isPaystackTransfer(paymentSession?.provider_id):
      return (
        <PaystackTransferPanel
          notReady={notReady}
          cart={cart}
          data-testid={dataTestId}
        />
      )
    default:
      return <Button disabled>Select a payment method</Button>
  }
}

const StripePaymentButton = ({
  cart,
  notReady,
  "data-testid": dataTestId,
}: {
  cart: HttpTypes.StoreCart
  notReady: boolean
  "data-testid"?: string
}) => {
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const onPaymentCompleted = async () => {
    await placeOrder()
      .catch((err) => {
        setErrorMessage(err.message)
      })
      .finally(() => {
        setSubmitting(false)
      })
  }

  const stripe = useStripe()
  const elements = useElements()
  const card = elements?.getElement("card")

  const session = cart.payment_collection?.payment_sessions?.find(
    (s) => s.status === "pending"
  )

  const disabled = !stripe || !elements ? true : false

  const handlePayment = async () => {
    setSubmitting(true)

    if (!stripe || !elements || !card || !cart) {
      setSubmitting(false)
      return
    }

    await stripe
      .confirmCardPayment(session?.data.client_secret as string, {
        payment_method: {
          card: card,
          billing_details: {
            name:
              cart.billing_address?.first_name +
              " " +
              cart.billing_address?.last_name,
            address: {
              city: cart.billing_address?.city ?? undefined,
              country: cart.billing_address?.country_code ?? undefined,
              line1: cart.billing_address?.address_1 ?? undefined,
              line2: cart.billing_address?.address_2 ?? undefined,
              postal_code: cart.billing_address?.postal_code ?? undefined,
              state: cart.billing_address?.province ?? undefined,
            },
            email: cart.email,
            phone: cart.billing_address?.phone ?? undefined,
          },
        },
      })
      .then(({ error, paymentIntent }) => {
        if (error) {
          const pi = error.payment_intent

          if (
            (pi && pi.status === "requires_capture") ||
            (pi && pi.status === "succeeded")
          ) {
            onPaymentCompleted()
          }

          setErrorMessage(error.message || null)
          return
        }

        if (
          (paymentIntent && paymentIntent.status === "requires_capture") ||
          paymentIntent.status === "succeeded"
        ) {
          return onPaymentCompleted()
        }

        return
      })
  }

  return (
    <>
      <Button
        disabled={disabled || notReady}
        onClick={handlePayment}
        size="large"
        isLoading={submitting}
        data-testid={dataTestId}
      >
        Place order
      </Button>
      <ErrorMessage
        error={errorMessage}
        data-testid="stripe-payment-error-message"
      />
    </>
  )
}

const ManualTestPaymentButton = ({ notReady }: { notReady: boolean }) => {
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const onPaymentCompleted = async () => {
    await placeOrder()
      .catch((err) => {
        setErrorMessage(err.message)
      })
      .finally(() => {
        setSubmitting(false)
      })
  }

  const handlePayment = () => {
    setSubmitting(true)

    onPaymentCompleted()
  }

  return (
    <>
      <Button
        disabled={notReady}
        isLoading={submitting}
        onClick={handlePayment}
        size="large"
        data-testid="submit-order-button"
      >
        Place order
      </Button>
      <ErrorMessage
        error={errorMessage}
        data-testid="manual-payment-error-message"
      />
    </>
  )
}

/**
 * P1.4: the backend's PaystackProviderService.initiatePayment already
 * returns data.access_code (see that service's own comment) precisely
 * so the browser can resume the already-server-initialized transaction
 * via Inline.js's resumeTransaction(), instead of a redirect flow --
 * confirmed against @paystack/inline-js's own README (no shipped
 * types, see src/types/paystack-inline-js.d.ts).
 *
 * onSuccess here is only a UI signal to proceed; it is NOT the trust
 * boundary. placeOrder() -> Medusa's completeCartWorkflow ->
 * PaystackProviderService.authorizePayment() re-verifies the
 * transaction server-side against Paystack's own API before an order
 * is ever created.
 */
const PaystackPaymentButton = ({
  cart,
  notReady,
  "data-testid": dataTestId,
}: {
  cart: HttpTypes.StoreCart
  notReady: boolean
  "data-testid"?: string
}) => {
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const session = cart.payment_collection?.payment_sessions?.find(
    (s) => s.status === "pending"
  )
  const accessCode = session?.data?.access_code as string | undefined

  const handlePayment = () => {
    if (!accessCode) {
      setErrorMessage("Payment session is missing a Paystack access code.")
      return
    }

    setSubmitting(true)
    setErrorMessage(null)

    const popup = new PaystackPop()
    popup.resumeTransaction(accessCode, {
      onSuccess: () => {
        placeOrder()
          .catch((err) => {
            setErrorMessage(err.message)
          })
          .finally(() => {
            setSubmitting(false)
          })
      },
      onCancel: () => {
        setSubmitting(false)
      },
      onError: (error) => {
        setErrorMessage(error.message)
        setSubmitting(false)
      },
    })
  }

  return (
    <>
      <Button
        disabled={notReady || !accessCode}
        onClick={handlePayment}
        size="large"
        isLoading={submitting}
        data-testid={dataTestId}
      >
        Place order
      </Button>
      <ErrorMessage
        error={errorMessage}
        data-testid="paystack-payment-error-message"
      />
    </>
  )
}

/**
 * Pay with Transfer has nothing to "click" to complete -- the shopper
 * must leave the page and make a real bank transfer to the generated
 * temporary account. completeCartWorkflow (Medusa's own, confirmed by
 * reading its source) is idempotent: calling placeOrder() repeatedly is
 * safe and will not create duplicate orders, and each call's own
 * authorizePayment() re-verifies against Paystack's real API (G-P2:
 * verify, don't just trust the webhook) -- so light polling here, not a
 * webhook-only wait, is both simple and correct. A successful call
 * redirects via placeOrder()'s own existing redirect(); until then, a
 * "not authorized yet" response is expected and silently retried.
 */
const PaystackTransferPanel = ({
  cart,
  notReady,
  "data-testid": dataTestId,
}: {
  cart: HttpTypes.StoreCart
  notReady: boolean
  "data-testid"?: string
}) => {
  const [checking, setChecking] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const session = cart.payment_collection?.payment_sessions?.find(
    (s) => s.status === "pending"
  )
  const accountNumber = session?.data?.account_number as string | undefined
  const bankName = session?.data?.bank_name as string | undefined
  const accountName = session?.data?.account_name as string | undefined
  const expiresAt = session?.data?.account_expires_at as string | undefined

  const checkNow = async () => {
    setChecking(true)
    setErrorMessage(null)
    try {
      await placeOrder()
    } catch {
      // Not authorized yet -- expected until the transfer is completed
      // and verified. Unlike the silent background poll, a manual click
      // deserves a gentle status message rather than nothing happening.
      setErrorMessage(
        "Not confirmed yet -- this can take a few minutes after your transfer. We'll also check automatically."
      )
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    if (notReady || !accountNumber) return
    const interval = setInterval(() => {
      placeOrder().catch(() => {})
    }, 5000)
    return () => clearInterval(interval)
  }, [notReady, accountNumber])

  if (!accountNumber) {
    return <ErrorMessage error="Payment session is missing transfer account details." />
  }

  return (
    <div className="flex flex-col gap-y-4" data-testid={dataTestId}>
      <div className="bg-ui-bg-subtle border border-ui-border-base rounded-lg p-4 flex flex-col gap-y-1">
        <Text className="txt-small text-ui-fg-subtle">Transfer to</Text>
        <Text className="txt-large-plus" data-testid="transfer-account-number">
          {accountNumber}
        </Text>
        <Text className="txt-medium text-ui-fg-subtle">
          {bankName} · {accountName}
        </Text>
        {expiresAt && (
          <Text className="txt-small text-ui-fg-muted mt-2">
            Expires {new Date(expiresAt).toLocaleTimeString()}
          </Text>
        )}
      </div>
      <Text className="txt-small text-ui-fg-subtle">
        We&apos;ll confirm automatically once the transfer arrives. You can
        also check manually below.
      </Text>
      <Button
        onClick={checkNow}
        size="large"
        isLoading={checking}
        disabled={notReady}
      >
        I&apos;ve made the transfer
      </Button>
      <ErrorMessage
        error={errorMessage}
        data-testid="paystack-transfer-error-message"
      />
    </div>
  )
}

export default PaymentButton
