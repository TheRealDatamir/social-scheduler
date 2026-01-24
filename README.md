# Social Scheduler

Instagram/Facebook post scheduler with automatic publishing.

## Stack

- **Frontend**: Next.js 16 + React + TypeScript + Tailwind CSS
- **Database**: Turso (SQLite)
- **Storage**: Cloudflare R2
- **Hosting**: Vercel
- **Cron**: Vercel Cron

## Features

- 📸 Upload multiple images
- ✏️ Manual caption editing
- 📅 Flexible scheduling (daily, every other day, 3x/week, weekdays)
- 📌 Pin posts to specific dates/times
- ⏰ Automatic publishing via cron
- ☁️ Cloud storage for images

## Setup

### 1. Clone and Install

```bash
git clone https://github.com/TheRealDatamir/social-scheduler.git
cd social-scheduler
npm install
```

### 2. Create Turso Database

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Login
turso auth login

# Create database
turso db create social-scheduler

# Get connection info
turso db show social-scheduler --url
turso db tokens create social-scheduler
```

### 3. Create Cloudflare R2 Bucket

1. Go to Cloudflare Dashboard → R2
2. Create bucket named `social-scheduler`
3. Enable public access (Settings → Public Access)
4. Create API token (R2 → Manage R2 API Tokens)

### 4. Configure Environment

Copy `.env.example` to `.env.local` and fill in:

```bash
cp .env.example .env.local
```

Required variables:
- `TURSO_DATABASE_URL` - From step 2
- `TURSO_AUTH_TOKEN` - From step 2
- `R2_ACCOUNT_ID` - Your Cloudflare account ID
- `R2_ACCESS_KEY_ID` - From R2 API token
- `R2_SECRET_ACCESS_KEY` - From R2 API token
- `R2_BUCKET_NAME` - `social-scheduler`
- `R2_PUBLIC_URL` - Your R2 public URL

### 5. Run Locally

```bash
npm run dev
```

Open http://localhost:3000

### 6. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Add environment variables in Vercel dashboard
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/posts` | GET | List all posts |
| `/api/posts` | POST | Create a post |
| `/api/posts/[id]` | GET | Get a post |
| `/api/posts/[id]` | PATCH | Update a post |
| `/api/posts/[id]` | DELETE | Delete a post |
| `/api/settings` | GET | Get settings |
| `/api/settings` | PATCH | Update settings |
| `/api/upload` | POST | Get presigned upload URL |
| `/api/cron/publish` | GET | Publish due posts (cron) |

## Cron Configuration

The cron job runs every 15 minutes to check for posts that need publishing.

Configure in `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cron/publish",
    "schedule": "*/15 * * * *"
  }]
}
```

## Future: Instagram Publishing

The cron endpoint has a placeholder for Instagram publishing. To enable:

1. Create a Meta Developer App
2. Request `instagram_content_publish` permission
3. Add credentials to environment variables
4. Implement Graph API calls in `/api/cron/publish/route.ts`

## License

MIT
