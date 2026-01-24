# Social Scheduler - Project Status

**Last Updated:** 2026-01-24 3:58 PM ET
**Owner:** Dakrid
**URL:** https://social-scheduler-pink.vercel.app

## Objective
Build an Instagram post scheduler that allows scheduling posts with images and captions, then automatically publishes them at the scheduled time.

## Tech Stack
- **Framework:** Next.js 15 (App Router)
- **Database:** Turso (SQLite edge database)
- **ORM:** Drizzle
- **File Storage:** Vercel Blob
- **Hosting:** Vercel
- **Platform:** Instagram (via Meta Graph API)

---

## ✅ Completed

### Infrastructure
- [x] Next.js project scaffolded
- [x] Turso database created (`social-scheduler-dakrid`)
- [x] Drizzle ORM configured
- [x] Vercel Blob storage connected
- [x] Deployed to Vercel (auto-deploys on push)
- [x] GitHub repo: `TheRealDatamir/social-scheduler`

### Database Schema
- [x] `accounts` table - social media accounts
- [x] `posts` table with fields:
  - `imageUrl` - Vercel Blob URL
  - `caption` - post text
  - `scheduledAt` - when to publish
  - `isPinned` - 1 if manually pinned, 0 if auto-scheduled
  - `status` - pending/published/failed
  - `platformPostId` - Instagram media ID after posting
  - `error` - error message if failed

### API Routes
- [x] `GET /api/posts` - list all posts
- [x] `POST /api/posts` - create new post
- [x] `GET /api/posts/[id]` - get single post
- [x] `PATCH /api/posts/[id]` - update post
- [x] `DELETE /api/posts/[id]` - delete post (also deletes blob)
- [x] `POST /api/upload` - upload image to Vercel Blob
- [x] `GET /api/settings` - get scheduler settings
- [x] `POST /api/publish` - cron endpoint to publish due posts

### Frontend Features
- [x] Upload tab - drag/drop or click to upload images
- [x] Add captions to images before scheduling
- [x] Auto-schedule based on frequency (daily, every-other-day, etc.)
- [x] Pin posts to specific dates
- [x] Schedule tab - view all scheduled posts
- [x] Edit mode - click Edit to modify, Save/Cancel to confirm
- [x] Delete posts (with confirmation)
- [x] Validation - require captions before upload
- [x] Auto-reschedule unpinned posts when editing dates
- [x] Dates only (removed time selection for simplicity)

### Instagram Integration
- [x] `src/lib/instagram.ts` - Instagram Graph API client
- [x] Two-step posting flow (create container → publish)

---

## 🔶 Pinned / On Hold

### Instagram Credentials (NEEDED TO ACTUALLY POST)
- [ ] Get Instagram Business Account ID
- [ ] Generate long-lived access token (60 days)
- [ ] Add to Vercel env vars:
  ```
  INSTAGRAM_BUSINESS_ACCOUNT_ID=...
  INSTAGRAM_ACCESS_TOKEN=...
  ```
- **Meta App ID:** 1109436397874988
- **Meta App Secret:** 292ea4e9f1a789aefafbd378d0260496

---

## 📋 TODO (Future)

### Before Going Live
- [ ] Complete Instagram credential setup
- [ ] Test actual Instagram posting
- [ ] Set up cron secret for security

### Nice to Have
- [ ] Settings persistence (save to DB instead of defaults)
- [ ] Multiple Instagram accounts support
- [ ] Post preview (how it'll look on Instagram)
- [ ] Analytics/history of published posts
- [ ] Bulk actions (delete multiple, reschedule all)

---

## 📁 Key Files
```
src/
├── app/
│   └── api/
│       ├── posts/route.ts        # List/create posts
│       ├── posts/[id]/route.ts   # Get/update/delete post
│       ├── upload/route.ts       # Image upload
│       ├── settings/route.ts     # Settings
│       └── publish/route.ts      # Cron endpoint
├── components/
│   └── SocialScheduler.tsx       # Main UI component
├── db/
│   ├── schema.ts                 # Drizzle schema
│   └── index.ts                  # DB client
└── lib/
    └── instagram.ts              # Instagram API
```

---

## Notes
- All naming uses camelCase (see CLAUDE.md)
- Posts default to 12:00 PM for scheduling
- Vercel free tier cron = once daily at midnight UTC
- Deleting a post also deletes its image from Vercel Blob
