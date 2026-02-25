# ProperPOS Audit Service Dockerfile
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy shared packages first
COPY shared ./shared

# Copy audit service package files
COPY services/audit/package*.json ./services/audit/

# Install dependencies
WORKDIR /app/shared/backend-shared
RUN npm install

WORKDIR /app/services/audit
RUN npm install

# Build stage
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/shared ./shared
COPY --from=deps /app/services/audit/node_modules ./services/audit/node_modules
COPY services/audit ./services/audit

WORKDIR /app/shared/backend-shared
RUN npm run build

WORKDIR /app/services/audit
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
COPY --from=builder /app/services/audit/dist ./services/audit/dist
COPY --from=builder /app/services/audit/package.json ./services/audit/
COPY --from=builder /app/services/audit/node_modules ./services/audit/node_modules

USER nodeuser

WORKDIR /app/services/audit

EXPOSE 3009

CMD ["node", "dist/index.js"]
