# CLIProxyAPI Dashboard

Real-time data dashboard built with Next.js App Router + React 19 + Drizzle ORM + PostgreSQL for fetching upstream CLIProxyAPI usage data, persisting to database, and interactive data visualization.

## Core Features

- **Dashboard** - Usage trends, cost estimation, model cost breakdown
- **Data Exploration** - Multi-model analysis with zoom and filter support
- **Log Viewer** - Application logs and error logs browsing
- **Auto Sync** - Scheduled upstream data fetching with deduplication
- **Price Configuration** - Dynamic model pricing for cost calculation
- **Password Protection** - SHA-256 based session authentication

## Quick Start

### Local Development

```bash
# Install dependencies
pnpm install

# Configure environment variables
cp .env.example .env

# Start database (Docker)
docker-compose up -d

# Initialize database
pnpm run db:push

# Start development server
pnpm dev
```

Visit http://localhost:3000

### Deploy to Vercel

1. Fork this repository and create a project on Vercel
2. Configure environment variables:
   - `CLIPROXY_SECRET_KEY` - CLIProxyAPI API key
   - `CLIPROXY_API_BASE_URL` - CLIProxyAPI service URL
   - `DATABASE_URL` - PostgreSQL connection string (supports Vercel Postgres)
   - `PASSWORD` - Dashboard login password (optional, defaults to CLIPROXY_SECRET_KEY)
   - `CRON_SECRET` - Cron authentication token (16+ characters)

3. After deployment, Vercel Cron automatically syncs data daily

See full deployment guide at [Deployment Guide](./docs/deployment-guide.md)

## Documentation

| Document | Description |
|----------|-------------|
| [Project Overview & PDR](./docs/project-overview-pdr.md) | Feature requirements, constraints, success metrics |
| [System Architecture](./docs/system-architecture.md) | System design, data flow, performance optimization |
| [Code Standards](./docs/code-standards.md) | TypeScript conventions, patterns, best practices |
| [Codebase Summary](./docs/codebase-summary.md) | Directory structure, module descriptions, API reference |
| [Deployment Guide](./docs/deployment-guide.md) | Local development, Vercel deployment, troubleshooting |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Next.js 16 App Router, TailwindCSS 4 |
| Visualization | Recharts (Line, Bar, Pie, Area, Scatter charts) |
| Backend | Next.js API routes, TypeScript, Zod validation |
| Database | PostgreSQL 16, Drizzle ORM 0.45.1 |
| Deployment | Vercel (Cron jobs), Docker (local) |
| Authentication | SHA-256 password hashing, HttpOnly cookies |

## Environment Variables

Configure the following variables (see `.env.example`):

```env
# CLIProxyAPI upstream service
CLIPROXY_SECRET_KEY=your-api-key
CLIPROXY_API_BASE_URL=https://your-clipproxy.com/

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/cliproxy

# Security
PASSWORD=your-secure-password
CRON_SECRET=your-cron-secret-16-chars-or-longer
```

## Preview

Dashboard | Data Exploration
---|---
![Dashboard](https://github.com/user-attachments/assets/939424fb-1caa-4e80-a9a8-921d1770eb9f) | ![Explore](https://github.com/user-attachments/assets/e5338679-7408-4f37-9753-41b559a3cee6)

## Development Commands

```bash
# Development server
pnpm dev

# Production build
pnpm build

# Production start
pnpm start

# Lint code
pnpm lint

# Database operations
pnpm run db:generate  # Generate migrations
pnpm run db:push      # Apply migrations
```

## Architecture Features

- **Type Safety** - TypeScript + Zod runtime validation
- **High Performance** - 30s TTL cache, 9 parallel queries, LRU eviction
- **Secure Auth** - IP-based rate limiting, exponential backoff lockout
- **Scalable** - Stateless API, supports horizontal scaling
- **Internationalization** - English (en-US), Asia/Shanghai timezone

## FAQ

**Q: What databases are supported?**
A: Currently only PostgreSQL 16+

**Q: Is multi-user supported?**
A: Current version uses single password shared access, no RBAC

**Q: How to export data?**
A: Query database directly or implement custom export at database layer

**Q: What's the performance?**
A: Overview API response <500ms for 14-day data, cache hit rate typically >70%

## License

MIT

## Related Links

- [GitHub Repository](https://github.com/sxjeru/CLIProxyAPI-Monitor)
- [CLIProxyAPI](https://github.com/sxjeru/CLIProxyAPI)
- [Vercel Deployment](https://vercel.com)
