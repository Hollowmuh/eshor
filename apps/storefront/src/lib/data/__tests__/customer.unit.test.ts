import { describe, expect, it, vi, beforeEach } from "vitest"

/**
 * silentGuestAuth (customer.ts) is the piece of real, security-relevant
 * branching logic this session wired into checkout's setAddresses --
 * previously untested (apps/storefront had zero test coverage of any
 * kind). Its own doc comment explains WHY it exists (Medusa's
 * createPaymentSessionsWorkflow only populates context.customer for an
 * authenticated request); these tests guard the four real outcomes.
 *
 * sdk (a plain module-level Medusa client instance) and ./cookies (named
 * function exports, no Next.js server-action/cookies() context actually
 * needed under plain Vitest execution) are both trivially vi.mock-able.
 */
const register = vi.fn()
const login = vi.fn()
const customerRetrieve = vi.fn()
const customerCreate = vi.fn()
const cartTransferCart = vi.fn()

vi.mock("@lib/config", () => ({
  sdk: {
    auth: { register, login },
    store: {
      customer: { retrieve: customerRetrieve, create: customerCreate },
      cart: { transferCart: cartTransferCart },
    },
  },
}))

const getAuthHeaders = vi.fn()
const setAuthToken = vi.fn()
const getCartId = vi.fn()
const getCacheTag = vi.fn(async () => "tag")

vi.mock("../cookies", () => ({
  getAuthHeaders,
  setAuthToken,
  getCartId,
  getCacheTag,
  getCacheOptions: vi.fn(async () => ({})),
  getPendingCustomer: vi.fn(),
  removeAuthToken: vi.fn(),
  removeCartId: vi.fn(),
  removePendingCustomer: vi.fn(),
  setPendingCustomer: vi.fn(),
}))

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}))

// customer.ts imports `redirect` at module scope for its OTHER exports
// (not silentGuestAuth itself) -- next/navigation transitively pulls in
// the `server-only` package, which throws outside a real Next.js server
// context. Mocking it here is just satisfying that top-level import,
// not something silentGuestAuth's own behavior depends on.
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}))

const { silentGuestAuth } = await import("../customer")

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) -- otherwise a mockResolvedValue/
  // mockRejectedValue configured in one test leaks its return value
  // into the next test's calls, since clearAllMocks only resets call
  // history, not configured implementations.
  vi.resetAllMocks()
  getAuthHeaders.mockResolvedValue({})
  getCartId.mockResolvedValue(undefined)
  getCacheTag.mockResolvedValue("tag")
})

describe("silentGuestAuth", () => {
  it("no-ops and returns ok when already authenticated", async () => {
    getAuthHeaders.mockResolvedValue({ authorization: "Bearer existing-token" })

    const result = await silentGuestAuth("shopper@eshor.dev")

    expect(result).toEqual({ state: "ok" })
    expect(register).not.toHaveBeenCalled()
  })

  it("registers, logs in, and links the cart on a fresh email", async () => {
    register.mockResolvedValue({ token: "register-token" })
    login.mockResolvedValue("login-token")
    customerRetrieve.mockResolvedValue({ customer: { id: "cus_123" } })

    const result = await silentGuestAuth("newshopper@eshor.dev")

    expect(result).toEqual({ state: "ok" })
    expect(register).toHaveBeenCalledWith(
      "customer",
      "emailpass",
      expect.objectContaining({ email: "newshopper@eshor.dev" })
    )
    expect(login).toHaveBeenCalledWith(
      "customer",
      "emailpass",
      expect.objectContaining({ email: "newshopper@eshor.dev" })
    )
    expect(setAuthToken).toHaveBeenCalledWith("login-token")
  })

  it("creates the Customer record and re-logs-in when the identity has no linked customer yet", async () => {
    register.mockResolvedValue({ token: "register-token" })
    login.mockResolvedValueOnce("first-login-token")
    customerRetrieve.mockRejectedValue(new Error("not found"))
    customerCreate.mockResolvedValue({})
    login.mockResolvedValueOnce("relogin-token")

    const result = await silentGuestAuth("brandnew@eshor.dev")

    expect(result).toEqual({ state: "ok" })
    expect(customerCreate).toHaveBeenCalled()
    // The re-login token (not the pre-customer-creation one) must be
    // what gets persisted -- this exact sequencing was the real bug
    // found live 2026-07-18 when this same logic was hand-replayed in
    // p1-4-checkout-guest-drill.ts and 401'd until the re-login step
    // was added.
    expect(setAuthToken).toHaveBeenCalledWith("relogin-token")
    expect(login).toHaveBeenCalledTimes(2)
  })

  it("returns identity_exists for a genuinely returning shopper, without silently clobbering their session", async () => {
    register.mockRejectedValue({
      statusText: "Unauthorized",
      message: "Identity with email already exists",
    })

    const result = await silentGuestAuth("returning@eshor.dev")

    expect(result).toEqual({ state: "identity_exists", email: "returning@eshor.dev" })
    expect(login).not.toHaveBeenCalled()
    expect(setAuthToken).not.toHaveBeenCalled()
  })

  it("returns a generic error state for any other registration failure", async () => {
    register.mockRejectedValue(new Error("network exploded"))

    const result = await silentGuestAuth("shopper@eshor.dev")

    expect(result.state).toBe("error")
  })

  it("returns an error state when login fails after a successful register", async () => {
    register.mockResolvedValue({ token: "register-token" })
    login.mockRejectedValue(new Error("login exploded"))

    const result = await silentGuestAuth("shopper@eshor.dev")

    expect(result.state).toBe("error")
  })
})
