# CLIProxyAPI-Monitor: Project Overview & Product Development Requirements

**Version:** 1.2.0
**Last Updated:** January 2026
**Status:** Production / Active Development

---

## Executive Summary

CLIProxyAPI-Monitor is a cloud-native analytics dashboard built with Next.js that aggregates API usage data from upstream CLIProxyAPI service, persists it in PostgreSQL, and provides rich visualizations for cost tracking and resource monitoring. The application targets SaaS operators and API consumers who need real-time insights into token consumption, request success rates, and operational costs.

---

## Problem Statement

**Challenge:**
API service providers lack visibility into usage patterns across multiple AI models, routes, and time periods. Manual cost calculation is error-prone and time-consuming.

**Goals:**
- Centralize usage analytics in a single dashboard
- Reduce cost calculation time from hours to seconds
- Enable historical trend analysis for capacity planning
- Support password-protected access for security

---

## Target Users

1. **Primary:** SaaS platform operators using CLIProxyAPI as backend
2. **Secondary:** DevOps teams monitoring API infrastructure
3. **Tertiary:** Finance teams tracking operational expenses

---

## Core Features

### v1.2.0 (Current Release)

#### 1. Dashboard (/)
Main analytics view with multiple visualization types:

- **Hourly Trend Chart:** Line chart showing request count and cost over last 24-48 hours
- **Model Breakdown:** Bar chart displaying cost per AI model with pagination
- **Token Composition:** Pie chart + breakdown of input/output/reasoning/cached tokens
- **Model Pricing Config:** Editable form to set per-model cost rates
- **Time Range Selector:** Date picker for custom analysis windows
- **Real-time Sync:** Manual button to fetch latest data from upstream
- **Theme Toggle:** Dark/light mode switcher for UI preference

**Data Visible:**
- Total requests, tokens, success/failure counts
- Per-model cost estimation
- Daily and hourly granularity
- Filter by model and API route

#### 2. Data Exploration (/explore)
Interactive multi-model analysis for detailed investigations:

- **Multi-Model Scatter Plot:** Individual token usage points colored by model
- **Area Chart:** Total token trends over time with area fill
- **Composed Chart:** Supports multiple Y-axes for different metrics
- **Reference Lines:** Highlight specific token thresholds
- **Series Filtering:** Toggle individual models on/off
- **Zoom & Pan:** Imperative handle for external chart control
- **Dynamic Colors:** 17-color palette with strategic spacing

**Data Accessible:**
- Individual request records (1-point aggregation)
- Time-series data with configurable downsampling
- Model-specific token trends

#### 3. Logs (/logs)
Dual-section interface for monitoring application and error logs:

**Application Logs:**
- Incremental fetch from `/api/logs`
- Pagination via "after" timestamp parameter
- Line-by-line log entry display
- Latest timestamp and line count visibility

**Error Logs:**
- File browser from `/api/request-error-logs`
- View individual error log files
- File size and modification time display
- Sorted by most recent first

#### 4. Login Page (/login)
Password-based authentication with rate limiting:

- Password input field
- SHA-256 hashing with Base64 encoding
- Rate limiting: N failed attempts trigger exponential backoff
- Remaining attempts counter
- Real-time lockout countdown timer
- Secure 30-day session cookie

#### 5. Data Sync (/api/sync)
Upstream data ingestion endpoint supporting multiple auth methods:

- **GET/POST:** Fetch usage data from CLIProxyAPI
- **Auth Methods:** Bearer token (cron), session cookie, or password
- **Validation:** Zod schema validation on upstream response
- **Deduplication:** Unique index prevents duplicate records
- **Format:** Supports backward-compatible token field formats

#### 6. Model Pricing Management (/api/prices)
CRUD operations for cost calculation configuration:

- **GET:** Fetch all configured prices (sorted by model)
- **POST:** Create or update model pricing
- **DELETE:** Remove price entry for model
- **Database Operation:** Upsert via Drizzle ORM `onConflictDoUpdate`

---

## Non-Functional Requirements

### Performance

- **API Response Time:** <500ms for overview aggregation (14-day dataset)
- **Dashboard Load Time:** <2s including data fetch
- **Cache TTL:** 30 seconds with LRU eviction (100 max entries)
- **Pagination:** 5-500 records per page for large datasets
- **Downsampling:** Explore query limits response to configurable maxPoints (default 20K, 1K-100K range)

### Scalability

- **Query Parallelization:** 9 concurrent aggregations via Promise.all()
- **Index Strategy:** Unique index on (occurred_at, route, model) for dedup
- **Window Functions:** `row_number()` for deterministic sampling without full scans
- **Horizontal Scaling:** Stateless API routes on Vercel

