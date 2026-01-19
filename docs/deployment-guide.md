# Deployment Guide

**Version:** 1.2.0
**Last Updated:** January 2026
**Scope:** Production deployment, configuration, and troubleshooting

---

## Quick Start

### Local Development Setup

**Prerequisites:**
- Node.js 20+
- pnpm (or npm/yarn)
- Docker & Docker Compose (optional, for PostgreSQL)

**Steps:**

```bash
# 1. Clone repository
git clone https://github.com/sxjeru/CLIProxyAPI-Monitor.git
cd CLIProxyAPI-Monitor

# 2. Install dependencies
pnpm install

# 3. Setup environment
cp .env.example .env
# Edit .env with your values

# 4. Start PostgreSQL (optional if using managed database)
docker-compose up -d

# 5. Create database schema
pnpm run db:push

# 6. Sync initial data (optional)
curl -X POST http://localhost:3000/api/sync \
  -H "Authorization: Basic $(echo -n ':YOUR_PASSWORD' | base64)"

# 7. Start dev server
pnpm dev

# Dashboard available at http://localhost:3000
```

---

## Environment Variables

### Required Variables

| Variable | Type | Description | Example |
|----------|------|-------------|---------|
| CLIPROXY_SECRET_KEY | string | API key for CLIProxyAPI authentication | `sk-abc123xyz...` |
| CLIPROXY_API_BASE_URL | string | Base URL of CLIProxyAPI server | `https://your-cliproxy.com/` |
| DATABASE_URL | string | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| CRON_SECRET | string | Secret for Vercel Cron authentication | Random 16+ char string |

### Optional Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| PASSWORD | string | CLIPROXY_SECRET_KEY | Dashboard login password |
| NODE_ENV | string | production | Environment (development/production) |

### Base URL Normalization

The system automatically:
- Converts to HTTPS (if not already)
- Adds `/v0/management` suffix if missing
- Removes trailing slashes

**Examples:**
```
Input: https://api.clipproxy.com
Result: https://api.clipproxy.com/v0/management

Input: http://localhost:3000/v0/management/
Result: https://localhost:3000/v0/management (HTTP forced to HTTPS in prod)
```

---

## Local Development with Docker

### PostgreSQL Setup

Start managed PostgreSQL for development:

```bash
# Start container
docker-compose up -d

# Verify container running
docker-compose ps

# View logs
docker-compose logs postgres

# Stop container
docker-compose down

# Clean up data (warning: deletes all data)
docker-compose down -v
```

### Create Database Schema

```bash
# Generate migrations (if schema changes)
pnpm run db:generate

# Push schema to database
pnpm run db:push

# Reset database (development only!)
pnpm run db:reset
```

### Seed Initial Data (Optional)

```bash
# Trigger sync endpoint to fetch upstream data
curl -X POST http://localhost:3000/api/sync \
  -H "Authorization: Basic $(echo -n ':PASSWORD' | base64)" \
  -H "Content-Type: application/json"

# Verify data was synced
psql -U postgres -d cliproxy -c "SELECT COUNT(*) FROM usage_records;"
```

---

## Vercel Deployment

### Prerequisites

- Vercel account (free tier supported)
- GitHub repository with this project
- PostgreSQL database (Vercel Postgres or external)
- Environment variables configured

### Step 1: Create Vercel Project

```bash
# Option A: Via CLI
vercel --prod

# Option B: Via Dashboard
# 1. Go to https://vercel.com
# 2. Click "New Project"
# 3. Import GitHub repository
# 4. Select project root
```

### Step 2: Configure Environment Variables

In Vercel Dashboard:
1. Project Settings → Environment Variables
2. Add each variable from `.env.example`:
   - CLIPROXY_SECRET_KEY
   - CLIPROXY_API_BASE_URL
   - DATABASE_URL (or use Vercel Postgres)
   - PASSWORD (optional)
   - CRON_SECRET (required)

