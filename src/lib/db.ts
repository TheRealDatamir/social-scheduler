import { createClient } from '@libsql/client';

// Initialize Turso client
// Set these in your .env.local:
// TURSO_DATABASE_URL=libsql://your-db.turso.io
// TURSO_AUTH_TOKEN=your-auth-token

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Initialize database schema
export async function initDb() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_url TEXT NOT NULL,
      caption TEXT DEFAULT '',
      scheduled_at TEXT NOT NULL,
      is_pinned INTEGER DEFAULT 0,
      status TEXT DEFAULT 'scheduled',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      published_at TEXT,
      error_message TEXT
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      post_frequency TEXT DEFAULT 'daily',
      preferred_time TEXT DEFAULT '14:00',
      timezone TEXT DEFAULT 'America/New_York'
    )
  `);

  // Insert default settings if not exists
  await db.execute(`
    INSERT OR IGNORE INTO settings (id, post_frequency, preferred_time, timezone)
    VALUES (1, 'daily', '14:00', 'America/New_York')
  `);
}

// Post types
export interface Post {
  id: number;
  image_url: string;
  caption: string;
  scheduled_at: string;
  is_pinned: number;
  status: 'scheduled' | 'published' | 'failed';
  created_at: string;
  published_at: string | null;
  error_message: string | null;
}

export interface Settings {
  id: number;
  post_frequency: 'daily' | 'every-other-day' | '3x-week' | '5x-week';
  preferred_time: string;
  timezone: string;
}
