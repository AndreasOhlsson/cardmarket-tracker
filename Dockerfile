# ── Stage 1: Build ──
FROM node:22-alpine AS build

RUN corepack enable

WORKDIR /app

# Install root dependencies
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Install web dependencies
COPY web/package.json web/yarn.lock web/
RUN cd web && yarn install --frozen-lockfile

# Copy source and build everything
COPY . .
ARG VITE_WATCHLIST_TOKEN=""
RUN VITE_WATCHLIST_TOKEN=$VITE_WATCHLIST_TOKEN yarn build:all

# ── Stage 2: Runtime ──
FROM node:22-alpine

RUN apk add --no-cache python3 make g++

RUN corepack enable

WORKDIR /app

# Install production deps only (no tsx needed — server is pre-compiled)
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production && \
    npm rebuild better-sqlite3 && \
    apk del python3 make g++

# Copy compiled backend + frontend
COPY --from=build /app/dist ./dist
COPY --from=build /app/web/dist ./web/dist

# Data directory for SQLite (mounted as Fly volume)
RUN mkdir -p /data

ENV NODE_ENV=production
ENV DB_PATH=/data/tracker.db
ENV PORT=3001

EXPOSE 3001

CMD ["node", "dist/server/api.js"]
