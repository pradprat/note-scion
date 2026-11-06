// Creates the tables. Every statement is `create ... if not exists`, so it is safe to run
// against a database that already has them.
//
//   bun run db:migrate                     local: Bun reads DATABASE_URL from .env.local
//   node scripts/migrate.mjs --if-configured
//                                          the build: skips quietly without a database,
//                                          so CI and preview builds need no secrets
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!url) {
  if (process.argv.includes("--if-configured")) {
    console.log("note-scion: no DATABASE_URL, skipping migrations");
    process.exit(0);
  }
  console.error("DATABASE_URL is not set. Add it to .env.local (see .env.example).");
  process.exit(1);
}

const sql = neon(url);
const schema = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "schema.sql"), "utf8");

// The HTTP driver runs one statement per call.
const statements = schema
  .replace(/^\s*--.*$/gm, "")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

try {
  for (const statement of statements) await sql.query(statement);
  console.log(`note-scion: database ready (${statements.length} statements)`);
} catch (error) {
  console.error("note-scion: migration failed");
  console.error(error);
  process.exit(1);
}
