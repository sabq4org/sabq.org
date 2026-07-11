import { defineConfig } from "drizzle-kit";
import { config as loadEnv } from "dotenv";

// Preserve an explicitly supplied shell target. Production pushes set
// SCHEMA_DATABASE_URL; dotenv must never replace it with a developer database.
const explicitSchemaUrl = process.env.SCHEMA_DATABASE_URL;
const explicitNeonUrl = process.env.NEON_DATABASE_URL;
const explicitDatabaseUrl = process.env.DATABASE_URL;

// Local defaults mirror runtime precedence, while `override: false` protects
// CI/shell values from .env.local and .env.
loadEnv({ path: ".env.local", override: false });
loadEnv({ path: ".env", override: false });

const schemaDatabaseUrl = [
  explicitSchemaUrl,
  explicitNeonUrl,
  explicitDatabaseUrl,
  process.env.NEON_DATABASE_URL,
  process.env.DATABASE_URL,
].find((value): value is string => typeof value === "string" && value.trim().length > 0);

if (!schemaDatabaseUrl) {
  throw new Error("SCHEMA_DATABASE_URL, NEON_DATABASE_URL, or DATABASE_URL is required");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: schemaDatabaseUrl,
  },
});
