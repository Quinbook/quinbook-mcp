# quinbook-mcp — remote HTTP connector (Anthropic Connectors Directory)
# Multi-stage: build the TypeScript, then ship only dist + production deps.
# keytar's native build is skipped (--ignore-scripts): keytar is only used by
# the local stdio connector and is lazily imported, never on the remote path.

# ---- builder ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8787
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=builder /app/dist ./dist
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/healthz >/dev/null 2>&1 || exit 1
USER node
CMD ["node", "dist/server-http.js"]
