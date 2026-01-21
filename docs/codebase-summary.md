# CLIProxyAPI-Monitor Codebase Summary

## Project Overview

CLIProxyAPI-Monitor is a Next.js-based analytics dashboard that fetches API usage data from upstream CLIProxyAPI, persists it in PostgreSQL, and provides interactive visualizations for cost tracking and resource monitoring.

**Technology Stack:**
- Frontend: Next.js 16 App Router, React 19, TailwindCSS 4
- Backend: Next.js API routes, Drizzle ORM 0.45.1
- Database: PostgreSQL 16 with Drizzle migrations
- Visualizations: Recharts for charts and data displays
- Deployment: Vercel (with automated Cron jobs)
- Language: TypeScript 5.4.5, Strict mode enabled

---

## Directory Structure

```
CLIProxyAPI-Monitor/
├── app/                          # Next.js App Router pages & routes
│   ├── page.tsx                  # Main dashboard (2594 LOC)
│   ├── layout.tsx                # Root layout with analytics
│   ├── globals.css               # Tailwind + custom animations
│   ├── explore/page.tsx          # Data exploration page (1924 LOC)
│   ├── logs/page.tsx             # Error/app logs viewer (406 LOC)
│   ├── login/
│   │   ├── page.tsx              # Login page (183 LOC)
│   │   └── layout.tsx            # Login-specific layout
│   ├── components/
│   │   ├── Sidebar.tsx           # Navigation & feature toggles (209 LOC)
│   │   ├── Modal.tsx             # Reusable modal dialog (97 LOC)
│   │   └── ClientLayout.tsx      # Client-side layout wrapper (32 LOC)
│   └── api/
│       ├── auth/
│       │   ├── verify/route.ts   # Password verification & session (156 LOC)
│       │   └── logout/route.ts   # Session cleanup (9 LOC)
│       ├── sync/route.ts         # Upstream data sync (131 LOC)
│       ├── overview/route.ts     # Dashboard aggregation (94 LOC)
│       ├── prices/route.ts       # Model pricing CRUD (96 LOC)
│       ├── explore/route.ts      # Time-series data (73 LOC)
│       ├── request-error-logs/   # Error logs proxy (45 LOC)
│       ├── logs/route.ts         # App logs proxy (39 LOC)
│       ├── management-url/       # External console link (20 LOC)
│       ├── reset/route.ts        # Data reset handler (16 LOC)
│       └── usage-statistics-enabled/ # Feature toggle (78 LOC)
│
├── lib/                          # Shared utilities & business logic
│   ├── config.ts                 # Environment validation (33 LOC)
│   ├── types.ts                  # TypeScript interfaces (43 LOC)
│   ├── utils.ts                  # Formatting utilities (45 LOC)
│   ├── usage.ts                  # API parsing & validation (209 LOC)
│   ├── db/
│   │   ├── client.ts             # Drizzle ORM instance
│   │   └── schema.ts             # Table definitions
│   └── queries/
│       ├── overview.ts           # Dashboard aggregation (322 LOC)
│       └── explore.ts            # Time-series sampling (121 LOC)
│
├── proxy.ts                      # Authentication middleware (111 LOC)
├── drizzle/                      # Database migrations
├── docker-compose.yml            # Local PostgreSQL setup
├── vercel.json                   # Cron job configuration
├── tsconfig.json                 # TypeScript configuration
├── next.config.ts                # Next.js configuration
├── drizzle.config.ts             # Drizzle ORM config
├── package.json                  # Dependencies & scripts
├── .env.example                  # Template for secrets
└── README.md                     # Project README
```

---

## Key Modules

### Frontend Pages

| Page | Purpose | Key Features |
|------|---------|--------------|
| Dashboard (`/`) | Main analytics view | Hourly trends, model breakdown, token composition, Top 10 API Keys, pricing config |
| Explore (`/explore`) | Multi-model analysis | Scatter plots, area charts, series filtering, zoom/pan |
| Logs (`/logs`) | Error & app logs | Dual-view logs, file browser, timestamp formatting |
| Login (`/login`) | Password entry | Rate limiting, exponential backoff, auth feedback |