```bash
# Or via CLI
vercel env add CLIPROXY_SECRET_KEY
vercel env add CLIPROXY_API_BASE_URL
vercel env add DATABASE_URL
vercel env add CRON_SECRET
```

### Step 3: Setup Database

**Option A: Vercel Postgres (Recommended)**

```bash
# Create Postgres database in Vercel
vercel postgres create --cwd .

# This will populate DATABASE_URL automatically
```

**Option B: External PostgreSQL**

```bash
# Set DATABASE_URL to your external server
vercel env add DATABASE_URL

# Example: postgresql://user:pass@db.example.com:5432/cliproxy
```

### Step 4: Deploy

```bash
# Deploy to production
vercel --prod

# Or push to main branch (auto-deploy if configured)
git push origin main
```

The build script automatically:
1. Runs Drizzle migrations (`pnpm run db:push`)
2. Builds Next.js application
3. Registers Cron job

### Step 5: Verify Deployment

```bash
# Test dashboard access
curl https://your-app.vercel.app/

# Verify login required
# Should redirect to login page

# Test API endpoint
curl https://your-app.vercel.app/api/sync \
  -H "Authorization: Bearer ${CRON_SECRET}"

# Check Vercel dashboard for deployment status
# https://vercel.com/dashboard
```

---

## Vercel Cron Job Setup

### Automatic Configuration

`vercel.json` configures Cron job:

```json
{
  "crons": [{
    "path": "/api/sync",
    "schedule": "0 21 * * *"
  }]
}
```

**Schedule:** 9 PM UTC daily (customizable)

### Verify Cron Status

```bash
# View deployment with Cron
vercel deployments --prod

# Check recent runs in Vercel Dashboard
# Settings → Cron Jobs → View Executions

# Test Cron endpoint manually
curl -X POST https://your-app.vercel.app/api/sync \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json"
```

### Troubleshooting Cron

**Cron not running:**
- Verify CRON_SECRET is set in environment
- Check Vercel deployment succeeded
- Ensure `/api/sync` route exists
- Verify database connectivity

**Rate limiting:**
- Cron uses Bearer token auth (separate from user passwords)
- Each Cron request is logged separately
- Check `/api/logs` for sync execution logs

---

## PostgreSQL Setup & Management

### Connection String Format

```
postgresql://[user[:password]@][host][:port][/dbname][?param=value]
```

**Example:**
```
postgresql://postgres:password@localhost:5432/cliproxy
postgresql://user@db.vercel.com/dbname?sslmode=require
```

### Vercel Postgres

```bash
# Create database
vercel postgres create --cwd .

# Connect via psql
psql $(vercel env pull | grep DATABASE_URL)

# Or using connection string
psql postgresql://user:pass@db.vercel.com/dbname?sslmode=require
```

### External PostgreSQL

**AWS RDS:**
```
postgresql://admin:password@db.123456789.us-east-1.rds.amazonaws.com:5432/cliproxy
```

**DigitalOcean Managed:**
```
postgresql://doadmin:password@db.ondigitalocean.com:25060/cliproxy?sslmode=require
```

**Self-hosted:**
```
postgresql://postgres:password@192.168.1.100:5432/cliproxy
```

### Database Backups

#### Manual Backup

```bash
# Dump entire database
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# Dump usage_records table only
pg_dump --table=usage_records $DATABASE_URL > usage-backup.sql

# Backup file size check
du -sh backup-*.sql
```

#### Automated Backup (Using cron)

```bash
# Add to crontab
0 2 * * * pg_dump $DATABASE_URL > /backups/db-$(date +\%Y\%m\%d).sql

# Keep last 30 days
find /backups -name "db-*.sql" -mtime +30 -delete
```

#### Restore from Backup

```bash
# Restore entire database
psql $DATABASE_URL < backup-20260119.sql

# Restore specific table
psql $DATABASE_URL < usage-backup.sql
```

### Database Monitoring

