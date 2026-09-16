import { defineConfig } from "drizzle-kit";
import { config as loadEnv } from "dotenv";

// Preserve an explicitly supplied shell target:
//   - npm run db:push:local  → SCHEMA_DATABASE_URL=localhost (guarded)
//   - ./push-to-production.sh → SCHEMA_DATABASE_URL=prod
// dotenv must never replace those with a developer database.
const explicitSchemaUrl = process.env.SCHEMA_DATABASE_URL;
const explicitNeonUrl = process.env.NEON_DATABASE_URL;
const explicitDatabaseUrl = process.env.DATABASE_URL;

// Local defaults mirror runtime precedence, while `override: false` protects
// CI/shell values from .env.local and .env.
loadEnv({ path: ".env.local", override: false });
loadEnv({ path: ".env", override: false });

// Prefer SCHEMA_DATABASE_URL, then DATABASE_URL for local Docker, then Neon.
// (Dev should unset NEON_DATABASE_URL — see docs/setup/LOCAL_POSTGRES_AR.md.)
const schemaDatabaseUrl = [
  explicitSchemaUrl,
  explicitDatabaseUrl,
  explicitNeonUrl,
  process.env.DATABASE_URL,
  process.env.NEON_DATABASE_URL,
].find((value): value is string => typeof value === "string" && value.trim().length > 0);

if (!schemaDatabaseUrl) {
  throw new Error("SCHEMA_DATABASE_URL, DATABASE_URL, or NEON_DATABASE_URL is required");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: schemaDatabaseUrl,
  },
});
