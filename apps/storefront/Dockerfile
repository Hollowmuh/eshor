# Same shape as apps/backend/Dockerfile -- see that file's comment for
# the full rationale (monorepo root context, --filter instead of `cd
# apps/storefront` because that directory's own package.json pins npm
# as its packageManager and corepack refuses pnpm run directly inside
# it). Next.js-specific wrinkle: NEXT_PUBLIC_* vars are baked into the
# client bundle at BUILD time, not read at runtime, so they're declared
# as ARGs and exported to ENV before the build step, not just passed
# via docker-compose.prod.yml's `environment:` (which only affects the
# running container, too late for anything client-side).
FROM node:24-slim AS app

RUN corepack enable && corepack prepare pnpm@11.13.1 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/kernel/package.json packages/kernel/package.json
COPY packages/image-pipeline/package.json packages/image-pipeline/package.json
COPY apps/backend/package.json apps/backend/package.json
COPY apps/storefront/package.json apps/storefront/package.json

RUN pnpm install --frozen-lockfile

COPY apps/storefront apps/storefront

ARG NEXT_PUBLIC_MEDUSA_BACKEND_URL
ARG NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_DEFAULT_REGION
ARG NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY
ARG NEXT_PUBLIC_WHATSAPP_NUMBER
ENV NEXT_PUBLIC_MEDUSA_BACKEND_URL=${NEXT_PUBLIC_MEDUSA_BACKEND_URL} \
    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=${NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY} \
    NEXT_PUBLIC_DEFAULT_REGION=${NEXT_PUBLIC_DEFAULT_REGION} \
    NEXT_PUBLIC_BASE_URL=${NEXT_PUBLIC_BASE_URL} \
    NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=${NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY} \
    NEXT_PUBLIC_WHATSAPP_NUMBER=${NEXT_PUBLIC_WHATSAPP_NUMBER}

RUN pnpm --filter @eshor/storefront run build

ENV NODE_ENV=production
EXPOSE 8000

WORKDIR /workspace/apps/storefront
CMD ["npx", "next", "start", "-p", "8000"]