```bash
# Connect to database
psql $DATABASE_URL

# View table sizes
\d+ usage_records
\dt+ model_prices

# Count records
SELECT COUNT(*) FROM usage_records;
SELECT COUNT(*) FROM model_prices;

# View recent data
SELECT * FROM usage_records ORDER BY occurred_at DESC LIMIT 10;

# Check for duplicates (should return 0)
SELECT COUNT(*) FROM usage_records
GROUP BY occurred_at, route, model
HAVING COUNT(*) > 1;

# Database size
SELECT pg_size_pretty(pg_database_size('cliproxy'));

# Disconnect
\q
```

---

## SSL/TLS Configuration

### Vercel (Automatic)

- HTTPS automatic for `*.vercel.app` domains
- Custom domains use Let's Encrypt automatically
- No manual configuration needed

### Custom Domain

```bash
# Add custom domain in Vercel Dashboard
# Settings → Domains → Add Custom Domain

# Configure DNS to point to Vercel
# Add CNAME record:
# CNAME yourdomain.com vercel.app
```

### Self-hosted with Nginx

```nginx
server {
  listen 443 ssl;
  server_name your-app.com;

  ssl_certificate /path/to/cert.pem;
  ssl_certificate_key /path/to/key.pem;

  location / {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

---

## Build & Deployment Scripts

### Build Command

```bash
# Development build
pnpm build

# This runs:
# 1. node scripts/migrate.mjs (Drizzle migrations)
# 2. next build

# Optimized for Vercel (runs automatically)
```

### Start Command

```bash
# Production server
pnpm start

# Starts Next.js server on :3000
```

### Lint Command

```bash
# Check code quality
pnpm lint

# Run before committing code
```

---

## Troubleshooting

### Common Issues

#### 1. Database Connection Error

**Error:** `Error: connect ECONNREFUSED 127.0.0.1:5432`

**Solutions:**
- Verify PostgreSQL running: `docker-compose ps`
- Check DATABASE_URL is correct
- Ensure credentials match database
- Test connection: `psql $DATABASE_URL`

#### 2. Migration Failed

**Error:** `Drizzle: migration file 0001_*.sql not found`

**Solutions:**
```bash
# Regenerate migrations
pnpm run db:generate

# Push migrations
pnpm run db:push

# Check migration status
psql $DATABASE_URL -c "SELECT * FROM drizzle_schema_migrations;"
```

#### 3. Login Not Working

**Error:** `401 Unauthorized` or `Invalid password`

**Solutions:**
- Verify PASSWORD or CLIPROXY_SECRET_KEY set
- Check password is correctly hashed on server
- Clear browser cookies: Inspect → Application → Cookies
- Try incognito/private window

#### 4. Cron Job Not Executing

**Error:** Sync not running at scheduled time

**Solutions:**
```bash
# Verify Cron configuration
cat vercel.json | grep -A 5 "crons"

# Check Cron Secret is set
vercel env ls | grep CRON_SECRET

# Test endpoint directly
curl -X POST https://your-app.vercel.app/api/sync \
  -H "Authorization: Bearer ${CRON_SECRET}"

# Check logs
vercel logs https://your-app.vercel.app
```

#### 5. Charts Not Showing Data

**Error:** Empty dashboard, no data visible

**Solutions:**
```bash
# Verify data in database
psql $DATABASE_URL -c "SELECT COUNT(*) FROM usage_records;"

# Manually trigger sync
curl -X POST http://localhost:3000/api/sync \
  -H "Authorization: Basic $(echo -n ':PASSWORD' | base64)"

# Check API response
curl http://localhost:3000/api/overview \
  -H "Cookie: dashboard_auth=..."

# Verify upstream API is accessible
curl https://your-cliproxy.com/v0/management/usage \
  -H "Authorization: Bearer ${CLIPROXY_SECRET_KEY}"
