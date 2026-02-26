# ProperPOS POS Service Dockerfile
FROM node:20-alpine AS base

# Install curl for health checks
RUN apk add --no-cache curl

FROM base AS deps
WORKDIR /app
COPY shared ./shared
COPY services/pos/package*.json ./services/pos/
WORKDIR /app/shared/backend-shared
RUN npm install
WORKDIR /app/services/pos
RUN npm install

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/shared ./shared
COPY --from=deps /app/services/pos/node_modules ./services/pos/node_modules
COPY services/pos ./services/pos
WORKDIR /app/shared/backend-shared
RUN npm run build
WORKDIR /app/services/pos
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodeuser
COPY --from=builder /app/shared/backend-shared/dist ./shared/backend-shared/dist
COPY --from=builder /app/shared/backend-shared/package.json ./shared/backend-shared/
COPY --from=builder /app/services/pos/dist ./services/pos/dist
COPY --from=builder /app/services/pos/package.json ./services/pos/
COPY --from=builder /app/services/pos/node_modules ./services/pos/node_modules
USER nodeuser
WORKDIR /app/services/pos
EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3003/health || exit 1

CMD ["node", "dist/index.js"]
