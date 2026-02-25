# ProperPOS Tenant Service Dockerfile
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY shared ./shared
COPY services/tenant/package*.json ./services/tenant/
WORKDIR /app/shared/backend-shared
RUN npm install
WORKDIR /app/services/tenant
RUN npm install

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/shared ./shared
COPY --from=deps /app/services/tenant/node_modules ./services/tenant/node_modules
COPY services/tenant ./services/tenant
WORKDIR /app/shared/backend-shared
RUN npm run build
WORKDIR /app/services/tenant
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodeuser
COPY --from=builder /app/shared/backend-shared/dist ./shared/backend-shared/dist
COPY --from=builder /app/shared/backend-shared/package.json ./shared/backend-shared/
COPY --from=builder /app/services/tenant/dist ./services/tenant/dist
COPY --from=builder /app/services/tenant/package.json ./services/tenant/
COPY --from=builder /app/services/tenant/node_modules ./services/tenant/node_modules
USER nodeuser
WORKDIR /app/services/tenant
EXPOSE 3002
CMD ["node", "dist/index.js"]
