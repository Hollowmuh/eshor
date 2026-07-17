import { HttpTypes } from "@medusajs/types"

/**
 * Layer 3 PLP §3 / feature spec E2 AC1: sizes visible on the card so a
 * shopper never taps into a dead end when stock is thin (the norm for
 * small-batch Nigerian production, per L2). Stock logic mirrors
 * ProductActions' inStock check exactly -- a variant with
 * manage_inventory:false or allow_backorder:true always counts as
 * available, otherwise inventory_quantity > 0 decides it.
 */
function variantIsInStock(variant: HttpTypes.StoreProductVariant): boolean {
  if (!variant.manage_inventory) return true
  if (variant.allow_backorder) return true
  return (variant.inventory_quantity ?? 0) > 0
}

export function computeSizeAvailability(
  product: HttpTypes.StoreProduct
): { size: string; inStock: boolean }[] {
  const sizeOption = product.options?.find((o) => o.title?.toLowerCase() === "size")
  if (!sizeOption) return []

  const bySize = new Map<string, boolean>()
  for (const value of sizeOption.values ?? []) {
    bySize.set(value.value, false)
  }

  for (const variant of product.variants ?? []) {
    const sizeOpt = variant.options?.find((o) => o.option_id === sizeOption.id)
    if (!sizeOpt) continue
    if (variantIsInStock(variant)) {
      bySize.set(sizeOpt.value, true)
    }
  }

  // preserve the option's own declared order (S, M, L, XL), not insertion order
  return (sizeOption.values ?? []).map((v) => ({
    size: v.value,
    inStock: bySize.get(v.value) ?? false,
  }))
}

export default function SizeBadges({ product }: { product: HttpTypes.StoreProduct }) {
  const sizes = computeSizeAvailability(product)
  if (sizes.length === 0) return null

  return (
    <div className="flex flex-wrap gap-x-1.5 mt-1.5" data-testid="product-size-badges">
      {sizes.map(({ size, inStock }) => (
        <span
          key={size}
          className={
            inStock
              ? "text-[11px] leading-none px-1.5 py-1 border border-ui-border-base rounded text-ui-fg-base"
              : "text-[11px] leading-none px-1.5 py-1 border border-ui-border-base rounded text-ui-fg-muted line-through"
          }
          data-testid={inStock ? "size-in-stock" : "size-sold-out"}
        >
          {size}
        </span>
      ))}
    </div>
  )
}

/** All sizes sold out -- used by the PLP to sink these cards to the bottom. */
export function isFullySoldOut(product: HttpTypes.StoreProduct): boolean {
  const sizes = computeSizeAvailability(product)
  return sizes.length > 0 && sizes.every((s) => !s.inStock)
}
