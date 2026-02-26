# ProperPOS Auth Service Dockerfile
FROM node:20-alpine AS base

# Install curl for health checks
RUN apk add --no-cache curl

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy shared packages first
COPY shared ./shared

# Copy auth service package files
COPY services/auth/package*.json ./services/auth/

# Install dependencies
WORKDIR /app/shared/backend-shared
RUN npm install

WORKDIR /app/services/auth
RUN npm install

# Build stage
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/shared ./shared
COPY --from=deps /app/services/auth/node_modules ./services/auth/node_modules
COPY services/auth ./services/auth

WORKDIR /app/shared/backend-shared
RUN npm run build

WORKDIR /app/services/auth
RUN npm run build

# Production stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodeuser

# Copy built application
COPY --from=builder /app/shared/backend-shared/dist ./shared/backend-shared/dist
COPY --from=builder /app/shared/backend-shared/package.json ./shared/backend-shared/
COPY --from=builder /app/services/auth/dist ./services/auth/dist
COPY --from=builder /app/services/auth/package.json ./services/auth/
COPY --from=builder /app/services/auth/node_modules ./services/auth/node_modules

USER nodeuser

WORKDIR /app/services/auth

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