```

#### 6. High Memory Usage

**Error:** Memory limit exceeded, container restarting

**Solutions:**
- Reduce cache size: Lower LRU eviction threshold
- Implement data archiving for old records
- Use read-only replicas for analytics queries
- Monitor with `vercel analytics`

### Performance Issues

#### Slow Dashboard Load

```bash
# Check query performance
# In Postgres:
EXPLAIN ANALYZE
SELECT DATE_TRUNC('hour', occurred_at) as hour, COUNT(*) as requests
FROM usage_records
WHERE occurred_at >= NOW() - INTERVAL '14 days'
GROUP BY 1
ORDER BY 1 DESC;

# Look for sequential scans instead of index scans
# Add indexes if needed
CREATE INDEX idx_usage_records_occurred_at ON usage_records(occurred_at DESC);
```

#### High CPU Usage

```bash
# Monitor running processes
top -pid $(pgrep node)

# Check Next.js build size
du -sh .next/

# Reduce bundle: Remove unused dependencies
pnpm audit
pnpm prune --production
```

---

## Monitoring & Logging

### Application Logs

```bash
# View Vercel logs
vercel logs https://your-app.vercel.app

# Follow logs in real-time
vercel logs -f https://your-app.vercel.app

# Filter by error level
vercel logs --level error https://your-app.vercel.app
```

### Database Logs

PostgreSQL logs (if available):

```bash
# View server logs (if exposed)
psql $DATABASE_URL -c "SELECT * FROM pg_stat_statements LIMIT 10;"
```

### Performance Metrics

```bash
# Vercel Analytics
# Dashboard → Analytics → View detailed metrics

# Key metrics to monitor:
# - First Contentful Paint (FCP)
# - Cumulative Layout Shift (CLS)
# - API response time
# - Database query time
```

---

## Scaling Considerations

### Horizontal Scaling

```bash
# Deploy multiple Vercel instances
# All pointing to same PostgreSQL database

# Each instance is independent:
# - Cache is local (not shared)
# - Auth is stateless
# - Database is single source of truth
```

### Vertical Scaling

```bash
# Upgrade PostgreSQL instance
# Vercel Postgres → Pro plan
# or External database → Larger instance type

# Increase Node.js memory limit
# Vercel Pro → Higher function memory
```

### Data Archiving

For production systems with large datasets:

```sql
-- Archive old records to separate table
CREATE TABLE usage_records_archive AS
SELECT * FROM usage_records
WHERE occurred_at < NOW() - INTERVAL '90 days';

DELETE FROM usage_records
WHERE occurred_at < NOW() - INTERVAL '90 days';
```

---

## Security Checklist

- [ ] All environment variables set securely
- [ ] PASSWORD is strong (16+ characters)
- [ ] CRON_SECRET is random (16+ characters)
- [ ] DATABASE_URL uses HTTPS (sslmode=require for external)
- [ ] Vercel project set to private/pro
- [ ] Domain has HTTPS enabled
- [ ] No credentials in git repository
- [ ] Regular backups configured
- [ ] Rate limiting is active
- [ ] Session cookies are HttpOnly

---

## Post-Deployment Checklist

- [ ] Dashboard accessible without errors
- [ ] Login works with PASSWORD
- [ ] Data displays in charts
- [ ] Cron job scheduled and verified
- [ ] First sync completed successfully
- [ ] Model pricing configured
- [ ] Logs page shows recent data
- [ ] Theme toggle works (dark/light mode)
- [ ] Mobile browser compatibility tested
- [ ] Database backup strategy documented

---

## Rollback Procedure

If deployment fails:

```bash
# Revert to previous deployment
vercel rollback

# Or manually rollback database
psql $DATABASE_URL < backup-20260118.sql

# Redeploy
vercel --prod
```

---

## Support Resources

- **Repository:** https://github.com/sxjeru/CLIProxyAPI-Monitor
- **Issues:** GitHub Issues for bug reports
- **Documentation:** See `./docs` directory
- **Vercel Docs:** https://vercel.com/docs
- **Next.js Docs:** https://nextjs.org/docs
- **PostgreSQL Docs:** https://www.postgresql.org/docs/

