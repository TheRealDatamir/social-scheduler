# CLAUDE.md - AI Assistant Guidelines

This file contains conventions and guidelines for AI assistants working on this codebase.

## Naming Conventions

### camelCase Everywhere
This is an all-JavaScript/TypeScript project (Next.js). Use **camelCase** consistently across:
- API request/response JSON
- React components and props
- TypeScript interfaces
- Database schema fields

```typescript
// API Response
{
  "id": 1,
  "imageUrl": "https://...",
  "scheduledAt": "2026-01-25T12:00:00Z",
  "platformPostId": "12345"
}

// TypeScript Interface
interface Post {
  id: number;
  imageUrl: string;
  scheduledAt: Date;
  platformPostId: string;
}

// Drizzle Schema
export const posts = sqliteTable("posts", {
  imageUrl: text("image_url").notNull(),
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }),
});
```

**Note:** Drizzle column names in the database can be snake_case (SQL convention), but the TypeScript field names should be camelCase.

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
│   └── api/           # API routes
│       ├── posts/     # CRUD for scheduled posts
│       ├── publish/   # Cron endpoint for publishing
│       └── settings/  # User settings
├── components/        # React components
├── db/
│   ├── schema.ts      # Drizzle schema
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
