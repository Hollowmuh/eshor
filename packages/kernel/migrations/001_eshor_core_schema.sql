-- eshor spine tables live in their own schema, deliberately separate from
-- Medusa's own (public) schema so Medusa's migration tooling never touches
-- these, and so DB-role grants below can be scoped cleanly (hardening §2.4).
CREATE SCHEMA IF NOT EXISTS eshor_core;

SET search_path TO eshor_core;

-- ============================================================
-- state_transitions: the order state machine as data (hardening §2.1).
-- Mirrors packages/kernel/src/order-states.ts TRANSITIONS table exactly;
-- kept here too so the DB can enforce legality independent of the app
-- (defense in depth: a bug in the app layer still can't write an illegal
-- transition because the trigger below checks against this table).
-- ============================================================
CREATE TABLE IF NOT EXISTS state_transitions (
  from_state   text NOT NULL,
  to_state     text NOT NULL,
  guard_name   text,
  PRIMARY KEY (from_state, to_state)
);

INSERT INTO state_transitions (from_state, to_state) VALUES
  ('pending_payment', 'paid'),
  ('pending_payment', 'partially_paid'),
  ('pending_payment', 'pending_cod'),
  ('pending_payment', 'pending_review'),
  ('pending_payment', 'cancelled'),
  ('partially_paid', 'paid'),
  ('partially_paid', 'cancelled'),
  ('partially_paid', 'refunded'),
  ('pending_cod', 'dispatched'),
  ('pending_cod', 'cancelled'),
  ('pending_review', 'paid'),
  ('pending_review', 'cancelled'),
  ('pending_review', 'refunded'),
  ('paid', 'sewing'),
  ('paid', 'dispatched'),
  ('paid', 'cancelled'),
  ('paid', 'refunded'),
  ('sewing', 'dispatched'),
  ('sewing', 'cancelled'),
  ('sewing', 'refunded'),
  ('dispatched', 'out_for_delivery'),
  ('dispatched', 'delivered'),
  ('out_for_delivery', 'delivered'),
  ('delivered', 'closed'),
  ('delivered', 'refunded'),
  ('cancelled', 'refunded')
ON CONFLICT DO NOTHING;

-- ============================================================
-- orders_lite: the smallest possible order-header row needed to exercise
-- the state machine + stock reservation primitives in isolation, ahead of
-- full Medusa order-module wiring (P1). Real order data stays in Medusa;
-- this table is superseded/removed once the paystack/order integration
-- lands and transition() operates on Medusa's own order aggregate.
-- ============================================================
CREATE TABLE IF NOT EXISTS orders_lite (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state       text NOT NULL DEFAULT 'pending_payment',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION eshor_core.assert_legal_transition()
RETURNS trigger AS $$
BEGIN
  IF NEW.state IS DISTINCT FROM OLD.state THEN
    IF NOT EXISTS (
      SELECT 1 FROM eshor_core.state_transitions
      WHERE from_state = OLD.state AND to_state = NEW.state
    ) THEN
      RAISE EXCEPTION 'illegal order transition: % -> %', OLD.state, NEW.state
        USING ERRCODE = '23514';
    END IF;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_lite_transition_guard ON orders_lite;
CREATE TRIGGER orders_lite_transition_guard
  BEFORE UPDATE ON orders_lite
  FOR EACH ROW EXECUTE FUNCTION eshor_core.assert_legal_transition();

-- ============================================================
-- outbox: transactional outbox (hardening §2.3). Written in the same tx
-- as any state change; a relay worker polls unprocessed rows and delivers
-- at-least-once. Consumers are keyed by outbox id for idempotency.
-- ============================================================
CREATE TABLE IF NOT EXISTS outbox (
  id            bigserial PRIMARY KEY,
  event_type    text NOT NULL,
  payload       jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz
);

CREATE INDEX IF NOT EXISTS outbox_unprocessed_idx
  ON outbox (created_at) WHERE processed_at IS NULL;

-- ============================================================
-- ledger: append-only money ledger (hardening §2.5). Balance is always
-- SUM(amount_kobo) for a given account — never a stored, mutated field.
-- UPDATE/DELETE are revoked from the application role below; corrections
-- are compensating entries, not edits.
-- ============================================================
CREATE TABLE IF NOT EXISTS ledger (
  id            bigserial PRIMARY KEY,
  account_ref   text NOT NULL,       -- e.g. "customer:<id>" or "order:<id>"
  entry_type    text NOT NULL,       -- credit_issued | credit_redeemed | refund | referral_bonus | correction
  amount_kobo   bigint NOT NULL CHECK (amount_kobo <> 0),
  ref           text,                -- idempotency key: e.g. paystack ref, referral id
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entry_type, ref)
);

CREATE INDEX IF NOT EXISTS ledger_account_idx ON ledger (account_ref);

-- ============================================================
-- variants_lite / reservations: atomic-stock primitives (hardening §2.2).
-- variants_lite stands in for Medusa's variant.stock until the catalog
-- module (Day 5) links real Medusa variant ids here via module link.
-- ============================================================
CREATE TABLE IF NOT EXISTS variants_lite (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku         text NOT NULL UNIQUE,
  stock_qty   integer NOT NULL DEFAULT 0 CHECK (stock_qty >= 0)
);

CREATE TABLE IF NOT EXISTS reservations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id   uuid NOT NULL REFERENCES variants_lite(id),
  qty          integer NOT NULL CHECK (qty > 0),
  expires_at   timestamptz NOT NULL,
  released_at  timestamptz
);

CREATE INDEX IF NOT EXISTS reservations_unexpired_idx
  ON reservations (expires_at) WHERE released_at IS NULL;

-- ============================================================
-- Role hardening: a limited app role that cannot UPDATE/DELETE the ledger,
-- proving append-only at the DB layer, not just app convention.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'eshor_app') THEN
    CREATE ROLE eshor_app LOGIN PASSWORD 'eshor_app_dev';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA eshor_core TO eshor_app;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA eshor_core TO eshor_app;
GRANT UPDATE, DELETE ON eshor_core.orders_lite TO eshor_app;
GRANT UPDATE ON eshor_core.outbox TO eshor_app; -- processed_at only, enforced in app code
GRANT UPDATE, DELETE ON eshor_core.reservations TO eshor_app;
GRANT UPDATE, DELETE ON eshor_core.variants_lite TO eshor_app;
-- Deliberately NOT granted: UPDATE/DELETE on eshor_core.ledger.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA eshor_core TO eshor_app;
