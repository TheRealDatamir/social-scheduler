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
- **Auth:** NextAuth.js v5 with Facebook OAuth
- **Platform:** Instagram (Meta Graph API)

## Project Structure
```
src/
├── app/
│   ├── api/           # API routes
│   │   ├── auth/      # NextAuth API routes
│   │   ├── posts/     # CRUD for scheduled posts
│   │   ├── publish/   # Cron endpoint for publishing
│   │   ├── settings/  # User settings
│   │   └── upload/    # File upload
│   ├── login/         # Login page
│   └── page.tsx       # Main app (protected)
├── components/        # React components
├── db/
│   ├── schema.ts      # Drizzle schema
│   └── index.ts       # DB client
├── lib/
│   ├── auth.ts        # NextAuth config
│   └── instagram.ts   # Instagram API client
├── middleware.ts      # Route protection
└── types/
    └── next-auth.d.ts # Session type augmentation
```

## Authentication
- Users log in with Facebook OAuth
- Grants permissions for Instagram content publishing
- User's Instagram Business Account ID + access token stored per-user in `social_accounts` table
- All API routes (except /api/auth/* and /api/publish) require authentication
- Middleware redirects unauthenticated users to /login

## Database Tables
- `users` - NextAuth users
- `accounts` - NextAuth OAuth connections (Facebook tokens)
- `sessions` - NextAuth sessions
- `verification_tokens` - NextAuth email verification
- `social_accounts` - User's Instagram accounts (our app data)
- `posts` - Scheduled/queued posts (linked to social_accounts)

## Environment Variables
Required in `.env.local` and Vercel:
- `TURSO_DATABASE_URL` - Turso connection string
- `TURSO_AUTH_TOKEN` - Turso auth token
- `AUTH_SECRET` - NextAuth secret (generate with `openssl rand -base64 32`)
- `NEXTAUTH_URL` - App URL (e.g., http://localhost:3000)
- `FACEBOOK_CLIENT_ID` - Meta App ID
- `FACEBOOK_CLIENT_SECRET` - Meta App Secret
- `BLOB_READ_WRITE_TOKEN` - Vercel Blob token (for Vercel deployment)
- `CRON_SECRET` - Optional secret to protect /api/publish

## Running Migrations
After schema changes:
```bash
pnpm drizzle-kit push  # For dev (directly pushes to DB)
# OR
pnpm drizzle-kit generate  # Generate migration files
```
