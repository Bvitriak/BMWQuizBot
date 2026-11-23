FROM node:26-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1 AS base
RUN npm install --global --ignore-scripts --no-audit --no-fund pnpm@10.34.9 \
    && install -d -o node -g node /app
WORKDIR /app
USER node
COPY --chown=node:node package.json pnpm-lock.yaml .npmrc ./

FROM base AS dependencies
RUN pnpm install --frozen-lockfile

FROM dependencies AS tests
COPY --chown=node:node src ./src
COPY --chown=node:node tests ./tests
COPY --chown=node:node drizzle ./drizzle
COPY --chown=node:node config ./config
COPY --chown=node:node tsconfig.json eslint.config.mjs .prettierrc .prettierignore ./
CMD ["pnpm", "test:docker"]

FROM dependencies AS build
COPY --chown=node:node src ./src
COPY --chown=node:node tsconfig.json ./
COPY --chown=node:node config/tsconfig.build.json ./config/
RUN pnpm build

FROM base AS production-dependencies
RUN pnpm install --prod --frozen-lockfile

FROM node:26-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1 AS app
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle
USER node
CMD ["node", "dist/index.js"]
