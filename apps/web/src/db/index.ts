import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

type DbClient = ReturnType<typeof drizzleNodePg<typeof schema>>;

let _db: DbClient | null = null;

function createDb(): DbClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  // Use Neon serverless for production (wss:// or neon.tech URLs)
  // Use standard pg for local development
  if (url.includes("neon.tech") || url.includes("neon.") || url.startsWith("postgres://ep-")) {
    const { neon } = require("@neondatabase/serverless");
    const { drizzle } = require("drizzle-orm/neon-http");
    return drizzle(neon(url), { schema }) as DbClient;
  }

  const { Pool } = require("pg");
  const { drizzle } = require("drizzle-orm/node-postgres");
  const pool = new Pool({ connectionString: url });
  return drizzle(pool, { schema }) as DbClient;
}

export const db = new Proxy({} as DbClient, {
  get(_target, prop) {
    if (!_db) _db = createDb();
    return (_db as any)[prop];
  },
});
