import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { IllegalTransitionError } from "@eshor/kernel";
import orderStatePlacedHandler from "../order-state-placed";
import orderStateCanceledHandler from "../order-state-canceled";
import orderStateFulfillmentCreatedHandler from "../order-state-fulfillment-created";
import orderStatePaymentCapturedHandler from "../order-state-payment-captured";
import orderStatePaymentRefundedHandler from "../order-state-payment-refunded";

/**
 * All five order-state subscribers share the same real risk: Medusa
 * fires these events more than once for the same order in ordinary
 * operation (draft-order conversion, multiple payments per collection,
 * partial fulfillments) -- each handler's own comment explains why. The
 * one thing that must never regress is the IllegalTransitionError
 * swallow/rethrow boundary: swallow it (expected double-fire), rethrow
 * anything else (a real bug must not go silent). ensureOrderState/
 * transitionOrder are mocked (they're @eshor/kernel's own, already unit
 * tested in packages/kernel/test/order-states.test.ts) -- the REAL
 * IllegalTransitionError class is kept (not mocked) so instanceof
 * checks in the handlers under test behave exactly as they do live.
 */
const ensureOrderState = jest.fn();
const transitionOrder = jest.fn();

jest.mock("@eshor/kernel", () => ({
  ...jest.requireActual("@eshor/kernel"),
  ensureOrderState: (...args: unknown[]) => ensureOrderState(...args),
  transitionOrder: (...args: unknown[]) => transitionOrder(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe("order-state-placed (order.placed)", () => {
  it("ensures order state exists for the placed order", async () => {
    await orderStatePlacedHandler({ event: { data: { id: "order_1" } } } as any);
    expect(ensureOrderState).toHaveBeenCalledWith("order_1");
  });
});

describe("order-state-canceled (order.canceled)", () => {
  it("transitions to cancelled", async () => {
    transitionOrder.mockResolvedValue({});
    await orderStateCanceledHandler({ event: { data: { id: "order_1" } } } as any);
    expect(transitionOrder).toHaveBeenCalledWith("order_1", "cancelled");
  });

  it("swallows IllegalTransitionError (already-terminal order canceled twice)", async () => {
    transitionOrder.mockRejectedValue(new IllegalTransitionError("cancelled", "cancelled"));
    await expect(
      orderStateCanceledHandler({ event: { data: { id: "order_1" } } } as any),
    ).resolves.toBeUndefined();
  });

  it("rethrows any other error (a real bug must not go silent)", async () => {
    transitionOrder.mockRejectedValue(new Error("db exploded"));
    await expect(
      orderStateCanceledHandler({ event: { data: { id: "order_1" } } } as any),
    ).rejects.toThrow("db exploded");
  });
});

describe("order-state-fulfillment-created (order.fulfillment_created)", () => {
  it("transitions to dispatched using order_id, not fulfillment_id", async () => {
    transitionOrder.mockResolvedValue({});
    await orderStateFulfillmentCreatedHandler({
      event: { data: { order_id: "order_1", fulfillment_id: "ful_1" } },
    } as any);
    expect(transitionOrder).toHaveBeenCalledWith("order_1", "dispatched");
  });

  it("swallows IllegalTransitionError (a second fulfillment on an already-dispatched order)", async () => {
    transitionOrder.mockRejectedValue(new IllegalTransitionError("dispatched", "dispatched"));
    await expect(
      orderStateFulfillmentCreatedHandler({
        event: { data: { order_id: "order_1", fulfillment_id: "ful_1" } },
      } as any),
    ).resolves.toBeUndefined();
  });
});

function buildPaymentSubscriberContainer(opts: {
  paymentCollectionId?: string | null;
  orders?: { id: string }[];
}) {
  const retrievePayment = jest.fn().mockResolvedValue({
    payment_collection_id:
      opts.paymentCollectionId === undefined ? "pc_1" : opts.paymentCollectionId,
  });
  const graph = jest.fn().mockResolvedValue({ data: opts.orders ?? [{ id: "order_1" }] });

  const container = {
    resolve: (key: string) => {
      if (key === Modules.PAYMENT) return { retrievePayment };
      if (key === ContainerRegistrationKeys.QUERY) return { graph };
      throw new Error(`unexpected container.resolve key in test: ${key}`);
    },
  };
  return { container, retrievePayment, graph };
}

describe("order-state-payment-captured (payment.captured)", () => {
  it("resolves payment -> payment_collection -> order, then ensures state and transitions to paid", async () => {
    const { container } = buildPaymentSubscriberContainer({});
    transitionOrder.mockResolvedValue({});

    await orderStatePaymentCapturedHandler({
      event: { data: { id: "pay_1" } },
      container,
    } as any);

    expect(ensureOrderState).toHaveBeenCalledWith("order_1");
    expect(transitionOrder).toHaveBeenCalledWith("order_1", "paid");
  });

  it("returns early without transitioning when the payment has no payment_collection_id", async () => {
    const { container } = buildPaymentSubscriberContainer({ paymentCollectionId: null });

    await orderStatePaymentCapturedHandler({
      event: { data: { id: "pay_1" } },
      container,
    } as any);

    expect(transitionOrder).not.toHaveBeenCalled();
  });

  it("returns early without transitioning when no order matches the payment collection", async () => {
    const { container } = buildPaymentSubscriberContainer({ orders: [] });

    await orderStatePaymentCapturedHandler({
      event: { data: { id: "pay_1" } },
      container,
    } as any);

    expect(transitionOrder).not.toHaveBeenCalled();
  });

  it("swallows IllegalTransitionError (a second payment.captured for the same order -- double-charge protection, EC3.6)", async () => {
    const { container } = buildPaymentSubscriberContainer({});
    transitionOrder.mockRejectedValue(new IllegalTransitionError("paid", "paid"));

    await expect(
      orderStatePaymentCapturedHandler({ event: { data: { id: "pay_1" } }, container } as any),
    ).resolves.toBeUndefined();
  });

  it("rethrows any other error", async () => {
    const { container } = buildPaymentSubscriberContainer({});
    transitionOrder.mockRejectedValue(new Error("db exploded"));

    await expect(
      orderStatePaymentCapturedHandler({ event: { data: { id: "pay_1" } }, container } as any),
    ).rejects.toThrow("db exploded");
  });
});

describe("order-state-payment-refunded (payment.refunded)", () => {
  it("resolves payment -> payment_collection -> order, then transitions to refunded", async () => {
    const { container } = buildPaymentSubscriberContainer({});
    transitionOrder.mockResolvedValue({});

    await orderStatePaymentRefundedHandler({
      event: { data: { id: "pay_1" } },
      container,
    } as any);

    expect(transitionOrder).toHaveBeenCalledWith("order_1", "refunded");
    // Unlike payment.captured, refund does not need ensureOrderState --
    // a refund can only happen after an order genuinely already exists.
    expect(ensureOrderState).not.toHaveBeenCalled();
  });

  it("returns early without transitioning when the payment has no payment_collection_id", async () => {
    const { container } = buildPaymentSubscriberContainer({ paymentCollectionId: null });

    await orderStatePaymentRefundedHandler({
      event: { data: { id: "pay_1" } },
      container,
    } as any);

    expect(transitionOrder).not.toHaveBeenCalled();
  });

  it("returns early without transitioning when no order matches the payment collection", async () => {
    const { container } = buildPaymentSubscriberContainer({ orders: [] });

    await orderStatePaymentRefundedHandler({
      event: { data: { id: "pay_1" } },
      container,
    } as any);

    expect(transitionOrder).not.toHaveBeenCalled();
  });

  it("swallows IllegalTransitionError", async () => {
    const { container } = buildPaymentSubscriberContainer({});
    transitionOrder.mockRejectedValue(new IllegalTransitionError("refunded", "refunded"));

    await expect(
      orderStatePaymentRefundedHandler({ event: { data: { id: "pay_1" } }, container } as any),
    ).resolves.toBeUndefined();
  });
});
