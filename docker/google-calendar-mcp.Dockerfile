# Build stage (install deps + build TS)
FROM node:20-slim AS builder
WORKDIR /app
ENV NODE_ENV=development
COPY external/google-calendar-mcp/package*.json ./
RUN npm ci
COPY external/google-calendar-mcp/ ./
RUN npm run build
RUN npm prune --omit=dev

# Runtime image
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app ./
COPY scripts/google-calendar-mcp-entrypoint.sh /usr/local/bin/google-calendar-mcp-entrypoint.sh
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --home /home/nodejs nodejs \
  && chmod +x /usr/local/bin/google-calendar-mcp-entrypoint.sh \
  && mkdir -p /home/nodejs/.config \
  && chown -R nodejs:nodejs /home/nodejs
USER nodejs
ENV XDG_CONFIG_HOME=/home/nodejs/.config
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/google-calendar-mcp-entrypoint.sh"]
