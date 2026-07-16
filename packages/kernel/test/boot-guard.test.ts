import { describe, expect, it } from "vitest";
import { assertBootSafe, BootGuardError } from "../src/boot-guard";

describe("Boot guard (hardening §6)", () => {
  it("accepts matching env/key pairs", () => {
    expect(
      assertBootSafe({ appEnv: "production", paystackSecretKey: "sk_live_abc" }),
    ).toBe("production");
    expect(
      assertBootSafe({ appEnv: "development", paystackSecretKey: "sk_test_abc" }),
    ).toBe("development");
    expect(assertBootSafe({ appEnv: "staging", paystackSecretKey: "sk_test_abc" })).toBe(
      "staging",
    );
  });

  it("refuses production with a test key — the classic incident", () => {
    expect(() =>
      assertBootSafe({ appEnv: "production", paystackSecretKey: "sk_test_abc" }),
    ).toThrow(BootGuardError);
  });

  it("refuses staging/dev with a live key — real charges from test runs", () => {
    expect(() =>
      assertBootSafe({ appEnv: "staging", paystackSecretKey: "sk_live_abc" }),
    ).toThrow(BootGuardError);
    expect(() =>
      assertBootSafe({ appEnv: "development", paystackSecretKey: "sk_live_abc" }),
    ).toThrow(BootGuardError);
  });

  it("refuses unknown key prefixes and unknown envs", () => {
    expect(() =>
      assertBootSafe({ appEnv: "production", paystackSecretKey: "pk_live_abc" }),
    ).toThrow(BootGuardError);
    expect(() => assertBootSafe({ appEnv: "prod" })).toThrow(BootGuardError);
    expect(() => assertBootSafe({ appEnv: undefined })).toThrow(BootGuardError);
  });

  it("refuses production pointed at a localhost database", () => {
    expect(() =>
      assertBootSafe({
        appEnv: "production",
        databaseUrl: "postgres://eshor:x@localhost:5432/eshor",
      }),
    ).toThrow(BootGuardError);
  });

  it("allows missing key during early P0 (payments not integrated yet)", () => {
    expect(assertBootSafe({ appEnv: "development" })).toBe("development");
  });
});
