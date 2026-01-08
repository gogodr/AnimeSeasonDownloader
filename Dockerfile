# Use Node.js LTS version
FROM node:20-alpine

# Install wget for healthcheck
RUN apk add --no-cache wget

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy application files
COPY . .

# Build the frontend
RUN npm run build

# Remove devDependencies to reduce image size
RUN npm prune --production

# Expose the port
EXPOSE 3000

COPY ./.env /app/.env

# Start the application
CMD ["node", "index.js"]

