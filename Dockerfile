ARG NODE_IMAGE=node:24-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d

FROM ${NODE_IMAGE} AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@11.14.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY tsconfig.build.json tsconfig.json jest.config.cjs ./
COPY src ./src
COPY mcp.json README.md LICENSE CHANGELOG.md ./

RUN pnpm install --frozen-lockfile
RUN pnpm run build
RUN pnpm prune --prod --ignore-scripts \
    && rm -rf /root/.cache/node/corepack /pnpm/store

FROM ${NODE_IMAGE} AS runtime

WORKDIR /app
ENV NODE_ENV=production

RUN rm -rf \
    /usr/local/lib/node_modules/npm \
    /usr/local/lib/node_modules/corepack \
    /opt/yarn-v* \
    /root/.cache/node/corepack \
    && rm -f \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/bin/corepack \
    /usr/local/bin/pnpm \
    /usr/local/bin/pnpx \
    /usr/local/bin/yarn \
    /usr/local/bin/yarnpkg

COPY package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/mcp.json ./mcp.json
COPY --from=builder /app/README.md ./README.md
COPY --from=builder /app/LICENSE ./LICENSE
COPY --from=builder /app/CHANGELOG.md ./CHANGELOG.md

RUN mkdir -p /data && chown -R node:node /data /app

ENV HEALTH_MONITOR_DB=/data/health.db
ENV HOST=127.0.0.1
ENV PORT=3000

USER node

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "const http=require('node:http'); const host=process.env.HOST || '127.0.0.1'; const port=process.env.PORT || '3000'; http.get({host, port, path:'/health'}, res => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

EXPOSE 3000

CMD ["node", "dist/server-http.js"]
