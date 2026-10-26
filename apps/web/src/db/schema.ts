import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Small key/value table for operational markers (last cron run, schema bootstrap, ...).
 * Domain tables arrive with the phases that need them.
 */
export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
