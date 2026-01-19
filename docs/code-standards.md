# Code Standards & Guidelines

**Version:** 1.2.0
**Last Updated:** January 2026
**Language:** TypeScript 5.4.5 (Strict Mode)
**Framework:** Next.js 16 (App Router)

---

## TypeScript Configuration

### Compiler Settings

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "strict": true,              // No implicit any
    "skipLibCheck": true,
    "esModuleInterop": true,
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]              // Root import aliases
    },
    "jsx": "react-jsx"
  },
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules", ".next", "dist"]
}
```

### Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Files | kebab-case | `model-pricing-form.tsx`, `api-routes.ts` |
| Variables | camelCase | `const usageOverview = ...` |
| Constants | SCREAMING_SNAKE_CASE | `const MAX_CACHE_ENTRIES = 100` |
| Types/Interfaces | PascalCase | `interface UsageOverview { }` |
| Functions | camelCase | `function formatCurrency(...) { }` |
| React Components | PascalCase | `export function Sidebar() { }` |
| Exports | Consistent with type | Export types as PascalCase, functions as camelCase |
| Enums | PascalCase | `enum AuthMethod { ... }` |
| Classes | PascalCase | `class DataProcessor { }` |

### File Organization

**Directory Structure:**
```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx           # Route component
│   ├── layout.tsx         # Layout wrapper
│   ├── components/        # Page-specific components
│   └── api/               # API route handlers
├── lib/                   # Shared utilities & business logic
│   ├── config.ts          # Configuration
│   ├── types.ts           # TypeScript types
│   ├── utils.ts           # Utility functions
│   ├── db/                # Database layer
│   │   ├── client.ts      # Drizzle instance
│   │   └── schema.ts      # Table definitions
│   └── queries/           # Query functions
│       ├── overview.ts
│       └── explore.ts
└── proxy.ts               # Middleware
```

---

## Component Patterns

### Page Components

All page components must:
1. Be located in `app/*/page.tsx`
2. Use "use client" directive if they require interactivity
3. Follow Next.js App Router conventions
4. Export as default

**Pattern:**
```typescript
"use client";

import { useState } from "react";
import type { ReactNode } from "react";

interface PageProps {
  params: Record<string, string | string[]>;
  searchParams: Record<string, string | string[]>;
}

export default function DashboardPage(props: PageProps): ReactNode {
  const [state, setState] = useState<DataType>(initialValue);

  return (
    <div className="space-y-4">
      {/* Page content */}
    </div>
  );
}
```

### Client Components

Client components marked with "use client":
- Handle all interactive state
- Use React hooks (useState, useCallback, useMemo, useEffect)
- Fetch data via `fetch()` or custom hooks
- Never export async functions (only server components)

**Pattern:**
```typescript
"use client";

import type { ReactNode } from "react";
import { useState, useCallback, useMemo } from "react";

interface ComponentProps {
  title: string;
  onUpdate?: (value: unknown) => void;
}

export function MyComponent({ title, onUpdate }: ComponentProps): ReactNode {
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(async () => {
    setLoading(true);
    try {
      // Logic here
    } finally {
      setLoading(false);
    }
  }, [onUpdate]);

  const computed = useMemo(() => {
    // Expensive calculation
  }, [loading]);

  return <button onClick={handleClick}>{title}</button>;
}
```

### Server Components

Server components (default in app/):
- Fetch data directly without fetch() calls
- No useState, useEffect, or other hooks
- Can be async
- Pass data to child client components

**Pattern:**
```typescript
import type { ReactNode } from "react";
import { getOverview } from "@/lib/queries/overview";

interface LayoutProps {
  children: ReactNode;
}

export default async function RootLayout({ children }: LayoutProps) {
  const overview = await getOverview();

  return (
    <html>
      <body>
        <Sidebar overview={overview} />
        {children}
      </body>
    </html>
  );
}
```

### API Route Handlers

API routes follow REST conventions:
- Named exports for HTTP methods: `GET`, `POST`, `DELETE`, `PUT`
- Request type: `NextRequest`
- Response type: `NextResponse` or `Response`
- Validate input with Zod schemas
- Always include error handling

**Pattern:**
```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const RequestSchema = z.object({
  model: z.string().min(1),
  price: z.number().positive(),
});

