FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies as root
RUN npm install --only=production

# Create data directory with proper permissions
RUN mkdir -p /app/data && chown -R node:node /app/data

# Copy application code
COPY --chown=node:node . .

# Switch to non-root user
USER node

# Expose port
EXPOSE 3001

# Start the application
CMD ["npm", "start"]