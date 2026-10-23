# Multi-stage build. Targets:
#   server — Node.js API + WebSocket game server
#   web    — Caddy serving the web build and reverse-proxying /api and /ws (automatic HTTPS)
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/desktop/package.json apps/desktop/
RUN pnpm install --frozen-lockfile --filter "@casino/server..." --filter "@casino/web..."
COPY packages packages
COPY apps/server apps/server
COPY apps/web apps/web
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter @casino/server build && pnpm --filter @casino/web build
RUN pnpm --filter @casino/server deploy --legacy --prod /out/server \
  && cp -r apps/server/dist apps/server/drizzle /out/server/

FROM node:22-alpine AS server
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/server ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "dist/index.js"]

FROM caddy:2.10-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
