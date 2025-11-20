FROM node:20-slim AS base
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install dependencies
FROM node:20-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci

# Build Next.js (standalone output)
FROM node:20-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG GOOGLE_CALENDAR_MCP_URL="http://localhost"
ENV GOOGLE_CALENDAR_MCP_URL=$GOOGLE_CALENDAR_MCP_URL
RUN npm run build
ARG GOOGLE_CALENDAR_MCP_ESBUILD_VERSION=0.25.12
RUN rm -rf external/google-calendar-mcp/node_modules \
  && cd external/google-calendar-mcp \
  && npm install "esbuild@${GOOGLE_CALENDAR_MCP_ESBUILD_VERSION}" --package-lock-only \
  && npm ci \
  && npm run build

# Runtime image
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Create non-root user with writable home for npm cache
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --home /home/nextjs nextjs \
  && mkdir -p /home/nextjs \
  && chown -R nextjs:nodejs /home/nextjs

# Copy the minimal standalone build
COPY --from=builder /app/public ./public
COPY --from=builder /app/config ./config
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/external ./external

# Prepare upload directory (default: IMAGE_UPLOAD_DIR=./var/uploads/images)
RUN mkdir -p /app/var/uploads/images && \
  chown -R nextjs:nodejs /app/var && \
  chown -R nextjs:nodejs /app/external

ENV HOME=/home/nextjs

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
