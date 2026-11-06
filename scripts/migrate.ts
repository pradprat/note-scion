// Creates the tables. Safe to run again:
//   bun run db:migrate
// Bun loads .env.local itself, so put DATABASE_URL there first (see .env.example).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env.local (see .env.example).");
  process.exit(1);
}

const sql = neon(url);
const schema = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "schema.sql"),
  "utf8"
);

// The HTTP driver runs one statement per call.
const statements = schema
  .replace(/^\s*--.*$/gm, "")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

async function main() {
  for (const statement of statements) {
    await sql.query(statement);
  }
  console.log(`notes: applied ${statements.length} statements`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
