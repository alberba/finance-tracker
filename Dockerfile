FROM node:24.16.0-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile
COPY . .
ENV DEPLOY_TARGET=node PUBLIC_SYNC_V2=true
RUN pnpm build
RUN pnpm prune --prod

FROM node:24.16.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321 SQLITE_PATH=/app/data/finance.sqlite
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations-v2 ./migrations-v2
COPY --from=build /app/scripts/local-init.mjs ./scripts/local-init.mjs
RUN mkdir data && chown node:node data
USER node
EXPOSE 4321
CMD ["sh", "-c", "node scripts/local-init.mjs && exec node dist/server/entry.mjs"]
