FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig*.json vitest.config.ts ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile && pnpm build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S ravens && adduser -S ravens -G ravens
COPY --from=build --chown=ravens:ravens /app/apps/server/dist ./dist
USER ravens
EXPOSE 3000
CMD ["node", "dist/index.js"]