### API Routes

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/auth/verify` | POST | Password validation & session | None (public) |
| `/api/auth/logout` | POST | Clear session cookie | Session cookie |
| `/api/sync` | GET/POST | Upstream data ingestion | Bearer token, session, or password |
| `/api/overview` | GET | Dashboard aggregation + top routes | Session cookie |
| `/api/explore` | GET | Time-series data | Session cookie |
| `/api/prices` | GET/POST/DELETE | Model pricing CRUD | Session cookie |
| `/api/logs` | GET | App logs proxy | Session cookie |
| `/api/request-error-logs` | GET | Error logs proxy | Session cookie |
| `/api/management-url` | GET | External console link | Session cookie |
| `/api/reset` | GET | Data reset | Session cookie |
| `/api/usage-statistics-enabled` | GET/POST | Feature flag | Session cookie |

### Database

**Tables:**

1. **model_prices** - Stores pricing configuration per AI model
   - Columns: id, model (UNIQUE), input_price_per_1m, cached_input_price_per_1m, output_price_per_1m, created_at
   - Purpose: Enable frontend cost estimation

2. **usage_records** - Core telemetry data (immutable fact table)
   - Columns: id, occurred_at, synced_at, route, model, total_tokens, input_tokens, output_tokens, reasoning_tokens, cached_tokens, total_requests, success_count, failure_count, is_error, raw
   - Unique Index: (occurred_at, route, model) - prevents duplicate ingestion
   - Purpose: Analytics aggregation and cost calculation

---

## Key Types

### RouteUsage

Represents aggregated usage metrics for a specific API route.

**Definition:**
```typescript
type RouteUsage = {
  route: string;
  totalRequests: number;
  successCount: number;
  failureCount: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
}
```

**Usage:** Returned in `/api/overview` response within `topRoutes` array, sorted by totalRequests descending, limited to TOP_ROUTES_LIMIT (default: 10).

---

## Core Components

### Sidebar (`app/components/Sidebar.tsx`)

Navigation with feature toggles and external links.

**Features:**
- Active link highlighting based on pathname
- Usage statistics collection toggle
- Logout button
- Links to GitHub repo and management console
- Async state management with loading indicators

### Modal (`app/components/Modal.tsx`)

Reusable modal dialog with smooth animations.

**Features:**
- Backdrop dismissal
- Close button (top-right X)
- CSS animations (entrance/exit)
- Content caching during animations
- Customizable styling and dark mode support

### ClientLayout (`app/components/ClientLayout.tsx`)

Conditional layout wrapper for theme and sidebar visibility.

**Logic:**
- Hides sidebar on login page
- Shows sidebar on protected pages
- Theme persistence via localStorage
- Fallback to system preferences

---

## Authentication & Authorization

### Session Model

- **Type:** Cookie-based (no JWT)
- **Cookie Name:** `dashboard_auth`
- **Duration:** 30 days max age
- **Flags:** HttpOnly, SameSite=Lax, Secure (production only)

### Authentication Methods

1. **Basic Auth:** HTTP Authorization header with Base64-encoded password
2. **Session Cookie:** `dashboard_auth` matching hashed PASSWORD
3. **Bearer Token:** For cron jobs (uses CRON_SECRET)

### Rate Limiting

- **Mechanism:** IP-based tracking in memory Map
- **Initial Lockout:** 30 minutes after N failed attempts
- **Backoff:** Lockout duration doubles on repeated failures
- **Cleanup:** Automatic expiration after 1 hour

### Protected Paths

All paths except:
- `/_next/*` (Next.js build artifacts)
- `/login` (login page)
- `/api/auth/*` (auth endpoints)
- `/api/sync` (data sync - alternative auth)
- `/favicon.ico`, `/cf-worker-sync.js` (public assets)

---

## Data Flow & Pipelines

### Upstream Data Ingestion

```
CLIProxyAPI /usage endpoint
    ↓
GET/POST /api/sync (with auth validation)
    ↓
Zod schema validation (lib/usage.ts)
    ↓
Convert to UsageRecordInsert format
    ↓
Unique index deduplication
    ↓
INSERT or IGNORE into usage_records table
    ↓
Database persistence
```

### Dashboard Query Flow

```
GET /api/overview (with optional filters)
    ↓
Time range normalization (Asia/Shanghai timezone)
    ↓
Promise.all() executes 10 parallel queries:
  - Total metrics aggregation
  - Per-model breakdown with pagination
  - Daily aggregations
  - Hourly aggregations
  - Token composition
  - Available models/routes
  - Top 10 routes by totalRequests (NEW)
    ↓
Cost calculation via priceMap
    ↓
30-second TTL cache (LRU eviction, 100 max entries)
    ↓
Return structured response (includes topRoutes array)
```

### Explore Query Flow

```
GET /api/explore (with maxPoints parameter)
    ↓
Filter records where totalRequests = 1
    ↓
Deterministic sampling via row_number() window function
    ↓
Downsample to stay under maxPoints limit
    ↓
Return ExplorePoint[] with model/tokens metadata
```

---

## Configuration Management

### Environment Variables

| Variable | Type | Purpose | Default |
|----------|------|---------|---------|
| CLIPROXY_SECRET_KEY | string | CLIProxyAPI backend API key | Required |
| CLIPROXY_API_BASE_URL | string | CLIProxyAPI server URL | Required |
| DATABASE_URL | string | PostgreSQL connection string | Required |
| PASSWORD | string | Dashboard login password | Falls back to CLIPROXY_SECRET_KEY |
| CRON_SECRET | string | Vercel Cron authentication | Required |
| TOP_ROUTES_LIMIT | number | Number of top routes to fetch (default: 10) | 10 |

**Base URL Normalization:**
- Ensures HTTPS protocol
- Adds `/v0/management` suffix if missing
- Removes trailing slashes

### Configuration Validation

`lib/config.ts` provides `assertEnv()` to validate required vars at startup.

---

## Performance Optimization

### Caching Strategy

1. **Route-level Cache** (30-second TTL)
   - `/api/overview`: Max 100 entries with LRU eviction
   - `/api/explore`: Max 100 entries with LRU eviction
   - Cache key based on query parameters

2. **Component-level Optimization**
   - `useMemo` for computed values (color palettes, formatted data)
   - `useCallback` for event handlers (preventing rerenders)
   - LocalStorage persistence (theme, UI toggles)

3. **Request Deduplication**
   - Gap-filling algorithm for hourly series
   - Pagination support for large datasets (5-500 per page)
   - Downsampling in explore query

### Data Processing

- Hourly series gap-filling: O(n) complexity fills missing hours with 0 values
- Pagination: Offset/limit cursor-less approach for model listing
- Window functions: `row_number()` for deterministic sampling in explore query

---

## Internationalization & Localization

### Language & Timezone

- **Language:** English (en-US)
- **Fixed Timezone:** Asia/Shanghai (UTC+8)
- **Number Format:** Compact notation (1.5M, 1.2k)
- **Currency:** USD with $ prefix and thousand separators

### Timezone Handling

All date grouping uses explicit `date_trunc()` in Asia/Shanghai timezone:
- Daily aggregations grouped by date in Shanghai
- Hourly aggregations with timezone conversion
- Timestamp display formatted with `en-US` locale

---

## Styling & Theming

### CSS Framework

- **Utility-first:** TailwindCSS 4 for responsive design
- **Custom Animations:** Modal entrance/exit, theme transitions
- **Color Scheme:** Dark theme primary (slate-950 text, slate-100 foreground)

### Theme System

- **Storage:** localStorage key `"theme"`
- **Options:** Dark or light
- **Fallback:** System preference (`prefers-color-scheme`)
- **Application:** `dark` class on `<html>` element

### Responsive Layout

- **Sidebar:** Fixed left panel (width: 224px)
- **Content:** Flexible width with min-height-screen
- **Mobile:** Not explicitly optimized in current release

---

## Error Handling & Logging

### API Error Responses

- **401 Unauthorized:** Missing or invalid authentication
- **400 Bad Request:** Validation error (Zod schema mismatch)
- **429 Too Many Requests:** Rate limit lockout
- **500 Internal Server Error:** Unexpected failures
- **501 Not Implemented:** Missing configuration

### Frontend Error Handling

- Try-catch blocks in async operations
- User-friendly error messages (English localized)
- Fallback UI for loading/error states
- Loading skeletons during data fetch

### Logging

- **Server:** `console.error()` to stdout
- **Client:** Limited error tracking (no Sentry/Rollbar integration)
- **Audit Trail:** Raw JSON preserved in `usage_records.raw` column

---

## Security Implementation

### Threat Mitigations

| Threat | Mitigation | Status |
|--------|-----------|--------|
| Brute Force | Rate limiting with exponential backoff lockout | Implemented |
| Session Hijacking | Secure HttpOnly cookies + hash verification | Implemented |
| CSRF | Bearer token support for non-browser clients | Implemented |
| SQL Injection | Drizzle ORM parameterized queries | Implemented |
| XSS | React automatic escaping, no dangerouslySetInnerHTML | Implemented |
| Timing Attacks | Constant-time token comparison | Implemented |

### Secrets Management

- All credentials in environment variables
- No hardcoded secrets in code
- Password hashing via Web Crypto API (`SubtleCrypto`)
- Bearer tokens validated server-side

### API Security

- All upstream requests include Bearer auth
- No public endpoints without authentication
- Request validation with Zod schemas
- HTTPS enforcement (normalized in config)

---

## Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| next | 16.1.1 | Full-stack framework |
| react | 19.2.3 | UI library |
| drizzle-orm | 0.45.1 | Type-safe ORM |
| postgres | 3.4.8 | PostgreSQL driver |
| recharts | 3.6.0 | Data visualization |
| tailwindcss | 4.1.18 | Utility CSS |
| lucide-react | 0.562.0 | Icon library |
| zod | 4.3.5 | Schema validation |
| typescript | 5.4.5 | Type safety |

---

## Build & Deployment Scripts

| Script | Purpose |
|--------|---------|
| `pnpm dev` | Start dev server |
| `pnpm build` | Build for production (runs migrations first) |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:push` | Push migrations to database |

---

## Architectural Patterns

1. **Type Safety:** Zod runtime validation + TypeScript compile-time checking
2. **ORM Pattern:** Drizzle with prepared statements and parameterized queries
3. **Query Batching:** Promise.all() for 9 parallel aggregations
4. **Data Deduplication:** Unique index on (occurred_at, route, model)
5. **Time Zone Handling:** Explicit Asia/Shanghai for all aggregations
6. **Cost Calculation:** Pluggable pricing via priceMap lookup
7. **Auth Strategy:** Dual-method (Basic Auth + Cookies) with SHA-256 hashing
8. **Sampling:** Deterministic row_number() for stable downsampling
9. **Caching:** In-memory Map with TTL and LRU eviction

---

## Deployment Architecture

### Vercel Deployment

- **Cron Job:** `/api/sync` scheduled daily at 9 PM UTC
- **Hobby Plan:** Daily sync (once per day)
- **Pro Plan:** Hourly sync (more frequent)
- **Analytics:** Vercel Analytics integrated for performance monitoring

### Docker Local Development

PostgreSQL 16 Alpine setup via `docker-compose.yml`:
- Service: `postgres:16-alpine`
- Database: `cliproxy` (user: postgres, pass: postgres)
- Port: 5432:5432
- Persistent volume: `postgres_data`
- Health checks enabled

### Database Migrations

- **Tool:** Drizzle Kit
- **Output:** `drizzle/` directory with SQL migrations
- **Initial Schema:** Creates model_prices and usage_records tables
- **Execution:** Via `pnpm run db:push` or build script

---

## Notable Implementation Details

### Password Hashing

Uses Web Crypto API (browser-native `SubtleCrypto`):
```
Client: btoa(":${password}") → Base64 encoding
Server: SHA-256 hash comparison with constant-time check
```

### Hourly Series Gap-Filling

Ensures complete time ranges in chart data by filling missing hours with 0 values. Maintains historical continuity.

### Color Palette Strategies

- **8-color Pie Chart:** Soft palette (blue, green, yellow, purple, pink, cyan, lime, orange)
- **17-color Model Chart:** High-saturation colors with strategic spacing for visual distinction
- **4-color Token Types:** Input (blue), output (green), reasoning (yellow), cached (purple)

### Modal Animations

State caching during animations prevents visual glitches:
- `animate-modal-backdrop` (entrance), `animate-modal-backdrop-out` (exit)
- `animate-modal-content` (entrance), `animate-modal-content-out` (exit)

### Theme Persistence

LocalStorage key `"theme"` allows theme preference to persist across sessions without server roundtrips.

