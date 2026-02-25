# ProperPOS Notification Service Dockerfile
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy shared packages first
COPY shared ./shared

# Copy notification service package files
COPY services/notification/package*.json ./services/notification/

# Install dependencies
WORKDIR /app/shared/backend-shared
RUN npm install

WORKDIR /app/services/notification
RUN npm install

# Build stage
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/shared ./shared
COPY --from=deps /app/services/notification/node_modules ./services/notification/node_modules
COPY services/notification ./services/notification

WORKDIR /app/shared/backend-shared
RUN npm run build

WORKDIR /app/services/notification
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
COPY --from=builder /app/services/notification/dist ./services/notification/dist
COPY --from=builder /app/services/notification/package.json ./services/notification/
COPY --from=builder /app/services/notification/node_modules ./services/notification/node_modules

USER nodeuser

WORKDIR /app/services/notification

EXPOSE 3008

CMD ["node", "dist/index.js"]
