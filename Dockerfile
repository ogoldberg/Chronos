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

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD curl -f http://localhost:3000/api/config || exit 1

# Expose port
ENV PORT=3000
EXPOSE 3000

# Start production server
CMD ["npm", "start"]
