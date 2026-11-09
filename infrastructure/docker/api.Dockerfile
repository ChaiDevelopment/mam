# syntax=docker/dockerfile:1.7
# MAM! API — multi-stage build from the monorepo root.
FROM node:22-bookworm-slim AS deps
WORKDIR /repo
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY packages/config/package.json packages/config/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/validation/package.json packages/validation/
COPY packages/api-client/package.json packages/api-client/
COPY packages/design-tokens/package.json packages/design-tokens/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/admin/package.json apps/admin/
RUN npm ci --workspace @mam/api --include-workspace-root --ignore-scripts

FROM deps AS build
COPY packages packages
COPY apps/api apps/api
RUN npm run build -w @mam/shared-types -w @mam/validation \
 && cd apps/api && npx prisma generate && npx nest build \
 && npx tsc prisma/seed.ts --outDir dist-seed --esModuleInterop --skipLibCheck --module commonjs --target es2022 --rootDir .
RUN npm prune --omit=dev --workspace @mam/api --include-workspace-root

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/apps/api
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /data/storage && chown -R node:node /data
COPY --from=build --chown=node:node /repo/node_modules /app/node_modules
COPY --from=build --chown=node:node /repo/packages /app/packages
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
COPY --from=build --chown=node:node /repo/apps/api/dist-seed ./dist-seed
COPY --from=build --chown=node:node /repo/apps/api/prisma ./prisma
COPY --from=build --chown=node:node /repo/apps/api/package.json ./package.json
USER node
EXPOSE 4000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
