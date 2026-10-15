FROM node:24.16.0-bookworm-slim AS dependencies
WORKDIR /app
RUN corepack enable
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack prepare pnpm@10.26.0 --activate
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
RUN --mount=type=cache,id=finance-tracker-pnpm,target=/root/.local/share/pnpm/store pnpm fetch
COPY package.json ./
RUN --mount=type=cache,id=finance-tracker-pnpm,target=/root/.local/share/pnpm/store pnpm install --offline --frozen-lockfile

FROM dependencies AS development
RUN mkdir -p data .astro node_modules/.vite node_modules/.vite-temp node_modules/.astro && chown node:node /app data .astro node_modules/.vite node_modules/.vite-temp node_modules/.astro
USER node
ENV NODE_ENV=development DEPLOY_TARGET=node SQLITE_PATH=/app/data/finance.sqlite ASTRO_DEV_BACKGROUND=0
EXPOSE 4321
CMD ["sh", "-c", "node scripts/local-init.mjs && exec node node_modules/astro/bin/astro.mjs dev --host 0.0.0.0 --port 4321"]

FROM dependencies AS production-dependencies
RUN pnpm prune --prod

FROM dependencies AS build
COPY astro.config.ts tsconfig.json wrangler.toml sentry.server.config.ts sentry.client.config.js ./
COPY src ./src
COPY public ./public
ENV DEPLOY_TARGET=node
RUN pnpm build

FROM node:24.16.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321 SQLITE_PATH=/app/data/finance.sqlite
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
COPY migrations-v2 ./migrations-v2
COPY scripts/local-init.mjs ./scripts/local-init.mjs
RUN mkdir data && chown node:node data
USER node
EXPOSE 4321
CMD ["sh", "-c", "node scripts/local-init.mjs && exec node dist/server/entry.mjs"]
