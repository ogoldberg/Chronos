FROM node:22-slim

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --production=false

# Copy source
COPY . .

# Build frontend
RUN npm run build

# Expose port
ENV PORT=3000
EXPOSE 3000

# Start production server
CMD ["npm", "start"]
