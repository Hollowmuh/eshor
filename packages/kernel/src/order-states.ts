/**
 * Order state machine — the transition table is the spec (E4 AC2).
 * transition() in the backend enforces this table inside a DB transaction
 * with an outbox write; this module is the pure, shared definition both
 * apps and tests consume.
 */

export const ORDER_STATES = [
  "pending_payment",
  "partially_paid",
  "pending_cod",
  "pending_review",
  "paid",
  "sewing",
  "dispatched",
  "out_for_delivery",
  "delivered",
  "closed",
  "cancelled",
  "refunded",
] as const;

export type OrderState = (typeof ORDER_STATES)[number];

/** Legal transitions: from → set of allowed targets. */
export const TRANSITIONS: Readonly<Record<OrderState, readonly OrderState[]>> = {
  pending_payment: ["paid", "partially_paid", "pending_cod", "pending_review", "cancelled"],
  partially_paid: ["paid", "cancelled", "refunded"],
  pending_cod: ["dispatched", "cancelled"],
  pending_review: ["paid", "cancelled", "refunded"],
  paid: ["sewing", "dispatched", "cancelled", "refunded"],
  sewing: ["dispatched", "cancelled", "refunded"],
  dispatched: ["out_for_delivery", "delivered"],
  out_for_delivery: ["delivered"],
  delivered: ["closed", "refunded"],
  closed: [],
  cancelled: ["refunded"],
  refunded: [],
};

export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: OrderState,
    public readonly to: OrderState,
  ) {
    super(`illegal order transition: ${from} -> ${to}`);
  }
}

export function assertLegalTransition(from: OrderState, to: OrderState): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new IllegalTransitionError(from, to);
  }
}

export function isTerminal(state: OrderState): boolean {
  return TRANSITIONS[state].length === 0;
}
