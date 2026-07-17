import { Metadata } from "next"

import InteractiveLink from "@modules/common/components/interactive-link"

export const metadata: Metadata = {
  title: "Product not available",
  description: "This product is no longer available",
}

/**
 * Feature spec EC2.5: a direct link to an archived/unpublished product
 * (an old IG post, a shared link) must never be a pure dead end. This
 * route-scoped not-found boundary overrides the generic site-wide one
 * specifically for /products/:handle, offering "shop the collection"
 * instead of just "go home".
 *
 * A true HTTP 410 (vs 404) status was considered and descoped: Next.js
 * App Router page components can't emit a non-404 status from
 * notFound(), and distinguishing "never existed" from "archived" would
 * require middleware to duplicate the product lookup on every single
 * PDP request just to catch a rare edge case (old shared links) --  not
 * a good trade against the PDP perf budget (hardening §7 order). The
 * user-facing "never a dead end" requirement is still met.
 */
export default function ProductNotFound() {
  return (
    <div className="flex flex-col gap-4 items-center justify-center min-h-[calc(100vh-64px)]">
      <h1 className="text-2xl-semi text-ui-fg-base">This item isn&apos;t available</h1>
      <p className="text-small-regular text-ui-fg-base max-w-md text-center">
        It may have sold out or been part of a past drop. Take a look at what&apos;s
        in the shop now.
      </p>
      <InteractiveLink href="/store">See similar products</InteractiveLink>
    </div>
  )
}
