// drizzle-kit config for the local SQLite DB (TB-21). `pnpm db:generate` writes SQL migrations
// plus `drizzle/migrations.js`, which the app bundles (needs the `.sql` inline-import in Babel/Metro).
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  driver: 'expo',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
