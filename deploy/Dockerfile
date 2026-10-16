FROM node:24.21.0-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@11.25.0 --registry=https://registry.npmmirror.com
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig*.json vitest.config.ts ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile && pnpm build

FROM node:24.21.0-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV STATIC_DIR=/app/public
WORKDIR /app
RUN groupadd --system ravens && useradd --system --gid ravens ravens
COPY --from=build --chown=ravens:ravens /app/apps/server/dist ./dist
COPY --from=build --chown=ravens:ravens /app/apps/web/dist ./public
USER ravens
EXPOSE 3000
CMD ["node", "dist/index.cjs"]
