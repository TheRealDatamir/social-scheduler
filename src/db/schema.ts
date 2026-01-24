import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// Social media accounts (Instagram for now, expandable later)
export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  platform: text("platform").notNull(), // 'instagram', 'bluesky', etc.
  identifier: text("identifier").notNull(), // username or account ID
  displayName: text("display_name"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Scheduled posts
export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id").references(() => accounts.id),
  imageUrl: text("image_url").notNull(), // Public URL to the image (required for Instagram)
  caption: text("caption").notNull(), // Post caption/text
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }).notNull(),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  status: text("status").notNull().default("pending"), // 'pending', 'published', 'failed'
  platformPostId: text("platform_post_id"), // Media ID from Instagram after posting
  error: text("error"), // Error message if failed
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Types for TypeScript
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
