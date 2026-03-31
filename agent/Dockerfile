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

# Install ZeroClaw binary by building from source
# This is more reliable than downloading prebuilt binaries
ARG ZEROCLAW_VERSION=v0.1.9a
ARG GITHUB_TOKEN
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    pkg-config \
    libssl-dev \
    && curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y \
    && . ~/.cargo/env \
    && echo "Building ZeroClaw ${ZEROCLAW_VERSION} from source" \
    && git clone --depth 1 --branch ${ZEROCLAW_VERSION} \
       https://x-access-token:${GITHUB_TOKEN}@github.com/zeroclaw-labs/zeroclaw.git /tmp/zeroclaw \
    && cd /tmp/zeroclaw \
    && cargo build --release \
    && cp target/release/zeroclaw /usr/local/bin/zeroclaw \
    && chmod +x /usr/local/bin/zeroclaw \
    && cd / \
    && rm -rf /tmp/zeroclaw ~/.cargo \
    && apt-get remove -y build-essential pkg-config libssl-dev \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Create workspace directory
RUN mkdir -p /app/workspace /root/.zeroclaw

WORKDIR /app

# Copy built reporter and production node_modules from builder
# (debian:trixie-slim has nodejs but not npm, so we reuse the builder's node_modules)
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY project-manager.js ./
COPY projects ./
COPY projects.sh ./

# Make all scripts executable
RUN chmod +x project-manager.js projects projects.sh

# Create symlink so 'projects' command works
RUN ln -sf /app/projects.sh /usr/local/bin/projects

# Symlink Railway CLI binary from local node_modules
RUN ln -s /app/node_modules/.bin/railway /usr/local/bin/railway

ENV NODE_ENV=production
ENV ZEROCLAW_BIN=/usr/local/bin/zeroclaw
ENV ZEROCLAW_WORKSPACE=/app/workspace

CMD ["node", "dist/main.js"]
