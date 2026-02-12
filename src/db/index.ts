import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

type DbClient = ReturnType<typeof drizzleNodePg<typeof schema>>;

function createDb(): DbClient {
  const url = process.env.DATABASE_URL!;

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

export const db = createDb();
