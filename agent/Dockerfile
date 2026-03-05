# ── Stage 1: Build the reporter sidecar ──
FROM node:22-slim AS builder

WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src/ ./src/
RUN npm run build

# ── Stage 2: Runtime ──
# Use a newer glibc runtime so prebuilt ZeroClaw binaries can start.
FROM debian:trixie-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates nodejs git openssh-client jq \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
         | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
         > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends gh \
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

# Copy built reporter and install production deps fresh for the runtime node version
COPY --from=builder /app/dist ./dist
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts

ENV NODE_ENV=production
ENV ZEROCLAW_BIN=/usr/local/bin/zeroclaw
ENV ZEROCLAW_WORKSPACE=/app/workspace

CMD ["node", "dist/main.js"]
