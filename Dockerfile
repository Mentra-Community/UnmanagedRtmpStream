FROM oven/bun:latest

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies (including dev dependencies for build)
RUN bun install

# Copy the application code
COPY . .

# Build the application
# RUN bun run build

# Expose the port
EXPOSE 80

# Ready to start the application
CMD ["echo", "Ready to run services"]
# CMD ["bun", "start"]