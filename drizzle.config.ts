import { defineConfig } from "drizzle-kit";
import { config as loadEnv } from "dotenv";

// Mirror the runtime convention (.env.local overrides .env) so `npm run db:push`
// works the same way as `npm run dev`. tsx auto-loads .env via Node 22+, but
// drizzle-kit runs in a separate process without that.
loadEnv({ path: ".env.local", override: true });
loadEnv({ path: ".env" });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
