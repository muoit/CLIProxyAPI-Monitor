# CLIProxyAPI-Monitor Documentation Index

Welcome to the comprehensive documentation for CLIProxyAPI-Monitor v1.2.0.

## Quick Navigation

### For New Developers
1. Start with [README.md](../README.md) - Quick overview and getting started
2. Read [Code Standards](./code-standards.md) - Code conventions and patterns
3. Reference [Codebase Summary](./codebase-summary.md) - Directory structure and modules
4. Study [Deployment Guide](./deployment-guide.md) - Local setup instructions

### For Architects
1. Review [System Architecture](./system-architecture.md) - Design and data flows
2. Check [Project Overview & PDR](./project-overview-pdr.md) - Requirements and constraints
3. Reference [Codebase Summary](./codebase-summary.md) - Implementation details

### For DevOps/Operations
1. Follow [Deployment Guide](./deployment-guide.md) - Complete deployment procedures
2. Check [System Architecture](./system-architecture.md) - Monitoring and scaling
3. Reference [Code Standards](./code-standards.md) - Security checklist

### For Product Managers
1. Read [Project Overview & PDR](./project-overview-pdr.md) - Features and metrics
2. Check [System Architecture](./system-architecture.md) - Performance characteristics
3. Review [Deployment Guide](./deployment-guide.md) - Release procedures

---

## Documentation Overview

### [README.md](../README.md) (145 LOC)
**Quick Start & Feature Overview**
- 1-minute project summary
- Core features list
- Local development steps (5 commands)
- Vercel deployment (3 steps)
- Tech stack summary
- FAQ (4 common questions)

### [Project Overview & PDR](./project-overview-pdr.md) (418 LOC)
**Product Development Requirements**
- Problem statement and user profiles
- v1.2.0 feature specifications
- Non-functional requirements (performance, security, scalability)
- Technical constraints and limitations
- Success metrics and KPIs
- Risk assessment (high/medium/low)
- Unresolved questions for team discussion
- Future roadmap (v1.3, v1.4+)

### [System Architecture](./system-architecture.md) (732 LOC)
**High-Level System Design**
- Three-tier architecture overview
- Component architecture (frontend, backend, database)
- 5 detailed data flow diagrams (ingestion, dashboard, explore, auth, caching)
- Authentication & authorization flows
- Performance optimization strategies (query parallelization, indexing, caching)
- Deployment architecture (Vercel, Docker, environment)
- Data consistency & integrity strategies
- Security threat model with mitigations
- Scalability considerations and bottlenecks
- Architecture decision records (3 ADRs)

### [Code Standards](./code-standards.md) (845 LOC)
**Development Standards & Best Practices**
- TypeScript configuration and strict mode
- Naming conventions (files, variables, types, functions, components)
- File organization structure
- Component patterns (page, client, server, API route handlers)
- Database & ORM patterns (Drizzle examples)
- Validation patterns (Zod schemas)
- Error handling (API responses, try-catch, frontend display)
- Import patterns and conventions
- Styling with TailwindCSS (utilities, dark mode, responsive)
- State management (hooks, useMemo, useCallback)
- Testing standards (unit, integration)
- Security standards (passwords, cookies, input validation)
- Performance standards (code splitting, data fetching)
- Documentation standards (comments, JSDoc)
- Git conventions and commit messages
- Code review checklist (10 items)

### [Codebase Summary](./codebase-summary.md) (487 LOC)
**Directory Structure & Module Reference**
- Project overview with tech stack
- Complete directory tree with LOC counts
- Key modules table (pages, API routes, database)
- Core components (Sidebar, Modal, ClientLayout)
- API routes specification table
- Database schema (2 tables) with indexes
- Authentication & authorization methods
- Data flow pipelines (5 pipelines)
- Performance optimization strategies
- Internationalization & localization (Chinese, Shanghai timezone)
- Styling & theming system
- Error handling patterns
- Security implementation details
- Dependencies list with versions
- Architectural patterns (9 patterns)
- Notable implementation details

