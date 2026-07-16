import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  assertLegalTransition,
  IllegalTransitionError,
  isTerminal,
  ORDER_STATES,
  TRANSITIONS,
  type OrderState,
} from "../src/order-states";

describe("Order state machine", () => {
  it("every state appears in the transition table", () => {
    for (const s of ORDER_STATES) {
      expect(TRANSITIONS[s]).toBeDefined();
    }
  });

  it("every transition target is a known state", () => {
    for (const s of ORDER_STATES) {
      for (const t of TRANSITIONS[s]) {
        expect(ORDER_STATES).toContain(t);
      }
    }
  });

  it("no state transitions to itself", () => {
    for (const s of ORDER_STATES) {
      expect(TRANSITIONS[s]).not.toContain(s);
    }
  });

  it("terminal states are exactly closed and refunded", () => {
    expect(ORDER_STATES.filter(isTerminal)).toEqual(["closed", "refunded"]);
  });

  it("the happy path is legal end to end", () => {
    const path: OrderState[] = [
      "pending_payment",
      "paid",
      "dispatched",
      "out_for_delivery",
      "delivered",
      "closed",
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(() => assertLegalTransition(path[i]!, path[i + 1]!)).not.toThrow();
    }
  });

  it("made-to-order path includes sewing", () => {
    expect(() => assertLegalTransition("paid", "sewing")).not.toThrow();
    expect(() => assertLegalTransition("sewing", "dispatched")).not.toThrow();
  });

  it("blocks the transitions that lose money", () => {
    // skipping payment
    expect(() => assertLegalTransition("pending_payment", "dispatched")).toThrow(
      IllegalTransitionError,
    );
    // un-delivering
    expect(() => assertLegalTransition("delivered", "dispatched")).toThrow(
      IllegalTransitionError,
    );
    // resurrecting a refund
    expect(() => assertLegalTransition("refunded", "paid")).toThrow(
      IllegalTransitionError,
    );
  });

  it("property: no walk from a terminal state exists", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ORDER_STATES.filter(isTerminal)),
        fc.constantFrom(...ORDER_STATES),
        (from, to) => {
          try {
            assertLegalTransition(from, to);
            return false; // any legal transition out of terminal = failure
          } catch (e) {
            return e instanceof IllegalTransitionError;
          }
        },
      ),
    );
  });

  it("property: every non-terminal state can eventually reach a terminal state", () => {
    const reachesTerminal = (start: OrderState): boolean => {
      const seen = new Set<OrderState>();
      const stack: OrderState[] = [start];
      while (stack.length > 0) {
        const s = stack.pop()!;
        if (isTerminal(s)) return true;
        if (seen.has(s)) continue;
        seen.add(s);
        stack.push(...TRANSITIONS[s]);
      }
      return false;
    };
    for (const s of ORDER_STATES) {
      expect(reachesTerminal(s) || isTerminal(s), s).toBe(true);
    }
  });
});
