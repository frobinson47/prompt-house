FROM node:20-slim

WORKDIR /app

# Copy workspace package files
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install all dependencies
RUN npm ci

# Copy source
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Build frontend
RUN npm run build --workspace=frontend

# Build backend
RUN npm run build --workspace=backend

EXPOSE 3001

CMD ["node", "backend/dist/index.js"]
