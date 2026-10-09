FROM node:20-alpine AS base

# 1. Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat git

WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json ./
RUN  npm install

# 2. Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Public browser endpoints are embedded by Next.js at build time.
# Compose supplies localhost values for local development; production builds
# must pass the real public HTTPS endpoint URLs as build args.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ARG NEXT_PUBLIC_POCKETBASE_URL=http://localhost:8090
ARG NEXT_PUBLIC_PROXY_URL=http://localhost:4040
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_POCKETBASE_URL=$NEXT_PUBLIC_POCKETBASE_URL
ENV NEXT_PUBLIC_PROXY_URL=$NEXT_PUBLIC_PROXY_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production

RUN npm run build

# 3. Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

LABEL org.opencontainers.image.title="7xAnime" \
  org.opencontainers.image.description="7xAnime web app" \
  org.opencontainers.image.source="https://github.com/RahulExe69/7xAnime"

RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone/ ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static/ ./.next/static/

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
