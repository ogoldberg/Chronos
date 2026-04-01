FROM node:22-slim

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source
COPY . .

# Build frontend
RUN npm run build

# Remove devDependencies to shrink image
RUN npm prune --production

# Health check (using node instead of curl — slim image doesn't have curl)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Expose port
ENV PORT=3000
EXPOSE 3000

# Start production server
CMD ["npm", "start"]
