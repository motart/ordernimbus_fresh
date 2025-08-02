# Multi-stage build for production-ready image
FROM node:18-alpine AS frontend-build

# Build React frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --only=production
COPY frontend/ ./
RUN npm run build

# Setup backend with built frontend
FROM node:18-alpine

WORKDIR /app

# Copy backend files
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm ci --only=production

# Copy backend source
COPY backend/ ./

# Copy built frontend from previous stage
COPY --from=frontend-build /app/frontend/build ./frontend/build

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})"

# Start the server
CMD ["node", "server.js"]