type RequestBody = z.infer<typeof RequestSchema>;

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    const data = RequestSchema.parse(body);

    // Process data
    const result = await updatePrice(data);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const data = await fetchPrices();
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error("Error in GET /api/prices:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

---

## Database & ORM Patterns

### Drizzle ORM

All database operations use Drizzle ORM for type safety:

**Schema Definition:**
```typescript
// lib/db/schema.ts
import { pgTable, serial, text, numeric, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const usageRecords = pgTable(
  "usage_records",
  {
    id: serial("id").primaryKey(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow(),
    route: text("route").notNull(),
    model: text("model").notNull(),
    totalTokens: integer("total_tokens").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    reasoningTokens: integer("reasoning_tokens").default(0),
    cachedTokens: integer("cached_tokens").default(0),
    totalRequests: integer("total_requests").notNull(),
    successCount: integer("success_count").notNull(),
    failureCount: integer("failure_count").notNull(),
    isError: boolean("is_error").default(false),
    raw: text("raw").notNull(),
  },
  (table) => ({
    uniqueKey: sql`UNIQUE (${table.occurredAt}, ${table.route}, ${table.model})`,
  })
);
```

**Query Pattern:**
```typescript
import { db } from "@/lib/db/client";
import { usageRecords, modelPrices } from "@/lib/db/schema";
import { sum, count, desc, sql } from "drizzle-orm";

export async function getOverview(daysInput: number = 14) {
  const startDate = new Date(Date.now() - daysInput * 24 * 60 * 60 * 1000);

  // Parallel queries using Promise.all()
  const [totals, byModel, byDay] = await Promise.all([
    db
      .select({
        totalRequests: sum(usageRecords.totalRequests),
        totalTokens: sum(usageRecords.totalTokens),
      })
      .from(usageRecords)
      .where(sql`${usageRecords.occurredAt} >= ${startDate}`),

    db
      .select({
        model: usageRecords.model,
        requests: sum(usageRecords.totalRequests),
        tokens: sum(usageRecords.totalTokens),
      })
      .from(usageRecords)
      .groupBy(usageRecords.model)
      .orderBy(desc(sum(usageRecords.totalTokens))),

    db
      .select({
        date: sql`DATE(${usageRecords.occurredAt} AT TIME ZONE 'Asia/Shanghai')`,
        requests: sum(usageRecords.totalRequests),
      })
      .from(usageRecords)
      .groupBy(sql`DATE(${usageRecords.occurredAt} AT TIME ZONE 'Asia/Shanghai')`),
  ]);

  return { totals, byModel, byDay };
}
```

---

## Validation Patterns

### Zod Schemas

All input validation uses Zod for runtime type checking:

**Pattern:**
```typescript
import { z } from "zod";

// Define schema
const UsageRecordSchema = z.object({
  occurredAt: z.string().datetime(),
  route: z.string().min(1),
  model: z.string().min(1),
  totalTokens: z.number().int().positive(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  reasoningTokens: z.number().int().nonnegative().optional().default(0),
  cachedTokens: z.number().int().nonnegative().optional().default(0),
});

// Export type from schema
export type UsageRecord = z.infer<typeof UsageRecordSchema>;

// Validate at runtime
function processData(input: unknown): UsageRecord {
  return UsageRecordSchema.parse(input); // Throws ZodError on invalid input
}

// Or use safe parse for error handling
function safeProcessData(input: unknown): UsageRecord | null {
  const result = UsageRecordSchema.safeParse(input);
  if (!result.success) {
    console.error("Validation error:", result.error.errors);
    return null;
  }
  return result.data;
}
```

---

## Error Handling

### API Error Responses

Consistent error response format:

```typescript
// Success response
{
  "data": { /* ... */ },
  "status": 200
}

// Error response
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": { /* context-specific info */ },
  "status": 400|401|404|500
}
```

### Try-Catch Pattern

```typescript
export async function fetchAndProcessData() {
  try {
    const response = await fetch("/api/data");

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const validated = MySchema.parse(data);

    return validated;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("Validation error:", error.errors);
      throw new Error("Data validation failed");
    }

    if (error instanceof TypeError) {
      console.error("Network error:", error.message);
      throw new Error("Network request failed");
    }

    console.error("Unexpected error:", error);
    throw error;
  }
}
```

### Frontend Error Display

```typescript
"use client";

import { useState } from "react";
import type { ReactNode } from "react";

export function DataFetch(): ReactNode {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFetch = async () => {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/data");
      if (!res.ok) {
        throw new Error(`Failed to fetch: ${res.statusText}`);
      }
      const data = await res.json();
      // Process data
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {error && (
        <div className="rounded bg-red-100 p-4 text-red-800">
          {error}
        </div>
      )}
      <button onClick={handleFetch} disabled={loading}>
        {loading ? "Loading..." : "Fetch Data"}
      </button>
    </div>
  );
}
```

---

## Import Patterns

### Module Imports

```typescript
// Use path aliases for root imports
import { formatCurrency } from "@/lib/utils";
import { getOverview } from "@/lib/queries/overview";
import { usageRecords } from "@/lib/db/schema";

// Relative imports only for sibling files within same directory
import { Modal } from "./Modal";
import { Sidebar } from "./Sidebar";

// Type imports use 'type' keyword to clarify intent
import type { UsageOverview } from "@/lib/types";
import type { ReactNode } from "react";

// Avoid default exports except for Next.js page/layout files
export function MyComponent() { }
export const myConstant = "value";
```

### React Imports

```typescript
// Modern React imports (no React namespace needed)
import { useState, useCallback, useMemo } from "react";
import type { ReactNode } from "react";

// Component imports
import { Modal } from "@/app/components/Modal";
```

---

## Styling Patterns

### TailwindCSS Conventions

All styling uses TailwindCSS utility classes:

```typescript
export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      {children}
    </div>
  );
}
```

### Theme Support

Always include dark mode variants:

```typescript
<div className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100">
  Dark mode aware content
</div>
```

### Responsive Design

Use responsive prefixes for mobile-first approach:

```typescript
<div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-4 md:space-x-8">
  Responsive layout
</div>
```

---

## State Management

### Local State Only

Use React hooks for component-level state management:

```typescript
"use client";

import { useState, useCallback } from "react";

export function DataTable() {
  const [sortBy, setSortBy] = useState<"name" | "date">("name");
  const [page, setPage] = useState(1);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  const handleSort = useCallback((key: "name" | "date") => {
    setSortBy(key);
    setPage(1); // Reset to first page on sort
  }, []);

  return (
    <table>
      {/* Table implementation */}
    </table>
  );
}
```

### Memoization

Use `useMemo` for expensive calculations:

```typescript
const memoizedColors = useMemo(() => {
  return generateColorPalette(modelCount);
}, [modelCount]);

const memoizedData = useMemo(() => {
  return data.filter(d => d.date >= startDate).sort((a, b) => b.cost - a.cost);
}, [data, startDate]);
```

Use `useCallback` for event handlers passed to children:

```typescript
const handleUpdate = useCallback((id: string, value: unknown) => {
  setData(prev => prev.map(d => d.id === id ? { ...d, value } : d));
}, []);
```

---

## Testing Standards

### Unit Tests

Test functions should:
- Be collocated in `*.test.ts` files
- Use descriptive names: `test("should format currency with 2 decimals", ...)`
- Test both success and error cases
- Mock external dependencies

```typescript
// lib/utils.test.ts
import { describe, it, expect } from "vitest";
import { formatCurrency } from "./utils";

describe("formatCurrency", () => {
  it("should format positive numbers as USD", () => {
    expect(formatCurrency(1234.56)).toBe("$1,234.56");
  });

  it("should handle zero", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("should format negative numbers with minus sign", () => {
    expect(formatCurrency(-100.50)).toBe("-$100.50");
  });
});
```

### Integration Tests

Integration tests should verify:
- API route handlers with real Drizzle queries
- Zod validation
- Error handling
- Authentication middleware

---

## Security Standards

### Password Handling

```typescript
// Client-side encoding
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
}

// Server-side comparison (constant-time)
function comparePasswords(provided: string, stored: string): boolean {
  const providedBytes = new TextEncoder().encode(provided);
  const storedBytes = new TextEncoder().encode(stored);

  if (providedBytes.length !== storedBytes.length) return false;

  let result = 0;
  for (let i = 0; i < providedBytes.length; i++) {
    result |= providedBytes[i] ^ storedBytes[i];
  }
  return result === 0;
}
```

### Cookie Security

```typescript
// Set secure cookies
res.cookies.set({
  name: "dashboard_auth",
  value: hashedPassword,
  maxAge: 30 * 24 * 60 * 60,        // 30 days
  httpOnly: true,                    // No JavaScript access
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",                   // CSRF protection
  path: "/",
});
```

### Input Validation

Always validate untrusted input:

```typescript
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = RequestSchema.parse(body);
    // Process validated data only
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input" },
        { status: 400 }
      );
    }
  }
}
```

---

## Performance Standards

### Code Splitting

Use dynamic imports for large components:

```typescript
import dynamic from "next/dynamic";

const LargeChart = dynamic(() => import("@/app/components/LargeChart"), {
  loading: () => <div>Loading chart...</div>,
});

export function Dashboard() {
  return <LargeChart />;
}
```

### Data Fetching

Cache API responses appropriately:

```typescript
// Cache on server
export async function getOverview(daysInput: number) {
  const cacheKey = `overview-${daysInput}`;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < 30000) {
    return cached.data;
  }

  const data = await queryDatabase();
  cache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}

// Avoid refetching on client
"use client";

export function useDataWithCache(url: string) {
  const [data, setData] = useState<unknown>(null);

  useEffect(() => {
    const cachedData = sessionStorage.getItem(url);
    if (cachedData) {
      setData(JSON.parse(cachedData));
      return;
    }

    fetch(url)
      .then(r => r.json())
      .then(d => {
        sessionStorage.setItem(url, JSON.stringify(d));
        setData(d);
      });
  }, [url]);

  return data;
}
```

---

## Documentation Standards

### Code Comments

Write comments only for complex logic (avoid obvious comments):

```typescript
// Good: Explains why
// Using row_number() for deterministic sampling ensures same data points
// are selected if query is re-run, improving cache hit rates
const sampled = sql`SELECT * FROM usage_records WHERE row_number() % ${step} = 0`;

// Bad: Explains what (obvious from code)
// Increment the counter by one
counter++;
```

### JSDoc for Public APIs

```typescript
/**
 * Aggregates usage data for the dashboard.
 * @param daysInput - Number of days to aggregate (1-90, default 14)
 * @param opts - Optional filters and pagination
 * @returns Aggregated usage overview with metadata
 * @throws Error if database connection fails
 */
export async function getOverview(
  daysInput?: number,
  opts?: OverviewOptions
): Promise<UsageOverviewResponse> {
  // Implementation
}
```

---

## Git & Version Control

### Commit Message Format

Use conventional commits:

```
type(scope): subject

- type: feat|fix|docs|style|refactor|perf|test|chore
- scope: module or feature affected
- subject: lowercase, imperative, no period
```

**Examples:**
```
feat(dashboard): add hourly trend chart
fix(auth): prevent timing attacks in password comparison
docs(readme): update deployment instructions
refactor(queries): extract common aggregation logic
perf(cache): implement LRU eviction policy
```

### Commit Hygiene

- Commits should be atomic (one logical change)
- No console logs or debug code
- No credentials or secrets
- Run `pnpm lint` before committing

---

## Review Checklist

Before submitting code for review:

- [ ] All types properly annotated (no implicit `any`)
- [ ] Error handling implemented (try-catch or error boundaries)
- [ ] Input validation applied (Zod schemas)
- [ ] No console.log or debugger statements
- [ ] Tests written and passing
- [ ] ESLint passes (`pnpm lint`)
- [ ] No secrets in code
- [ ] Component props typed
- [ ] Comments explain "why", not "what"
- [ ] File names follow kebab-case convention
- [ ] Imports use path aliases or relative paths correctly

