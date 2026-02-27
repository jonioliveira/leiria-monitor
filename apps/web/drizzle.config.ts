import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Use 'pg' driver for drizzle-kit (local dev), not @neondatabase/serverless
  driver: undefined,
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
