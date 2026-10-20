# syntax=docker/dockerfile:1
# Ghotok admin panel: a static Vite build served by nginx, which also forwards
# /api to the API so the auth cookies stay first-party. Build from the repository root:
#   docker build -f admin/Dockerfile --build-arg VITE_WEBSITE_URL=https://ghotok.com.bd -t ghotok-admin .

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY ui/package.json ui/
COPY server/package.json server/
COPY web/package.json web/
COPY admin/package.json admin/
RUN npm ci --workspace admin --ignore-scripts
COPY shared ./shared
COPY ui ./ui
COPY admin ./admin
ARG VITE_WEBSITE_URL=http://localhost:3000
ARG VITE_BASE=/
ENV VITE_WEBSITE_URL=$VITE_WEBSITE_URL VITE_BASE=$VITE_BASE
RUN npm run build -w admin

FROM nginx:1.27-alpine
# The official image renders templates/*.template with environment variables at start-up.
ENV API_UPSTREAM=http://api:4000
COPY admin/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/admin/dist /usr/share/nginx/html
EXPOSE 80
