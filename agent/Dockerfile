# ── Stage 1: Build the reporter sidecar ──
FROM node:20-slim AS builder

WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src/ ./src/
RUN npm run build

# ── Stage 2: Runtime ──
FROM node:20-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install ZeroClaw binary from GitHub releases
ARG ZEROCLAW_VERSION=latest
RUN ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "amd64" ]; then TARGET="x86_64-unknown-linux-gnu"; \
    elif [ "$ARCH" = "arm64" ]; then TARGET="aarch64-unknown-linux-gnu"; \
    else echo "Unsupported arch: $ARCH" && exit 1; fi && \
    if [ "$ZEROCLAW_VERSION" = "latest" ]; then \
      URL="https://github.com/zeroclaw-labs/zeroclaw/releases/latest/download/zeroclaw-${TARGET}.tar.gz"; \
    else \
      URL="https://github.com/zeroclaw-labs/zeroclaw/releases/download/${ZEROCLAW_VERSION}/zeroclaw-${TARGET}.tar.gz"; \
    fi && \
    echo "Downloading ZeroClaw from $URL" && \
    curl -fsSL "$URL" -o /tmp/zeroclaw.tar.gz && \
    tar -xzf /tmp/zeroclaw.tar.gz -C /usr/local/bin/ && \
    chmod +x /usr/local/bin/zeroclaw && \
    rm /tmp/zeroclaw.tar.gz

# Create workspace directory
RUN mkdir -p /app/workspace /root/.zeroclaw

WORKDIR /app

# Copy built reporter
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

ENV NODE_ENV=production
ENV ZEROCLAW_BIN=/usr/local/bin/zeroclaw
ENV ZEROCLAW_WORKSPACE=/app/workspace

CMD ["node", "dist/main.js"]
