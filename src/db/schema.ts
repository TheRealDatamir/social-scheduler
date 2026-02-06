import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// Social media accounts (Instagram for now, expandable later)
export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  platform: text("platform").notNull(), // 'instagram', 'bluesky', etc.
  identifier: text("identifier").notNull(), // username or account ID
  displayName: text("display_name"),
  postingFrequency: text("posting_frequency").notNull().default("daily"), // 'daily', 'every-other-day', 'weekdays', etc.
  postingTime: text("posting_time").notNull().default("12:00"), // HH:MM format, 24hr
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Posts — queued or scheduled
export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id").references(() => accounts.id),
  imageUrl: text("image_url").notNull(),
  caption: text("caption").notNull(),
  type: text("type").notNull().default("queued"), // 'queued' | 'scheduled'
  isExtra: integer("is_extra", { mode: "boolean" }).notNull().default(false), // Only for scheduled: if true, doesn't consume the queue
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }), // Only for scheduled posts
  queueOrder: integer("queue_order"), // Only for queued posts — manual ordering
  publishedAt: integer("published_at", { mode: "timestamp" }),
  status: text("status").notNull().default("pending"), // 'pending' | 'published' | 'failed'
  platformPostId: text("platform_post_id"),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Types for TypeScript
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type PostType = "queued" | "scheduled";
export type PostStatus = "pending" | "published" | "failed";