### [Deployment Guide](./deployment-guide.md) (724 LOC)
**Operational & Deployment Procedures**
- Quick start for local development (6 steps)
- Environment variables reference (4 required, 2 optional)
- Local development with Docker (setup, schema, seed data)
- Vercel deployment (5-step walkthrough)
- PostgreSQL setup & management (connection, backups, restore, monitoring)
- SSL/TLS configuration (Vercel, custom domain, self-hosted)
- Build & deployment scripts explained
- Troubleshooting (6 common issues with solutions)
- Performance issues (query optimization, CPU monitoring)
- Monitoring & logging strategies
- Scaling considerations (horizontal, vertical, archiving)
- Security checklist (10 items)
- Post-deployment checklist (10 items)
- Rollback procedures

---

## Document Statistics

| Document | Lines | Category | Last Updated |
|----------|-------|----------|--------------|
| README.md | 145 | Quick Start | Jan 19, 2026 |
| project-overview-pdr.md | 418 | Requirements | Jan 19, 2026 |
| system-architecture.md | 732 | Architecture | Jan 19, 2026 |
| code-standards.md | 845 | Standards | Jan 19, 2026 |
| codebase-summary.md | 487 | Reference | Jan 19, 2026 |
| deployment-guide.md | 724 | Operations | Jan 19, 2026 |
| **Total** | **3,351** | - | - |

---

## Key Features Documented

### Architecture & Design
- 3-tier system architecture (Presentation, Application, Data)
- 5 data flow diagrams with implementation details
- Query parallelization strategy (Promise.all 9 queries)
- Caching architecture (30-second TTL, LRU eviction, 100 max entries)
- Authentication flow (SHA-256 hashing, HttpOnly cookies, rate limiting)

### Code Organization
- Feature-based directory structure
- Clear separation of concerns (components, API routes, queries)
- Type-safe patterns (TypeScript strict mode, Zod validation)
- Consistent naming conventions (kebab-case files, camelCase functions)

### Performance
- Parallel query execution
- Route-level caching with LRU eviction
- Deterministic sampling via window functions
- Pagination support (5-500 per page)
- Component-level memoization

### Security
- Password hashing with Web Crypto API
- HttpOnly session cookies with SameSite flag
- IP-based rate limiting with exponential backoff
- Bearer token authentication for cron jobs
- SQL injection prevention via Drizzle ORM

### Operational Excellence
- Docker local development setup
- Vercel deployment with automated Cron
- Database backup strategies
- Monitoring and logging guidelines
- Scaling considerations and bottlenecks

---

## Common Tasks

### Setting Up Local Development
→ See [Deployment Guide - Quick Start](./deployment-guide.md#quick-start)

### Deploying to Vercel
→ See [Deployment Guide - Vercel Deployment](./deployment-guide.md#vercel-deployment)

### Understanding the Architecture
→ See [System Architecture](./system-architecture.md)

### Writing Code
→ See [Code Standards](./code-standards.md)

### Understanding the Codebase
→ See [Codebase Summary](./codebase-summary.md)

### Troubleshooting Issues
→ See [Deployment Guide - Troubleshooting](./deployment-guide.md#troubleshooting)

### Implementing New Features
→ See [Project Overview & PDR](./project-overview-pdr.md#development-roadmap)

---

## Version Information

**Documentation Version:** 1.2.0
**Project Version:** 1.2.0
**Created:** January 19, 2026
**Status:** Complete & Production-Ready

---

## Feedback & Updates

These documents should be kept in sync with code changes:
- Feature implementations → Update [Project Overview & PDR](./project-overview-pdr.md)
- Architecture changes → Update [System Architecture](./system-architecture.md)
- Code patterns → Update [Code Standards](./code-standards.md)
- Deployment process → Update [Deployment Guide](./deployment-guide.md)

For questions or suggestions, refer to the project repository on GitHub.

