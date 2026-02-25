# ProperPOS Analytics Service Dockerfile
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY shared ./shared
COPY services/analytics/package*.json ./services/analytics/
WORKDIR /app/shared/backend-shared
RUN npm install
WORKDIR /app/services/analytics
RUN npm install

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/shared ./shared
COPY --from=deps /app/services/analytics/node_modules ./services/analytics/node_modules
COPY services/analytics ./services/analytics
WORKDIR /app/shared/backend-shared
RUN npm run build
WORKDIR /app/services/analytics
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodeuser
COPY --from=builder /app/shared/backend-shared/dist ./shared/backend-shared/dist
COPY --from=builder /app/shared/backend-shared/package.json ./shared/backend-shared/
COPY --from=builder /app/services/analytics/dist ./services/analytics/dist
COPY --from=builder /app/services/analytics/package.json ./services/analytics/
COPY --from=builder /app/services/analytics/node_modules ./services/analytics/node_modules
USER nodeuser
WORKDIR /app/services/analytics
EXPOSE 3005
CMD ["node", "dist/index.js"]
