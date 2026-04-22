FROM node:22-slim

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Copy source
COPY . .

# Build frontend — call vite directly instead of `npm run build`.
# `npm run build` runs `tsc -b && vite build`; `tsc -b` is a type check
# that runs silently, sometimes takes 30-60s, and has tripped Railway's
# inactivity kill in the past. Vite uses esbuild to compile TS natively,
# so skipping `tsc` here produces the same output. Type checking
# belongs in CI (.github/workflows/ci.yml) which runs `npm run build`
# in full.
RUN npx vite build

# Remove devDependencies to shrink the runtime image.
RUN npm prune --production

# Health check (node, since slim doesn't have curl).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3000) + '/api/config').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Railway injects PORT; app reads process.env.PORT.
EXPOSE 3000

CMD ["npm", "start"]
