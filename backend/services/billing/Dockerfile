# ProperPOS Billing Service Dockerfile
FROM node:20-alpine AS base

# Install curl for health checks
RUN apk add --no-cache curl

FROM base AS deps
WORKDIR /app
COPY shared ./shared
COPY services/billing/package*.json ./services/billing/
WORKDIR /app/shared/backend-shared
RUN npm install
WORKDIR /app/services/billing
RUN npm install

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/shared ./shared
COPY --from=deps /app/services/billing/node_modules ./services/billing/node_modules
COPY services/billing ./services/billing
WORKDIR /app/shared/backend-shared
RUN npm run build
WORKDIR /app/services/billing
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodeuser
COPY --from=builder /app/shared/backend-shared/dist ./shared/backend-shared/dist
COPY --from=builder /app/shared/backend-shared/package.json ./shared/backend-shared/
COPY --from=builder /app/services/billing/dist ./services/billing/dist
COPY --from=builder /app/services/billing/package.json ./services/billing/
COPY --from=builder /app/services/billing/node_modules ./services/billing/node_modules
USER nodeuser
WORKDIR /app/services/billing
EXPOSE 3006

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3006/health || exit 1

CMD ["node", "dist/index.js"]
