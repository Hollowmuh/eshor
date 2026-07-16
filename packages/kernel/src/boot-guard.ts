/**
 * Boot guard (hardening §6): refuse to start with environment/key mismatches.
 * Called first thing in every app entrypoint. The classic incident this
 * prevents: prod booted with test keys (silent no-op payments) or staging
 * booted with live keys (real charges from test runs).
 */

export type AppEnv = "development" | "staging" | "production";

export class BootGuardError extends Error {}

export interface BootGuardInput {
  appEnv: string | undefined;
  paystackSecretKey?: string | undefined;
  databaseUrl?: string | undefined;
}

export function assertBootSafe(input: BootGuardInput): AppEnv {
  const env = input.appEnv;
  if (env !== "development" && env !== "staging" && env !== "production") {
    throw new BootGuardError(
      `APP_ENV must be development|staging|production, got "${env ?? "(unset)"}"`,
    );
  }

  const key = input.paystackSecretKey;
  if (key !== undefined && key !== "") {
    const isLive = key.startsWith("sk_live_");
    const isTest = key.startsWith("sk_test_");
    if (!isLive && !isTest) {
      throw new BootGuardError("PAYSTACK_SECRET_KEY has an unrecognized prefix");
    }
    if (env === "production" && !isLive) {
      throw new BootGuardError("production boot refused: Paystack key is not sk_live_");
    }
    if (env !== "production" && isLive) {
      throw new BootGuardError(`${env} boot refused: live Paystack key present`);
    }
  }

  const db = input.databaseUrl;
  if (env === "production" && db !== undefined && /localhost|127\.0\.0\.1/.test(db)) {
    throw new BootGuardError("production boot refused: DATABASE_URL points at localhost");
  }

  return env;
}
