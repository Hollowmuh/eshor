# Runs from the MONOREPO ROOT build context (see docker-compose.prod.yml's
# `context: .` / `dockerfile: apps/backend/Dockerfile`), not from
# apps/backend/ alone -- @eshor/kernel is a pnpm workspace:* dependency,
# and Medusa's own build output (.medusa/server/package.json) still lists
# it as workspace:*, meaning even the BUILT server expects to run inside
# an installed pnpm workspace (symlinked node_modules), not as a
# standalone npm-installable package. Trying to extract a slim,
# dependency-pruned runtime image from .medusa/server alone would need to
# correctly re-resolve those workspace symlinks in isolation -- skipped
# for this first deploy (solo-operator scale, image size isn't the
# bottleneck) in favor of one image that builds and runs from the same
# fully-installed workspace.
FROM node:24-slim AS app

RUN corepack enable && corepack prepare pnpm@11.13.1 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/kernel/package.json packages/kernel/package.json
COPY packages/image-pipeline/package.json packages/image-pipeline/package.json
COPY apps/backend/package.json apps/backend/package.json
COPY apps/storefront/package.json apps/storefront/package.json

# Installs the whole workspace's deps (not --prod: medusa build needs
# @swc/core/typescript etc, which are devDependencies) so the lockfile's
# resolution is honored exactly as CI/local dev use it.
RUN pnpm install --frozen-lockfile

COPY packages/kernel packages/kernel
COPY apps/backend apps/backend

# --filter (not `cd apps/backend && pnpm run build`): apps/backend's own
# package.json pins `"packageManager": "npm@11.16.0"` (a real, documented
# gotcha -- corepack refuses to run pnpm from inside that directory,
# "This project is configured to use npm"). --filter from the workspace
# root uses root's own pnpm pin and still runs the script with apps/backend
# as its cwd (pnpm's normal --filter behavior), so Medusa sees the same
# working directory it would either way, without tripping corepack.
RUN pnpm --filter @eshor/backend run build

ENV NODE_ENV=production
EXPOSE 9000

CMD ["pnpm", "--filter", "@eshor/backend", "run", "start"]
