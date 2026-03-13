# Prompt House

A library for managing, sharing, and discovering AI prompts.

## Stack

- **Database**: PostgreSQL 16 (Docker)
- **Backend**: Node.js + Express + TypeScript + Drizzle ORM
- **Frontend**: React + Vite + TypeScript

## Setup

### 1. Copy environment file

```bash
cp .env.example .env
```

Edit `.env` if you need different credentials.

### 2. Start the database

```bash
docker compose up -d
```

### 3. Install dependencies

```bash
npm install
```

### 4. Run migrations

```bash
npm run db:migrate
```

### 5. Start development servers

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001
- Health check: http://localhost:3001/health

## Database commands

```bash
npm run db:generate   # generate migration from schema changes
npm run db:migrate    # run migrations
npm run db:push       # push schema directly (dev only)
npm run db:studio     # open Drizzle Studio
```
