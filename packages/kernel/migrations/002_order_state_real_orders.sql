-- P1.1: retire orders_lite (P0's deliberate stand-in, built to prove the
-- transition/outbox kernel against real concurrent Postgres independent
-- of Medusa's own order machinery -- that job is done) and replace it
-- with order_state, keyed by a REAL Medusa order id.
--
-- Design note: an earlier plan proposed a separate Medusa-native module
-- (its own MikroORM model, linked via defineLink) for this. Rejected
-- during implementation: Medusa's ORM writes and this schema's raw-pg
-- writes are different connection pools, so a Medusa module here could
-- NOT share one transaction with the outbox write -- breaking the exact
-- atomicity guarantee (hardening S2.3) this whole spine exists to
-- provide. order_state stays in eshor_core, written via the same
-- withTransaction()/pg.Pool the outbox already uses, so the state write
-- and the outbox write remain genuinely atomic.

SET search_path TO eshor_core;

CREATE TABLE IF NOT EXISTS order_state (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medusa_order_id   text NOT NULL UNIQUE,
  state             text NOT NULL DEFAULT 'pending_payment',
  tracking_token    text NOT NULL UNIQUE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS order_state_transition_guard ON order_state;
CREATE TRIGGER order_state_transition_guard
  BEFORE UPDATE ON order_state
  FOR EACH ROW EXECUTE FUNCTION eshor_core.assert_legal_transition();

GRANT SELECT, INSERT, UPDATE ON eshor_core.order_state TO eshor_app;

-- orders_lite is superseded. Drop its guard trigger first (references
-- the table), then the table itself.
DROP TRIGGER IF EXISTS orders_lite_transition_guard ON orders_lite;
DROP TABLE IF EXISTS orders_lite;