### Security

- **Password Hashing:** Web Crypto API SHA-256 with constant-time comparison
- **Session Security:** HttpOnly cookies with SameSite=Lax flag
- **Rate Limiting:** IP-based tracking with 30-minute initial lockout
- **Encryption:** HTTPS enforced via base URL normalization
- **CSRF Prevention:** Bearer token support for non-browser clients

### Reliability

- **Database Connection:** Connection pooling via `postgres` driver
- **Migration Management:** Drizzle Kit with SQL migration files
- **Backup Strategy:** User-managed PostgreSQL backups (not automated)
- **Health Checks:** Docker health checks for local PostgreSQL

### Availability

- **Uptime Target:** 99% (Vercel platform SLA)
- **Cron Scheduling:** Automated daily sync (Hobby) or hourly (Pro)
- **Deployment:** Zero-downtime deployments via Vercel

### Internationalization

- **Language:** English (en-US)
- **Timezone:** Fixed to Asia/Shanghai (UTC+8)
- **Number Format:** Compact notation (1.5M, 1.2k) + currency formatting

---

## Technical Constraints

### Architectural Decisions

1. **Single-Password Auth:** Not multi-user or role-based access control (RBAC)
2. **In-Memory Rate Limiting:** Resets on server restart (no Redis persistence)
3. **Immutable Fact Table:** Usage records are append-only for audit trail
4. **Client-Side Rendering:** Dashboard and explore pages use "use client" directive
5. **TypeScript Strict Mode:** No implicit `any` types allowed

### Technology Lock-in

- **Next.js 16 App Router:** Not configurable to older versions
- **PostgreSQL Only:** Drizzle ORM configured for PostgreSQL dialect
- **Vercel Deployment:** Cron jobs specific to Vercel platform
- **TailwindCSS 4:** Utility-first CSS framework (no custom CSS preprocessors)

### External Dependencies

- **CLIProxyAPI Upstream:** Required for data ingestion
- **PostgreSQL 16+:** Must be accessible during deployment
- **Vercel Platform:** Required for Cron scheduling (if used)

---

## Success Metrics

### User-Facing Metrics

1. **Dashboard Adoption:** % of deployed instances with dashboard access logs
2. **Data Freshness:** Average age of latest synced record <1 hour
3. **Query Latency:** P95 response time <500ms for overview endpoint
4. **Feature Usage:** Tracking which charts/filters are most accessed

### Operational Metrics

1. **Sync Success Rate:** % of cron jobs completing successfully
2. **Data Quality:** Duplicate prevention effectiveness (% dedup by unique index)
3. **Cache Hit Rate:** % of requests served from cache vs fresh queries
4. **Database Growth:** Rows/month and storage growth tracking

### Business Metrics

1. **Cost Accuracy:** Variance between calculated and actual API billing
2. **Time-to-Insight:** Reduction in manual cost calculation effort
3. **Incident Detection:** False positive rate for alert thresholds

---

## Constraints & Limitations

### Current Limitations

1. **Mobile Responsiveness:** Not optimized for mobile/tablet (desktop-first)
2. **Real-time Updates:** Polling-based fetching only (no WebSockets)
3. **Data Export:** No CSV/PDF export functionality
4. **Multi-user Support:** Single shared password (no per-user access)
5. **Data Retention:** No automated deletion policy (manual cleanup required)
6. **Backup:** No automated database backup configuration
7. **API Caching Headers:** No HTTP cache headers for browser/CDN caching
8. **Timezone Flexibility:** Hardcoded Asia/Shanghai (no user-configurable timezone)

### Platform Constraints

1. **Storage:** PostgreSQL size limits (typically managed by provider)
2. **Query Complexity:** SQL query complexity limits for aggregations
3. **Memory:** Rate limiting map stored in-memory (limited by server RAM)
4. **Concurrent Connections:** Connection pool size limits on DB

---

## Acceptance Criteria

### Authentication
- [ ] Password-based login with SHA-256 hashing
- [ ] 30-day session cookie with HttpOnly flag
- [ ] Rate limiting after N failed attempts
- [ ] Exponential backoff lockout duration

### Data Sync
- [ ] Fetch upstream usage data via GET/POST
- [ ] Validate all incoming data with Zod schemas
- [ ] Deduplicate records via unique index
- [ ] Support multiple auth methods (Bearer, cookie, password)

### Dashboard Visualization
- [ ] Display hourly trends with gap-filling
- [ ] Show per-model cost breakdown with pagination
- [ ] Render token composition pie chart
- [ ] Allow model pricing configuration via modal

