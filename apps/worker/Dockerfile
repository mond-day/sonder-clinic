# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages ./packages
COPY apps/api/package.json ./apps/api/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN test -f packages/database/prisma/schema.prisma \
  && test -f packages/database/prisma/migrations/20260917120000_nibo_external_ids/migration.sql \
  && test -f packages/database/prisma/migrations/20260917130000_patient_calendar_event/migration.sql \
  && test -e packages/database/node_modules/prisma/build/index.js \
  && pnpm --filter @sonder/database generate \
  && pnpm --filter @sonder/database exec tsc -p tsconfig.bootstrap.json \
  && pnpm --filter @sonder/worker build \
  && test -f packages/database/dist/bootstrap.js

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ARG APP_VERSION=unknown
ENV APP_VERSION=$APP_VERSION
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --system --uid 10001 --create-home sonder
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/worker ./apps/worker
RUN test -f packages/database/prisma/migrations/20260917120000_nibo_external_ids/migration.sql \
  && test -f packages/database/prisma/migrations/20260917130000_patient_calendar_event/migration.sql \
  && test -e packages/database/node_modules/prisma/build/index.js \
  && test -f packages/database/dist/bootstrap.js
USER sonder
CMD ["node", "apps/worker/dist/main.js"]
