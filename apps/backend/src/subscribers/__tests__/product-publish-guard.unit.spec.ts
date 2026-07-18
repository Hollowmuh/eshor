import { Modules } from "@medusajs/framework/utils";
import productPublishGuardHandler from "../product-publish-guard";

/**
 * Reactive publish guard (E1 AC2/AC3) -- the only thing standing between
 * a garment product with incomplete size measurements and being
 * customer-visible. Previously only "test-proven" via seed-demo.ts's
 * own one-off manual create->publish->assert-reverted->delete drill,
 * never as an automated regression test.
 */
function buildContainer(opts: {
  product: {
    id: string;
    status: string;
    type_id?: string | null;
    options?: Array<{ title: string; values?: Array<{ value: string }> }>;
  };
  problems: string[];
}) {
  const retrieveProduct = jest.fn().mockResolvedValue(opts.product);
  const updateProducts = jest.fn().mockResolvedValue(undefined);
  const checkPublishable = jest.fn().mockResolvedValue(opts.problems);
  const warn = jest.fn();
  const error = jest.fn();

  const container = {
    resolve: (key: string) => {
      if (key === Modules.PRODUCT) return { retrieveProduct, updateProducts };
      if (key === "garmentFit") return { checkPublishable };
      if (key === "logger") return { warn, error };
      throw new Error(`unexpected container.resolve key in test: ${key}`);
    },
  };
  return { container, retrieveProduct, updateProducts, checkPublishable, warn, error };
}

const sizeOption = { title: "Size", values: [{ value: "S" }, { value: "M" }] };

describe("product-publish-guard (product.updated)", () => {
  it("does nothing for a product that isn't published", async () => {
    const { container, updateProducts, checkPublishable } = buildContainer({
      product: { id: "prod_1", status: "draft", options: [sizeOption] },
      problems: [],
    });

    await productPublishGuardHandler({ event: { data: { id: "prod_1" } }, container } as any);

    expect(checkPublishable).not.toHaveBeenCalled();
    expect(updateProducts).not.toHaveBeenCalled();
  });

  it("warns and skips the check for a published product with no Size option", async () => {
    const { container, warn, checkPublishable, updateProducts } = buildContainer({
      product: { id: "prod_1", status: "published", options: [] },
      problems: [],
    });

    await productPublishGuardHandler({ event: { data: { id: "prod_1" } }, container } as any);

    expect(checkPublishable).not.toHaveBeenCalled();
    expect(updateProducts).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it("leaves a published product alone when garment measurements are complete", async () => {
    const { container, updateProducts, checkPublishable } = buildContainer({
      product: { id: "prod_1", status: "published", options: [sizeOption] },
      problems: [],
    });

    await productPublishGuardHandler({ event: { data: { id: "prod_1" } }, container } as any);

    expect(checkPublishable).toHaveBeenCalledWith({
      productId: "prod_1",
      sizes: ["S", "M"],
      requiredDimensions: ["bust", "waist", "length"],
    });
    expect(updateProducts).not.toHaveBeenCalled();
  });

  it("reverts an incomplete published product back to draft and logs the specific problems", async () => {
    const { container, updateProducts, error } = buildContainer({
      product: { id: "prod_1", status: "published", options: [sizeOption] },
      problems: ["missing measurement: size=M dimension=bust"],
    });

    await productPublishGuardHandler({ event: { data: { id: "prod_1" } }, container } as any);

    expect(updateProducts).toHaveBeenCalledWith("prod_1", { status: "draft" });
    expect(error).toHaveBeenCalled();
  });
});
