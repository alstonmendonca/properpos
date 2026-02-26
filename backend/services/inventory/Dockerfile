# ProperPOS Inventory Service Dockerfile
FROM node:20-alpine AS base

# Install curl for health checks
RUN apk add --no-cache curl

FROM base AS deps
WORKDIR /app
COPY shared ./shared
COPY services/inventory/package*.json ./services/inventory/
WORKDIR /app/shared/backend-shared
RUN npm install
WORKDIR /app/services/inventory
RUN npm install

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/shared ./shared
COPY --from=deps /app/services/inventory/node_modules ./services/inventory/node_modules
COPY services/inventory ./services/inventory
WORKDIR /app/shared/backend-shared
RUN npm run build
WORKDIR /app/services/inventory
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodeuser
COPY --from=builder /app/shared/backend-shared/dist ./shared/backend-shared/dist
COPY --from=builder /app/shared/backend-shared/package.json ./shared/backend-shared/
COPY --from=builder /app/services/inventory/dist ./services/inventory/dist
COPY --from=builder /app/services/inventory/package.json ./services/inventory/
COPY --from=builder /app/services/inventory/node_modules ./services/inventory/node_modules
USER nodeuser
WORKDIR /app/services/inventory
EXPOSE 3004

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3004/health || exit 1

CMD ["node", "dist/index.js"]
