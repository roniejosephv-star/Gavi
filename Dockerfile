# Use official Node.js image
FROM node:20-slim AS builder

# Set working directory
WORKDIR /app

# Copy lockfiles and configurations
COPY package*.json ./
COPY tsconfig.json ./

# Copy package configurations for monorepo resolution
COPY packages/api/package.json ./packages/api/
COPY packages/console/package.json ./packages/console/
COPY packages/core/package.json ./packages/core/
COPY packages/math/package.json ./packages/math/

# Install dependencies
RUN npm ci

# Copy all source files
COPY packages/ ./packages/

# Build all packages (generates compiled JS in dist/ and Vite static build in packages/console/dist)
RUN npm run build

# --- Production runner image ---
FROM node:20-slim

WORKDIR /app

# Install runtime dependencies for SQLite (if any compiled ones, though sqlite3 npm package prebuilds usually work)
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy root configurations and built code
COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/api/dist ./packages/api/dist
COPY --from=builder /app/packages/api/package.json ./packages/api/package.json
COPY --from=builder /app/packages/console/dist ./packages/console/dist
COPY --from=builder /app/packages/console/package.json ./packages/console/package.json
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/core/package.json ./packages/core/package.json
COPY --from=builder /app/packages/math/dist ./packages/math/dist
COPY --from=builder /app/packages/math/package.json ./packages/math/package.json

# Expose port (Cloud Run sets PORT env variable at runtime)
ENV PORT=3001
EXPOSE 3001

# Start the unified GAVI node server
CMD ["npm", "run", "start"]
