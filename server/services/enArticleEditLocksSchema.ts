import { pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { enArticles, users } from "@shared/schema";

export const enArticleEditLocks = pgTable("en_article_edit_locks", {
  articleId: varchar("article_id").primaryKey().notNull().references(() => enArticles.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  userName: text("user_name").notNull(),
  acquiredAt: timestamp("acquired_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  lastHeartbeat: timestamp("last_heartbeat").notNull().defaultNow(),
});
