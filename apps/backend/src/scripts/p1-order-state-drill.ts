/**
 * P1.1 verification drill: creates ONE real Medusa order (via
 * createOrderWorkflow -- the admin/draft-order path), then verifies the
 * order-state subscribers' OWN logic directly against it.
 *
 * Real finding from building this: createOrderWorkflow does NOT emit
 * order.placed (confirmed by grepping its compiled source -- no
 * emitEventStep call at all). Only completeCartWorkflow does (confirmed:
 * dist/cart/workflows/complete-cart.js calls emitEventStep with
 * OrderWorkflowEvents.PLACED). completeCartWorkflow needs a full cart
 * (region, line items, shipping address, shipping method, payment
 * session) to run -- building that here would essentially duplicate
 * P1.4's actual checkout work just to fire one event in isolation. So
 * this drill calls the subscriber handlers directly (a real order id,
 * real DB writes, real kernel calls -- just not dispatched via the
 * event bus) to prove the HANDLER LOGIC is correct now; the full
 * event-triggered path gets proven for real once P1.4's checkout
 * exists and completeCartWorkflow actually runs.
 *
 * Run: npx medusa exec ./src/scripts/p1-order-state-drill.ts
 */
import type { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { createOrderWorkflow } from "@medusajs/medusa/core-flows";
import {
  ensureOrderState,
  getOrderState,
  getOrderStateByTrackingToken,
  transitionOrder,
} from "@eshor/kernel";
import orderStatePlacedHandler from "./../subscribers/order-state-placed";
import orderStateFulfillmentCreatedHandler from "./../subscribers/order-state-fulfillment-created";
import orderStateCanceledHandler from "./../subscribers/order-state-canceled";

function assertEqual(label: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`DRILL-FAILED [${label}]: expected ${expected}, got ${actual}`);
  }
  console.log(`  ok: ${label} = ${actual}`);
}

export default async function p1OrderStateDrill({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve("logger");
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL);
  const regionModuleService = container.resolve(Modules.REGION);
  const productModuleService = container.resolve(Modules.PRODUCT);

  const [salesChannel] = await salesChannelModuleService.listSalesChannels({
    name: "Default Sales Channel",
  });
  const [region] = await regionModuleService.listRegions({ name: "Nigeria" });
  const [product] = await productModuleService.listProducts(
    { handle: "aja-dress" },
    { relations: ["variants"] },
  );
  if (!salesChannel || !region || !product) {
    throw new Error("prerequisite missing: run seed-demo.ts first");
  }
  const variant = product.variants![0]!;

  logger.info("Creating a real order via createOrderWorkflow...");
  const { result: order } = await createOrderWorkflow(container).run({
    input: {
      email: "drill@eshor.dev",
      region_id: region.id,
      sales_channel_id: salesChannel.id,
      currency_code: "ngn",
      items: [{ variant_id: variant.id, quantity: 1, title: variant.title ?? "Drill item", unit_price: 24500 }],
      shipping_address: {
        first_name: "Drill",
        last_name: "Test",
        address_1: "1 Test Street",
        city: "Lagos",
        country_code: "ng",
      },
    },
  });
  logger.info(`Order created: ${order.id}`);

  logger.info("Invoking order-state-placed handler directly (real order, real DB write)...");
  await orderStatePlacedHandler({
    event: { data: { id: order.id }, name: "order.placed" },
    container,
  } as never);
  assertEqual("state after order.placed handler", await getOrderState(order.id), "pending_payment");

  const { trackingToken } = await ensureOrderState(order.id);
  const byToken = await getOrderStateByTrackingToken(trackingToken);
  assertEqual("tracking lookup resolves the real order", byToken?.medusaOrderId, order.id);

  // payment.captured needs a real payment id to resolve payment ->
  // payment_collection -> order; createOrderWorkflow doesn't create one
  // (no cart, no payment session). Test the fulfillment + cancellation
  // handlers instead, which only need the order id directly (confirmed
  // live: order.fulfillment_created payload has order_id; order.canceled
  // payload has id -- both direct, no payment-style resolution needed).
  //
  // First move to "paid" via the kernel directly (simulating what
  // payment.captured's subscriber would do once real payments exist)
  // so the dispatched/cancelled transitions below are legal.
  await transitionOrder(order.id, "paid");

  logger.info("Invoking order-state-fulfillment-created handler directly...");
  await orderStateFulfillmentCreatedHandler({
    event: { data: { order_id: order.id, fulfillment_id: "fulfillment_drill" }, name: "order.fulfillment_created" },
    container,
  } as never);
  assertEqual("state after fulfillment_created handler", await getOrderState(order.id), "dispatched");

  // dispatched -> cancelled is NOT a legal transition per the state
  // machine (once shipped, cancellation is a refund/return flow, not a
  // plain cancel) -- confirm the canceled handler correctly no-ops
  // rather than crashing, per its own IllegalTransitionError guard.
  logger.info("Invoking order-state-canceled handler on an already-dispatched order (expect graceful no-op)...");
  await orderStateCanceledHandler({
    event: { data: { id: order.id }, name: "order.canceled" },
    container,
  } as never);
  assertEqual("state unchanged after illegal cancel attempt", await getOrderState(order.id), "dispatched");

  logger.info("DRILL-OK: order-state subscriber handlers verified against a real order");
}
