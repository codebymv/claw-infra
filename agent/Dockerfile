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

# Railway CLI is now installed via npm in the builder stage

# Install ZeroClaw binary from GitHub releases
# NOTE: Update ZEROCLAW_VERSION to match your actual ZeroClaw release version
# Check available versions at: https://github.com/zeroclaw-labs/zeroclaw/releases
# For now, using latest as a fallback - update this in production!
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
    echo "Downloading ZeroClaw ${ZEROCLAW_VERSION} from $URL" && \
    curl -fsSL "$URL" -o /tmp/zeroclaw.tar.gz && \
    tar -xzf /tmp/zeroclaw.tar.gz -C /usr/local/bin/ && \
    chmod +x /usr/local/bin/zeroclaw && \
    rm /tmp/zeroclaw.tar.gz

# Create workspace directory
RUN mkdir -p /app/workspace /root/.zeroclaw

WORKDIR /app

# Copy built reporter and production node_modules from builder
# (debian:trixie-slim has nodejs but not npm, so we reuse the builder's node_modules)
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

# Symlink Railway CLI binary from local node_modules
RUN ln -s /app/node_modules/.bin/railway /usr/local/bin/railway

ENV NODE_ENV=production
ENV ZEROCLAW_BIN=/usr/local/bin/zeroclaw
ENV ZEROCLAW_WORKSPACE=/app/workspace

CMD ["node", "dist/main.js"]
