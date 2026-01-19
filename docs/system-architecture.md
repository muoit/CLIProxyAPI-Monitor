# System Architecture

**Version:** 1.2.0
**Last Updated:** January 2026
**Scope:** High-level system design, data flows, and architectural patterns

---

## Architecture Overview

CLIProxyAPI-Monitor follows a three-tier architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                      PRESENTATION LAYER                      │
│  Browser (React 19) ─ Next.js App Router Pages & Components  │
│  Dashboard, Explore, Logs, Login Pages                      │
└─────────────────────────────────────────────────────────────┘
                            ↕ (HTTPS)
┌─────────────────────────────────────────────────────────────┐
│                      APPLICATION LAYER                       │
│  Next.js 16 API Routes ─ REST Endpoints                     │
│  Auth, Data Sync, Aggregation, Pricing Management           │
│  Middleware ─ Authentication & Authorization                │
└─────────────────────────────────────────────────────────────┘
                            ↕ (TCP)
┌─────────────────────────────────────────────────────────────┐
│                       DATA LAYER                             │
│  PostgreSQL 16 ─ Drizzle ORM                                │
│  Fact Tables: usage_records, model_prices                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Architecture

### Presentation Layer (Frontend)

**Technology:** React 19 + Next.js 16 App Router + TailwindCSS 4

**Key Components:**

1. **Page Components** (Server/Client Hybrid)
   - `app/page.tsx` - Dashboard with charts and pricing config
   - `app/explore/page.tsx` - Multi-model analysis
   - `app/logs/page.tsx` - Error and app logs viewer
   - `app/login/page.tsx` - Authentication entry point

2. **Reusable Components**
   - `Sidebar` - Navigation and feature toggles
   - `Modal` - Dialog for price editing
   - `ClientLayout` - Theme and layout wrapper

3. **Chart Library**
   - **Recharts** for all visualizations
   - LineChart, BarChart, PieChart, AreaChart, ComposedChart, ScatterChart

4. **Styling**
   - TailwindCSS 4 for utility-first CSS
   - Custom animations via `globals.css`
   - Dark mode via `dark` class on html element

### Application Layer (Backend)

**Technology:** Next.js 16 API Routes + TypeScript

**Route Structure:**

```
app/api/
├── auth/
│   ├── verify       POST  - Password validation, session creation
│   └── logout       POST  - Session cleanup
├── sync             GET/POST - Upstream data ingestion
├── overview         GET   - Dashboard aggregation
├── explore          GET   - Time-series data for charts
├── prices           GET/POST/DELETE - Pricing CRUD
├── logs             GET   - App logs proxy
├── request-error-logs GET - Error logs proxy
├── management-url   GET   - External console link
├── reset            GET   - Data reset handler
└── usage-statistics-enabled GET/POST - Feature toggle
```

**Request Flow:**

```
Browser Request
      ↓
proxy.ts (Authentication Middleware)
      ↓ (Validates session or Bearer token)
API Route Handler
      ↓
Zod Validation (Input)
      ↓
Drizzle ORM Query / External API Call
      ↓
Response Formatting
      ↓
NextResponse (JSON)
      ↓
Browser (React State Update)
```

### Data Layer

**Technology:** PostgreSQL 16 + Drizzle ORM 0.45.1

**Schema:**

```sql
CREATE TABLE model_prices (
  id SERIAL PRIMARY KEY,
  model TEXT UNIQUE NOT NULL,
  input_price_per_1m NUMERIC(10,4) NOT NULL,
  cached_input_price_per_1m NUMERIC(10,4) DEFAULT 0,
  output_price_per_1m NUMERIC(10,4) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE usage_records (
  id SERIAL PRIMARY KEY,
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  route TEXT NOT NULL,
  model TEXT NOT NULL,
  total_tokens INTEGER NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  reasoning_tokens INTEGER DEFAULT 0,
  cached_tokens INTEGER DEFAULT 0,
  total_requests INTEGER NOT NULL,
  success_count INTEGER NOT NULL,
  failure_count INTEGER NOT NULL,
  is_error BOOLEAN DEFAULT FALSE,
  raw TEXT NOT NULL,
  UNIQUE(occurred_at, route, model)
);

CREATE INDEX idx_usage_records_occurred_at ON usage_records(occurred_at DESC);
CREATE INDEX idx_usage_records_model ON usage_records(model);
```

---

## Data Flow Architecture

### 1. Upstream Data Ingestion Flow

