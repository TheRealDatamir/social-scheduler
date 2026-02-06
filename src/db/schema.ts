import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

// ============================================
// NextAuth.js Required Tables
// ============================================

export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: integer("email_verified", { mode: "timestamp" }),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const accounts = sqliteTable("accounts", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: integer("expires_at"),
  token_type: text("token_type"),
  scope: text("scope"),
  id_token: text("id_token"),
  session_state: text("session_state"),
}, (table) => ({
  pk: primaryKey({ columns: [table.provider, table.providerAccountId] }),
}));

export const sessions = sqliteTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: integer("expires", { mode: "timestamp" }).notNull(),
});

export const verificationTokens = sqliteTable("verification_tokens", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull(),
  expires: integer("expires", { mode: "timestamp" }).notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.identifier, table.token] }),
}));

// ============================================
// App Tables
// ============================================

// Social media accounts (Instagram for now, expandable later)
// Renamed from 'accounts' to avoid conflict with NextAuth
export const socialAccounts = sqliteTable("social_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(), // 'instagram', 'bluesky', etc.
  platformAccountId: text("platform_account_id"), // Instagram Business Account ID
  identifier: text("identifier").notNull(), // username or display handle
  displayName: text("display_name"),
  accessToken: text("access_token"), // Platform-specific access token
  tokenExpiresAt: integer("token_expires_at", { mode: "timestamp" }),
  postingFrequency: text("posting_frequency").notNull().default("daily"),
  postingTime: text("posting_time").notNull().default("12:00"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Posts — queued or scheduled
export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id").references(() => socialAccounts.id),
  imageUrl: text("image_url").notNull(),
  caption: text("caption").notNull(),
  type: text("type").notNull().default("queued"), // 'queued' | 'scheduled'
  isExtra: integer("is_extra", { mode: "boolean" }).notNull().default(false),
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }),
  queueOrder: integer("queue_order"),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  status: text("status").notNull().default("pending"), // 'pending' | 'published' | 'failed'
  platformPostId: text("platform_post_id"),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ============================================
// TypeScript Types
// ============================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type SocialAccount = typeof socialAccounts.$inferSelect;
export type NewSocialAccount = typeof socialAccounts.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type PostType = "queued" | "scheduled";
export type PostStatus = "pending" | "published" | "failed";

// Backwards compatibility aliases
export type Account = SocialAccount;
export type NewAccount = NewSocialAccount;
