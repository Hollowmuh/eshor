import DeliveryZonesFulfillmentProviderService from "../service";

/**
 * quoteFor() re-implements DeliveryZonesModuleService's 3-tier fallback
 * (see service.ts's own comment for why it's duplicated raw SQL rather
 * than an injected dependency) against a mocked pg pool, so a change
 * that breaks the duplicate is caught here without needing the live
 * Postgres the HTTP integration test (delivery-fulfillment.spec.ts)
 * exercises -- that test only ever drives a single Lagos state-default
 * zone, so it wouldn't catch a regression in tiers 1 or 3.
 */
const queryMock = jest.fn();
jest.mock("@eshor/kernel", () => ({
  getPool: () => ({ query: queryMock }),
}));

function buildService(): any {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;
  return new DeliveryZonesFulfillmentProviderService({ logger });
}

function zoneRow(fee_kobo: number) {
  return { rows: [{ fee_kobo, eta_min_days: 1, eta_max_days: 2 }] };
}

const noRows = { rows: [] };

beforeEach(() => {
  queryMock.mockReset();
});

describe("DeliveryZonesFulfillmentProviderService.calculatePrice 3-tier fallback", () => {
  it("tier 1: uses the exact state+area match without falling back", async () => {
    queryMock.mockResolvedValueOnce(zoneRow(100000));
    const service = buildService();

    const result = await service.calculatePrice({}, {}, {
      shipping_address: { province: "Lagos", city: "Ikeja" },
    });

    // fee_kobo (100000) divided by 100 -- calculated_amount is Medusa's
    // plain-decimal Naira convention, not raw kobo (see service.ts's own
    // comment on this division).
    expect(result.calculated_amount).toBe(1000);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("area = $2"), ["Lagos", "Ikeja"]);
  });

  it("tier 2: falls back to the state default when the area match misses", async () => {
    queryMock.mockResolvedValueOnce(noRows).mockResolvedValueOnce(zoneRow(150000));
    const service = buildService();

    const result = await service.calculatePrice({}, {}, {
      shipping_address: { province: "Lagos", city: "Somewhere Else" },
    });

    expect(result.calculated_amount).toBe(1500);
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("tier 2: goes straight to the state default when no area/city is given at all", async () => {
    queryMock.mockResolvedValueOnce(zoneRow(150000));
    const service = buildService();

    const result = await service.calculatePrice({}, {}, {
      shipping_address: { province: "Lagos" },
    });

    expect(result.calculated_amount).toBe(1500);
    // No city means the tier-1 area query must be skipped entirely, not
    // just given a null param -- otherwise it burns a needless query on
    // every single-address-field checkout.
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("area is null"), ["Lagos"]);
  });

  it("tier 3: falls back to the _default wildcard for an unconfigured state", async () => {
    queryMock.mockResolvedValueOnce(noRows).mockResolvedValueOnce(zoneRow(300000));
    const service = buildService();

    const result = await service.calculatePrice({}, {}, {
      shipping_address: { province: "Kano" },
    });

    expect(result.calculated_amount).toBe(3000);
    expect(queryMock).toHaveBeenLastCalledWith(expect.any(String), ["_default"]);
  });

  it("throws when even the wildcard has no zone configured", async () => {
    queryMock.mockResolvedValueOnce(noRows).mockResolvedValueOnce(noRows);
    const service = buildService();

    await expect(
      service.calculatePrice({}, {}, { shipping_address: { province: "Kano" } }),
    ).rejects.toThrow(/No delivery zone configured for state: Kano/);
  });

  it("throws when shipping_address.province is missing, without querying the DB", async () => {
    const service = buildService();

    await expect(
      service.calculatePrice({}, {}, { shipping_address: {} }),
    ).rejects.toThrow(/requires shipping_address\.province/);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("DeliveryZonesFulfillmentProviderService fulfillment lifecycle (no courier API integration in P1)", () => {
  it("createFulfillment passes the input data through unchanged with no labels", async () => {
    const service = buildService();
    const data = { option_id: "eshor-flat-rate", note: "leave at gate" };

    const result = await service.createFulfillment(data, [], undefined);

    expect(result).toEqual({ data, labels: [] });
  });

  it("cancelFulfillment is a no-op that resolves to an empty object", async () => {
    const service = buildService();
    await expect(service.cancelFulfillment()).resolves.toEqual({});
  });

  it("createReturnFulfillment passes the input fulfillment through unchanged with no labels", async () => {
    const service = buildService();
    const fulfillment = { id: "ful_123" };

    const result = await service.createReturnFulfillment(fulfillment);

    expect(result).toEqual({ data: fulfillment, labels: [] });
  });
});

describe("DeliveryZonesFulfillmentProviderService static behavior", () => {
  it("exposes exactly one flat-rate fulfillment option", async () => {
    const service = buildService();
    await expect(service.getFulfillmentOptions()).resolves.toEqual([
      { id: "eshor-flat-rate", name: "Standard delivery" },
    ]);
  });

  it("canCalculate and validateOption are always true (no per-option config to validate)", async () => {
    const service = buildService();
    await expect(service.canCalculate()).resolves.toBe(true);
    await expect(service.validateOption()).resolves.toBe(true);
  });

  it("validateFulfillmentData passes data through unchanged", async () => {
    const service = buildService();
    const data = { anything: "goes" };
    await expect(service.validateFulfillmentData({}, data)).resolves.toBe(data);
  });
});
