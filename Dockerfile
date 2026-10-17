# Three stages. `docker build --target test .` runs the specs; the default target builds the client with Node, then
# serves it with an unprivileged nginx on port 8080 that forwards /api/ to the API.

# The specs: the literal-text check, then every spec in headless Chromium. The Playwright image of the pinned playwright
# version holds Node and its Chromium build, so the host needs only Docker. The default target never builds this stage.
FROM mcr.microsoft.com/playwright:v1.64.1-noble AS test
WORKDIR /app
ENV CI=true \
    NG_CLI_ANALYTICS=false \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY angular.json tsconfig.json tsconfig.app.json tsconfig.spec.json ./
COPY scripts ./scripts
COPY public ./public
COPY src ./src
RUN npm test

FROM node:24.21.0-bookworm-slim AS build
WORKDIR /app
ENV NG_CLI_ANALYTICS=false \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY angular.json tsconfig.json tsconfig.app.json ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.30.6-alpine
# The API address is read when the container starts, never compiled into the bundle.
ENV API_UPSTREAM=http://host.docker.internal:8080
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist/orderflow-engine-web/browser /usr/share/nginx/html
EXPOSE 8080
