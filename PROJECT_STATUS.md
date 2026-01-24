# Social Scheduler - Project Status

**Last Updated:** 2026-01-24 2:13 PM ET

## Objective
Build an Instagram post scheduler that allows scheduling posts with images and captions, then automatically publishes them at the scheduled time.

## Tech Stack
- **Framework:** Next.js 15 (App Router)
- **Database:** Turso (SQLite edge database)
- **ORM:** Drizzle
- **Hosting:** Vercel (planned)
- **Platform:** Instagram (via Meta Graph API)

---

## ✅ Completed

### Database Setup
- [x] Turso database created (`social-scheduler-dakrid`)
- [x] Credentials saved to `.env.local`
- [x] Drizzle ORM installed and configured

### Schema
- [x] `accounts` table - stores connected social accounts
- [x] `posts` table - stores scheduled posts with:
  - `imageUrl` - public URL to image
  - `caption` - post text
  - `scheduledAt` - when to publish
  - `status` - pending/published/failed
  - `platformPostId` - ID from Instagram after posting
  - `error` - error message if failed

### API Routes
- [x] `GET /api/posts` - list all scheduled posts
- [x] `POST /api/posts` - create a new scheduled post
- [x] `POST /api/publish` - publish all due posts (cron endpoint)

### Instagram Integration
- [x] `src/lib/instagram.ts` - Instagram Graph API client
- [x] Post creation flow (create container → publish)

### Infrastructure
- [x] `vercel.json` - cron job config (daily at midnight UTC)
- [x] Project scaffolded with Next.js

---

## 🔶 In Progress / Pinned

### Instagram Credentials (PINNED)
- [ ] Get Instagram Business Account ID
- [ ] Generate long-lived access token
- [ ] Add to `.env.local`:
  ```
  INSTAGRAM_BUSINESS_ACCOUNT_ID=...
  INSTAGRAM_ACCESS_TOKEN=...
  ```
- **Meta App ID:** 1109436397874988
- **Meta App Secret:** 292ea4e9f1a789aefafbd378d0260496

---

## 📋 TODO

### Testing
- [ ] Test API routes locally (`npm run dev`)
- [ ] Verify database connection
- [ ] Test Instagram posting (once credentials ready)

### Deployment
- [ ] Deploy to Vercel
- [ ] Set environment variables in Vercel dashboard
- [ ] Verify cron job runs

### UI (Optional/Future)
- [ ] Simple form to create scheduled posts
- [ ] List view of scheduled/published posts
- [ ] Status dashboard

---

## 📁 Project Structure
```
social-scheduler/
├── src/
│   ├── app/
│   │   └── api/
│   │       ├── posts/route.ts    # CRUD for posts
│   │       └── publish/route.ts  # Cron endpoint
│   ├── db/
│   │   ├── schema.ts             # Drizzle schema
│   │   └── index.ts              # DB client
│   └── lib/
│       └── instagram.ts          # Instagram API client
├── drizzle.config.ts
├── vercel.json
├── .env.local                    # Credentials (not committed)
└── PROJECT_STATUS.md             # This file
```

---

## Notes
- Instagram API requires images to be hosted at a public URL (can't upload directly)
- Vercel free tier cron = once daily; Pro tier = every minute
- Turso free tier = 9GB storage, plenty for this project