### Data Exploration
- [ ] Multi-model scatter plot with color coding
- [ ] Area chart with token totals
- [ ] Series filtering toggles
- [ ] Zoom/pan controls

### Performance
- [ ] Overview API response <500ms
- [ ] Cache TTL 30 seconds with LRU eviction
- [ ] Support 14-90 day time ranges
- [ ] Downsample explore query to maxPoints limit

### Security
- [ ] All passwords hashed (no plaintext storage)
- [ ] Session cookies HttpOnly and secure
- [ ] Bearer token validation for cron jobs
- [ ] SQL injection prevention via ORM

---

## Development Roadmap

### Completed Features (v1.2.0)
- Core dashboard with multiple chart types
- Data sync from upstream API
- Login with rate limiting
- Model pricing configuration
- Explore page with multi-model analysis
- Logs viewer
- Vercel deployment with Cron

### Future Considerations

**v1.3.0 (Potential Enhancements)**
- Mobile-responsive design
- CSV/PDF export functionality
- Real-time data updates (WebSocket support)
- Multi-user access with RBAC
- Automated data retention policies
- Enhanced alert/notification system

**v1.4.0+ (Long-term Improvements)**
- Time-series forecasting (cost prediction)
- Anomaly detection for usage spikes
- Custom dashboard widgets
- API rate limiting analytics
- Integration with billing systems
- Multi-tenant support

---

## Risk Assessment

### High-Risk Items

1. **Data Loss:** No automated backup strategy for PostgreSQL
   - *Mitigation:* Document manual backup process; recommend managed Postgres services with built-in backups

2. **Performance Degradation:** Large datasets (>1M records) may cause query slowdowns
   - *Mitigation:* Implement data archiving strategy; add query indexing recommendations

3. **Rate Limiting Failure:** In-memory tracking resets on server restart
   - *Mitigation:* Move to Redis for persistence; document limitation

### Medium-Risk Items

1. **Timezone Issues:** Hardcoded Asia/Shanghai may not suit all deployments
   - *Mitigation:* Make timezone user-configurable in future release

2. **Single-Point-of-Failure Auth:** One password for all users
   - *Mitigation:* Implement multi-user RBAC for enterprise deployments

3. **Cache Invalidation:** 30-second TTL may be too long for fast-changing data
   - *Mitigation:* Allow configurable TTL via environment variables

### Low-Risk Items

1. **Mobile Support:** Not currently optimized but not critical for v1
   - *Mitigation:* Plan mobile redesign for v1.3

2. **WebSocket Latency:** Polling is sufficient for current use case
   - *Mitigation:* Evaluate WebSocket adoption if real-time requirements change

---

## Dependencies & Third-Party Services

### Required Services

- **PostgreSQL 16+** (self-managed or cloud provider)
- **CLIProxyAPI** (upstream data source)
- **Vercel** (optional, for Cron scheduling)

### Key Libraries

- Next.js 16, React 19, TypeScript 5.4
- Drizzle ORM, PostgreSQL driver
- Recharts for charting
- TailwindCSS for styling
- Zod for validation

---

## Configuration & Deployment

### Environment Variables Required

| Variable | Description |
|----------|-------------|
| CLIPROXY_SECRET_KEY | API key for CLIProxyAPI authentication |
| CLIPROXY_API_BASE_URL | Base URL of CLIProxyAPI server |
| DATABASE_URL | PostgreSQL connection string |
| PASSWORD | Dashboard login password (optional) |
| CRON_SECRET | Vercel Cron authentication token |

### Deployment Methods

1. **Vercel Deployment:** Recommended for Cron support
2. **Docker Compose:** Local development setup
3. **Self-hosted:** Node.js + PostgreSQL + reverse proxy

---

## Support & Maintenance

### Known Issues

None documented in v1.2.0.

### Unresolved Questions

From scout reports and exploration:

1. **Mobile Responsiveness:** Is mobile support planned?
2. **Real-time Updates:** Are WebSockets planned for real-time sync?
3. **Export Functionality:** Should users be able to export charts/data?
4. **Multi-user Support:** Should RBAC be considered?
5. **Data Retention:** What's the retention policy for historical data?
6. **Backup Strategy:** Is automated backup configured?
7. **Rate Limiting Persistence:** Should this move to Redis?
8. **Cache Headers:** Should HTTP cache headers be added?

---

## Release Notes & History

### v1.2.0 (Current)
- Stable production release
- All core features implemented
- Performance optimizations complete
- Security hardening complete

### v1.1.0 (Previous)
- Initial feature set
- Basic caching

### v1.0.0 (Foundation)
- Project foundation

---

## Contact & Escalation

For questions regarding this PDR or project direction, please refer to the project repository on GitHub.

