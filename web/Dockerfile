# syntax=docker/dockerfile:1
# Ghotok website (Next.js, standalone output). Build from the repository root:
#   docker build -f web/Dockerfile --build-arg NEXT_PUBLIC_SITE_URL=https://ghotok.com.bd -t ghotok-web .

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY ui/package.json ui/
COPY server/package.json server/
COPY web/package.json web/
COPY admin/package.json admin/
RUN npm ci --workspace web --ignore-scripts
COPY shared ./shared
COPY ui ./ui
COPY web ./web
# API_URL is where the Next.js server forwards /api; rewrites are fixed at build time.
ARG API_URL=http://api:4000
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_DEFAULT_LANG=en
ENV API_URL=$API_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_DEFAULT_LANG=$NEXT_PUBLIC_DEFAULT_LANG \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w web

FROM node:22-alpine
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/web/.next/standalone ./
COPY --from=build --chown=node:node /app/web/.next/static ./web/.next/static
USER node
EXPOSE 3000
CMD ["node", "web/server.js"]
