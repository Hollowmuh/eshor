import { Heading, Text } from "@modules/common/components/ui"
import { cookies as nextCookies } from "next/headers"

import CartTotals from "@modules/common/components/cart-totals"
import Help from "@modules/order/components/help"
import Items from "@modules/order/components/items"
import OnboardingCta from "@modules/order/components/onboarding-cta"
import OrderDetails from "@modules/order/components/order-details"
import ShippingDetails from "@modules/order/components/shipping-details"
import PaymentDetails from "@modules/order/components/payment-details"
import { HttpTypes } from "@medusajs/types"
import { getDeliveryQuote } from "@lib/data/delivery-zones"
import { getOrderTrackingToken } from "@lib/data/orders"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

type OrderCompletedTemplateProps = {
  order: HttpTypes.StoreOrder
}

/**
 * order.shipping_methods carries the delivery FEE (already shown by
 * ShippingDetails) but not the ETA -- delivery-zones-fulfillment's
 * calculatePrice() only returns calculated_amount, not eta_min/max_days
 * (see that service's own comment). Re-querying delivery-zones by the
 * order's own address is the same lookup the cart-page delivery
 * estimator already does, just server-side here.
 */
async function DeliveryEta({ order }: { order: HttpTypes.StoreOrder }) {
  const state = order.shipping_address?.province
  if (!state) return null

  const quote = await getDeliveryQuote(state, order.shipping_address?.city ?? undefined)
  if (!quote) return null

  const etaText =
    quote.eta_min_days === quote.eta_max_days
      ? `${quote.eta_min_days} day${quote.eta_min_days === 1 ? "" : "s"}`
      : `${quote.eta_min_days}–${quote.eta_max_days} days`

  return (
    <Text className="txt-medium text-ui-fg-subtle" data-testid="order-delivery-eta">
      Arriving in {etaText} to {order.shipping_address?.city ?? state}, {state}.
    </Text>
  )
}

async function TrackOrderLink({ order }: { order: HttpTypes.StoreOrder }) {
  const token = await getOrderTrackingToken(order.id)
  if (!token) return null

  return (
    <LocalizedClientLink
      href={`/track/${token}`}
      className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-medium"
      data-testid="order-tracking-link"
    >
      Track your order
    </LocalizedClientLink>
  )
}

function WhatsAppCta({ order }: { order: HttpTypes.StoreOrder }) {
  const number = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER
  if (!number) return null

  const message = encodeURIComponent(
    `Hi eshor! I have a question about order #${order.display_id}.`
  )

  return (
    <a
      href={`https://wa.me/${number}?text=${message}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-medium"
      data-testid="order-whatsapp-cta"
    >
      Questions about your order? Message us on WhatsApp
    </a>
  )
}

export default async function OrderCompletedTemplate({
  order,
}: OrderCompletedTemplateProps) {
  const cookies = await nextCookies()

  const isOnboarding = cookies.get("_medusa_onboarding")?.value === "true"

  return (
    <div className="py-6 min-h-[calc(100vh-64px)]">
      <div className="content-container flex flex-col justify-center items-center gap-y-10 max-w-4xl h-full w-full">
        {isOnboarding && <OnboardingCta orderId={order.id} />}
        <div
          className="flex flex-col gap-4 max-w-4xl h-full bg-white w-full py-10"
          data-testid="order-complete-container"
        >
          <Heading
            level="h1"
            className="flex flex-col gap-y-3 text-ui-fg-base text-3xl mb-4"
          >
            <span>Thank you!</span>
            <span>Your order was placed successfully.</span>
          </Heading>
          <DeliveryEta order={order} />
          <TrackOrderLink order={order} />
          <WhatsAppCta order={order} />
          <OrderDetails order={order} />
          <Heading level="h2" className="flex flex-row text-3xl-regular">
            Summary
          </Heading>
          <Items order={order} />
          <CartTotals totals={order} />
          <ShippingDetails order={order} />
          <PaymentDetails order={order} />
          <Help />
        </div>
      </div>
    </div>
  )
}
