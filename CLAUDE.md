# CLAUDE.md - AI Assistant Guidelines

This file contains conventions and guidelines for AI assistants working on this codebase.

## Naming Conventions

### API Layer (snake_case)
All API endpoints should use **snake_case** for JSON field names:
```json
{
  "id": 1,
  "image_url": "https://...",
  "scheduled_at": "2026-01-25T12:00:00Z",
  "platform_post_id": "12345"
}
```

### Frontend/TypeScript (camelCase)
All frontend code, React components, and internal TypeScript should use **camelCase**:
```typescript
interface Post {
  id: number;
  imageUrl: string;
  scheduledAt: Date;
  platformPostId: string;
}
```

### Database Schema (camelCase)
Drizzle schema uses camelCase internally, matching TypeScript conventions:
```typescript
export const posts = sqliteTable("posts", {
  imageUrl: text("image_url").notNull(),
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }),
});
```

### Conversion
API routes are responsible for converting between camelCase (internal) and snake_case (API response).
Use helper functions like `toSnakeCase()` in route handlers.

## Tech Stack
- **Framework:** Next.js 15 (App Router)
- **Database:** Turso (SQLite edge database)
- **ORM:** Drizzle
- **Hosting:** Vercel
- **Platform:** Instagram (Meta Graph API)

## Project Structure
```
src/
├── app/
│   └── api/           # API routes (snake_case responses)
│       ├── posts/     # CRUD for scheduled posts
│       ├── publish/   # Cron endpoint for publishing
│       └── settings/  # User settings
├── components/        # React components (camelCase)
├── db/
│   ├── schema.ts      # Drizzle schema (camelCase)
│   └── index.ts       # DB client
└── lib/
    └── instagram.ts   # Instagram API client
```

## Environment Variables
Required in `.env.local` and Vercel:
- `TURSO_DATABASE_URL` - Turso connection string
- `TURSO_AUTH_TOKEN` - Turso auth token
- `INSTAGRAM_BUSINESS_ACCOUNT_ID` - Instagram account ID (pending)
- `INSTAGRAM_ACCESS_TOKEN` - Meta Graph API token (pending)
- `CRON_SECRET` - Optional secret to protect /api/publish
