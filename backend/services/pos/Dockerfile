# ProperPOS POS Service Dockerfile
FROM node:20-alpine AS base
RUN apk add --no-cache tini curl

# Stage 1: Build @properpos/shared types package
FROM base AS shared-build
WORKDIR /build
COPY shared/package.json shared/tsconfig.json ./
COPY shared/src ./src
RUN npm install && npm run build

# Stage 2: Build @properpos/backend-shared
FROM base AS backend-shared-build
WORKDIR /build/shared
COPY --from=shared-build /build ./
WORKDIR /build/backend-shared
COPY backend/shared/package.json backend/shared/tsconfig.json ./
COPY backend/shared/src ./src
RUN sed -i 's/"@properpos\/shared": "\*"/"@properpos\/shared": "file:..\/shared"/' package.json \
    && npm install && npm run build

# Stage 3: Build service
FROM base AS service-build
WORKDIR /build/shared
COPY --from=shared-build /build ./
WORKDIR /build/backend-shared
COPY --from=backend-shared-build /build/backend-shared ./
WORKDIR /build/service
COPY backend/services/pos/package*.json ./
COPY backend/services/pos/tsconfig.json ./
COPY backend/services/pos/src ./src
RUN sed -i 's/"@properpos\/backend-shared": "\*"/"@properpos\/backend-shared": "file:..\/backend-shared"/' package.json \
    && npm install && npm run build

# Production
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nodeuser
COPY --from=service-build /build/service/dist ./dist
COPY --from=service-build /build/service/package.json ./
COPY --from=service-build /build/service/node_modules ./node_modules
RUN chown -R nodeuser:nodejs /app
USER nodeuser
EXPOSE 3003
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3003/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
