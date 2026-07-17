import { getProductFit } from "@lib/data/fit"

const FIT_LABEL: Record<string, string> = {
  runs_small: "Runs small",
  true_to_size: "True to size",
  runs_large: "Runs large",
}

const DIMENSION_ORDER = ["bust", "waist", "hip", "length", "inseam"]

/**
 * Layer 3 PDP §4 fit trio, server-rendered (EC2.2: PDP must be fully
 * server-rendered, no client-JS dependency to see the size guide). Renders
 * nothing (not an error state) when a product has no fit data yet --
 * older/incomplete products degrade gracefully rather than breaking the
 * page.
 */
export default async function ProductFitPanel({ productId }: { productId: string }) {
  const data = await getProductFit(productId)
  if (!data || !data.fit) return null

  const { fit, measurements } = data

  const sizes = Array.from(new Set(measurements.map((m) => m.size)))
  const dimensions = Array.from(new Set(measurements.map((m) => m.dimension))).sort(
    (a, b) => DIMENSION_ORDER.indexOf(a) - DIMENSION_ORDER.indexOf(b)
  )
  const valueFor = (size: string, dimension: string) =>
    measurements.find((m) => m.size === size && m.dimension === dimension)?.value_cm

  return (
    <div
      className="flex flex-col gap-y-2 border-t border-gray-200 pt-4 mt-2"
      data-testid="product-fit-panel"
    >
      {fit.model_height_cm && fit.model_size_worn && (
        <p className="text-small-regular text-ui-fg-subtle" data-testid="model-reference-line">
          Model is {fit.model_height_cm}cm, wears size {fit.model_size_worn}
        </p>
      )}

      {fit.fit_descriptor && (
        <p className="text-small-regular" data-testid="fit-descriptor">
          Fit: <span className="font-semibold">{FIT_LABEL[fit.fit_descriptor]}</span>
          {fit.sample_size >= 5 && fit.true_to_size_pct != null && (
            <span className="text-ui-fg-subtle">
              {" "}
              &middot; {Math.round(fit.true_to_size_pct)}% of {fit.sample_size} reviewers say true
              to size
            </span>
          )}
        </p>
      )}

      {sizes.length > 0 && dimensions.length > 0 && (
        <details className="mt-2" data-testid="size-guide-sheet">
          <summary className="cursor-pointer text-small-regular underline">
            Size guide — garment measurements
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-small-regular border-collapse">
              <thead>
                <tr>
                  <th className="text-left py-1 pr-4 text-ui-fg-subtle font-normal">cm</th>
                  {sizes.map((size) => (
                    <th key={size} className="text-left py-1 pr-4 font-semibold">
                      {size}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dimensions.map((dimension) => (
                  <tr key={dimension} className="border-t border-gray-100">
                    <td className="py-1 pr-4 text-ui-fg-subtle capitalize">{dimension}</td>
                    {sizes.map((size) => (
                      <td key={size} className="py-1 pr-4">
                        {valueFor(size, dimension) ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-small-regular text-ui-fg-subtle mt-2">
              Lay your best-fitting garment flat and compare to the measurements above.
            </p>
          </div>
        </details>
      )}
    </div>
  )
}
