FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Verify the build output exists — this will show in Railway build logs
RUN echo "=== BUILD OUTPUT ===" && ls -la dist/ && echo "=== main.js check ===" && ls -la dist/main.js && echo "=== BUILD VERIFIED ==="

# Remove dev dependencies to keep image small
RUN npm prune --production && npm cache clean --force

# Verify dist survived the prune
RUN echo "=== POST-PRUNE CHECK ===" && ls -la dist/main.js && echo "=== DIST INTACT ==="

RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001
USER nestjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1)).on('error', () => process.exit(1))"

CMD ["node", "dist/main"]