```
CLIProxyAPI
(upstream service)
     ↓
GET /v0/management/usage
(REST API endpoint)
     ↓
POST /api/sync
(Dashboard app)
     ↓
Zod Validation
(lib/usage.ts)
     ↓
toUsageRecords()
(Convert to DB format)
     ↓
Unique Index Check
(occurred_at, route, model)
     ↓
INSERT OR IGNORE
(PostgreSQL)
     ↓
Database
(Persistent storage)
     ↓
Cache Invalidation
(Clear related cache keys)
```

**Key Components:**
- **Source:** CLIProxyAPI `/usage` endpoint
- **Parser:** `lib/usage.ts` with Zod schemas
- **Deduplication:** Unique index on (occurred_at, route, model)
- **Storage:** Immutable fact table `usage_records`
- **Frequency:** Daily (Hobby) or hourly (Pro) via Vercel Cron

### 2. Dashboard Query Flow

```
Browser
(Dashboard page)
     ↓
GET /api/overview?days=14&model=...
(React useEffect on mount)
     ↓
Cache Lookup
(In-memory TTL Map)
     ↓ (Cache miss)
Promise.all() - 9 Parallel Queries
├── Total metrics (sum all tokens/requests)
├── Per-model breakdown (group by model)
├── Daily aggregation (group by date in Shanghai timezone)
├── Daily model tokens (daily breakdown per model)
├── Hourly aggregation (hourly trends)
├── Token composition (input/output/reasoning/cached)
├── Available models (distinct)
├── Available routes (distinct)
└── Cost calculation (via priceMap)
     ↓
Cache Store
(30-second TTL, LRU 100 max)
     ↓
Response Formatting
(UsageOverview type)
     ↓
Browser State Update
(setData in React)
     ↓
Chart Rendering
(Recharts visualizations)
```

**Key Parameters:**
- `days`: 1-90 (default 14)
- `model`: Optional filter
- `route`: Optional filter
- `page`, `pageSize`: Pagination (5-500 per page)
- `start`, `end`: Custom date range

**Response Structure:**
```json
{
  "overview": { /* UsageOverview object */ },
  "empty": false,
  "days": 14,
  "meta": {
    "page": 1,
    "pageSize": 10,
    "totalModels": 42,
    "totalPages": 5
  },
  "filters": {
    "models": ["claude-3-opus", "gpt-4", ...],
    "routes": ["/api/chat", "/api/complete", ...]
  }
}
```

### 3. Explore Time-Series Flow

```
Explore Page
(Multi-model scatter plot)
     ↓
GET /api/explore?days=7&maxPoints=20000
(On component mount)
     ↓
Cache Lookup
     ↓ (Cache miss)
Query usage_records
WHERE totalRequests = 1
     ↓
Window Function Sampling
row_number() OVER (ORDER BY occurred_at)
WHERE row_number % step = 0
     ↓
Calculate step
(step = total_records / maxPoints)
     ↓
Return ExplorePoint[]
{
  ts: timestamp,
  model: string,
  tokens, inputTokens, outputTokens, reasoningTokens, cachedTokens: number
}
     ↓
Cache Store
(30-second TTL)
     ↓
Recharts ComposedChart
(Scatter + Area chart)
```

**Deterministic Sampling:**
- Uses `row_number()` for stable downsampling
- Same data points selected if query re-run
- Improves cache hit rates

### 4. Authentication Flow

```
User Browser
(Login form)
     ↓
POST /api/auth/verify
Authorization: Basic <base64(:password)>
     ↓
Extract credentials
     ↓
SHA-256 hash(password)
     ↓
Compare with stored config.password
     ↓ (Match)
Rate Limiting Check
(IP-based tracking)
     ↓ (No lockout)
Set session cookie
{
  name: "dashboard_auth",
  value: hashed_password,
  maxAge: 30 days,
  httpOnly: true,
  secure: true (production),
  sameSite: "lax"
}
     ↓
Redirect to dashboard
     ↓
proxy.ts middleware
(Validates cookie on subsequent requests)
     ↓
Grant access to protected pages
```

**Rate Limiting Strategy:**
- IP-based tracking in memory Map
- Initial lockout: 30 minutes after N failed attempts
- Exponential backoff: lockout duration doubles on retry
- Auto-cleanup: Expired records removed after 1 hour

### 5. Caching Architecture

