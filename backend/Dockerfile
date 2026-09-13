# ============================================================================
# Production Dockerfile for Miran NestJS Backend
# ============================================================================

FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma/
COPY scripts/migrate-and-start.cjs ./scripts/migrate-and-start.cjs
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist

RUN mkdir -p uploads

EXPOSE 3000

CMD ["node", "scripts/migrate-and-start.cjs"]
