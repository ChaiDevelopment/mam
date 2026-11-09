# syntax=docker/dockerfile:1.7
# Builds apps/web or apps/admin (ARG APP) as a Next.js standalone server.
ARG APP=web

FROM node:22-bookworm-slim AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/config/package.json packages/config/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/validation/package.json packages/validation/
COPY packages/api-client/package.json packages/api-client/
COPY packages/design-tokens/package.json packages/design-tokens/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/admin/package.json apps/admin/
ARG APP
RUN npm ci --workspace @mam/${APP} --include-workspace-root --ignore-scripts

FROM deps AS build
ARG APP
ARG NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=""
ARG NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID="DEMO_MAP_ID"
ARG NEXT_PUBLIC_SITE_URL="http://localhost:3000"
# Map tiles (OpenStreetMap-based provider): baked into the client bundle and the CSP at build time.
ARG NEXT_PUBLIC_MAP_TILE_URL="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
ARG NEXT_PUBLIC_MAP_TILE_ATTRIBUTION=""
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_MAP_TILE_URL=${NEXT_PUBLIC_MAP_TILE_URL} \
    NEXT_PUBLIC_MAP_TILE_ATTRIBUTION=${NEXT_PUBLIC_MAP_TILE_ATTRIBUTION} \
    NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=${NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY} \
    NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=${NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
COPY packages packages
COPY apps/${APP} apps/${APP}
RUN npm run build:packages && npm run build -w @mam/${APP}

FROM node:22-bookworm-slim AS runtime
ARG APP
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/${APP}/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/${APP}/.next/static ./apps/${APP}/.next/static
COPY --from=build --chown=node:node /repo/apps/${APP}/public ./apps/${APP}/public
USER node
ENV APP_DIR=apps/${APP}
CMD ["sh", "-c", "node ${APP_DIR}/server.js"]