```
Request
     ↓
Cache Key Generation
(route + query params)
     ↓
TTL Check
(30 second window)
     ↓ (Cache hit)
Return cached data
     ↓
     ↓ (Cache miss)
Execute query
     ↓
Store in LRU Map
     ↓
Return result
     ↓ (Eviction if > 100 entries)
Remove oldest entry
```

**Cache Behavior:**
- **TTL:** 30 seconds per entry
- **Max Entries:** 100 (LRU eviction)
- **Scope:** Per API route (overview, explore)
- **Invalidation:** Automatic on data sync

---

## Authentication & Authorization

### Session Model

```
Browser Login Request
     ↓
POST /api/auth/verify
(password in Authorization header)
     ↓
Server validates password
     ↓
Success → Set HttpOnly Cookie
(dashboard_auth = hashed_password)
     ↓
Browser stores cookie automatically
     ↓
Subsequent Requests
(Cookie sent automatically)
     ↓
proxy.ts middleware
(Validates cookie)
     ↓
Grant/Deny access
```

### Protected Paths

**Require Authentication:**
- `/` (Dashboard)
- `/explore` (Data exploration)
- `/logs` (Error logs)
- `/api/overview`, `/api/explore`, etc.

**Public Paths (No Auth):**
- `/login` (Authentication form)
- `/api/auth/verify` (Login endpoint)
- `/api/auth/logout` (Logout endpoint)
- `/api/sync` (Alternative auth: Bearer token or password)
- `/_next/*` (Next.js assets)

### Multi-Method Authentication

```
Incoming Request
     ↓
Check Authorization header
     ↓ (Bearer token found)
Verify: token === CRON_SECRET
     ↓ (Match)
Allow (for scheduled jobs)
     ↓
     ↓ (No Bearer token)
Check dashboard_auth cookie
     ↓ (Found)
Verify: hash(cookie) === PASSWORD
     ↓ (Match)
Allow (for dashboard users)
```

---

## Performance Optimization Strategies

### 1. Query Parallelization

Dashboard overview executes 9 queries in parallel via `Promise.all()`:

```typescript
const [totals, byModel, byDay, byHour, ...] = await Promise.all([
  queryTotals(),
  queryByModel(),
  queryByDay(),
  // ... 9 queries total
]);
```

**Benefit:** Reduces response time from 9x single query to 1x longest query (~100-150ms)

### 2. Database Indexing

```sql
-- Unique index enables fast deduplication check
CREATE UNIQUE INDEX idx_usage_unique ON usage_records(occurred_at, route, model);

-- Support for filtering and sorting
CREATE INDEX idx_occurred_at ON usage_records(occurred_at DESC);
CREATE INDEX idx_model ON usage_records(model);
```

### 3. Caching Strategy

- **Route-level:** 30-second TTL with LRU eviction
- **Component-level:** `useMemo` for computed values
- **Browser:** LocalStorage for theme preference
- **Request dedup:** In-memory cache by query key

### 4. Data Downsampling

Explore query uses deterministic sampling to limit response size:

```sql
SELECT *
FROM (
  SELECT *, row_number() OVER (ORDER BY occurred_at) as rn
  FROM usage_records
  WHERE occurred_at >= NOW() - INTERVAL '7 days'
) sub
WHERE rn % $step = 0
LIMIT $maxPoints
```

### 5. Pagination

Model list paginated (5-500 per page) instead of returning all records.

---

## Deployment Architecture

### Vercel Deployment

```
Git Repository
(GitHub)
     ↓
Push to main
     ↓
Vercel CI/CD
├── Build: next build (runs migrations)
├── Deploy: Upload to edge network
└── Cron: Register scheduled job
     ↓
Edge Functions
(Next.js API routes)
     ↓
PostgreSQL
(Vercel Postgres or external)
```

**Cron Job Configuration:**

```json
{
  "crons": [{
    "path": "/api/sync",
    "schedule": "0 21 * * *"  // 9 PM UTC daily
  }]
}
```

