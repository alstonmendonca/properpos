# ProperPOS Gateway Service Dockerfile
FROM node:20-alpine AS base

# Install tini for proper signal handling and curl for health checks
RUN apk add --no-cache tini curl

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy shared packages first
COPY shared ./shared

# Copy gateway service package files
COPY services/gateway/package*.json ./services/gateway/

# Install dependencies (production only)
WORKDIR /app/shared/backend-shared
RUN npm install --omit=dev

WORKDIR /app/services/gateway
RUN npm install --omit=dev

# Build stage
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/shared ./shared
COPY --from=deps /app/services/gateway/node_modules ./services/gateway/node_modules
COPY services/gateway ./services/gateway

# Install dev dependencies for building
WORKDIR /app/shared/backend-shared
RUN npm install
RUN npm run build

WORKDIR /app/services/gateway
RUN npm install
RUN npm run build

# Production stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodeuser

# Copy built application
COPY --from=builder /app/shared/backend-shared/dist ./shared/backend-shared/dist
COPY --from=builder /app/shared/backend-shared/package.json ./shared/backend-shared/
COPY --from=builder /app/services/gateway/dist ./services/gateway/dist
COPY --from=builder /app/services/gateway/package.json ./services/gateway/
COPY --from=deps /app/services/gateway/node_modules ./services/gateway/node_modules

# Set ownership
RUN chown -R nodeuser:nodejs /app

USER nodeuser

WORKDIR /app/services/gateway

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Use tini as init process for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start the application
CMD ["node", "dist/index.js"]
