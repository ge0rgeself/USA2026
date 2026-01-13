FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Copy database migrations directory
COPY db/ ./db/

ENV PORT=8080
EXPOSE 8080

# Run migrations on startup, then start the server
CMD ["sh", "-c", "node db/migrate.js && node server.js"]
