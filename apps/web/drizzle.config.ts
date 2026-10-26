import { defineConfig } from 'drizzle-kit';

// Only generates SQL: migrations are applied by wrangler (`pnpm db:migrate:local` / CI).
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
});
