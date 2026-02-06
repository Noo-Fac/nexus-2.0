FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --only=production

# Copy application code
COPY . .

# Create data directory with proper permissions
RUN mkdir -p /app/data && chown -R node:node /app/data

# Switch to non-root user
USER node

# Expose port
EXPOSE 3001

# Start the application
CMD ["npm", "start"]