### Docker Local Development

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: cliproxy
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
```

### Environment Configuration

| Variable | Purpose | Source |
|----------|---------|--------|
| CLIPROXY_SECRET_KEY | API authentication | Vercel secrets |
| CLIPROXY_API_BASE_URL | Upstream server URL | Vercel secrets |
| DATABASE_URL | PostgreSQL connection | Vercel Postgres |
| PASSWORD | Dashboard login | Vercel secrets |
| CRON_SECRET | Cron job auth | Vercel secrets |

---

## Data Consistency & Integrity

### Deduplication Strategy

Unique index prevents duplicate ingestion:

```sql
UNIQUE(occurred_at, route, model)
```

When sync endpoint receives duplicate data:
- Database UNIQUE constraint rejects duplicate
- INSERT OR IGNORE silently skips
- No duplicate records stored

### Immutable Fact Table

`usage_records` table is append-only:
- Records never updated after insertion
- Enables reliable cost calculation
- Preserves historical accuracy
- Simplifies auditing

### Data Validation

All external input validated with Zod before storage:

```typescript
const UsageSchema = z.object({
  occurred_at: z.string().datetime(),
  model: z.string().min(1),
  total_tokens: z.number().int().positive(),
  // ... other fields
});
```

---

## Security Architecture

### Threat Model

| Threat | Vector | Mitigation |
|--------|--------|-----------|
| Brute Force | Password guessing | Rate limiting + exponential backoff |
| Session Hijacking | Cookie theft | HttpOnly + SameSite flags |
| CSRF | Cross-site requests | Bearer token + SameSite=Lax |
| SQL Injection | Untrusted input | Drizzle ORM parameterized queries |
| XSS | Script injection | React auto-escaping |
| Timing Attack | Password comparison timing | Constant-time comparison |

### Authentication Flow Diagram

```
User Password Input
     ↓
Client: btoa(":${password}")
(Base64 encode)
     ↓
Authorization: Basic <base64>
     ↓
Server: Extract password
     ↓
Server: SHA-256 hash(password)
     ↓
Server: Constant-time compare with stored hash
     ↓ (Match)
Set HttpOnly Cookie
     ↓ (Mismatch)
Increment attempt counter
     ↓ (Threshold reached)
Activate rate limiting
```

---

## Scalability Considerations

### Current Limits

- **Query Response:** <500ms with 14-day dataset
- **Cache Memory:** ~100 cache entries max
- **Rate Limit Memory:** Per-IP tracking (unbounded in theory)
- **Connection Pool:** Default Postgres driver pool size

### Bottlenecks & Solutions

| Bottleneck | Solution | Priority |
|-----------|----------|----------|
| Large datasets (>1M records) | Implement data archiving | Medium |
| In-memory rate limiting | Move to Redis | Low |
| Single database server | Use read replicas | Medium |
| Browser WebSocket latency | Polling sufficient for v1 | Low |
| Slow queries | Add more indexes | Medium |

### Horizontal Scaling

- **Stateless API:** Each instance independent
- **Shared Database:** PostgreSQL single source of truth
- **Load Balancer:** Vercel handles distribution
- **Cache Coherence:** 30-second TTL ensures eventual consistency

---

## Monitoring & Observability

### Metrics to Track

1. **Performance**
   - API response times (P50, P95, P99)
   - Cache hit rate (%)
   - Query latency per route
   - Cron job success rate

2. **Usage**
   - Monthly active users
   - Data sync frequency
   - Dashboard page views
   - Feature toggle adoption

3. **Reliability**
   - Error rate by endpoint
   - Failed authentication attempts
   - Database connection errors
   - Cron job failures

### Logging Strategy

- **Server:** console.error() to stdout
- **Client:** Limited error tracking (no Sentry integration)
- **Audit:** Raw JSON preserved in usage_records.raw

---

## Future Architecture Considerations

### v1.3 Enhancements

- WebSocket for real-time data updates
- Redis for distributed caching
- Multi-user RBAC system
- Data archiving to cold storage

### v1.4 Long-term

- Time-series forecasting (ML models)
- Anomaly detection
- Custom dashboard widgets
- Event streaming (Kafka)

---

## Architecture Decision Records (ADRs)

### ADR-001: Single Database Server

**Decision:** Use single PostgreSQL server vs. replication

**Rationale:**
- Simplifies operational overhead
- Sufficient for current scale
- Vercel Postgres offers high availability

**Trade-off:** Single point of failure; mitigated by managed service

### ADR-002: In-Memory Caching vs. Redis

**Decision:** In-memory cache vs. Redis distributed cache

**Rationale:**
- 30-second TTL suitable for current data freshness needs
- Single-instance deployment doesn't need distributed cache
- Reduces operational complexity

**Trade-off:** Cache resets on server restart; acceptable for v1

### ADR-003: Immutable Fact Table

**Decision:** Append-only table vs. update-able records

**Rationale:**
- Audit trail preservation
- Simpler cost calculation logic
- Prevents accidental data corruption

**Trade-off:** No edit capability; acceptable for metrics data

