#!/usr/bin/env node
/**
 * Tiny migration runner for the eshor_core spine schema. Deliberately
 * separate from Medusa's own migration system (which owns `public`) —
 * see migrations/001_eshor_core_schema.sql header.
 *
 * Tracks applied migrations in eshor_core.schema_migrations. Idempotent:
 * safe to run repeatedly (also part of the CI migration-dry-run gate).
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query("CREATE SCHEMA IF NOT EXISTS eshor_core");
    await client.query(`
      CREATE TABLE IF NOT EXISTS eshor_core.schema_migrations (
        filename    text PRIMARY KEY,
        applied_at  timestamptz NOT NULL DEFAULT now()
      )
    `);

    const applied = new Set(
      (await client.query("SELECT filename FROM eshor_core.schema_migrations")).rows.map(
        (r: { filename: string }) => r.filename,
      ),
    );

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`skip (already applied): ${file}`);
        continue;
      }
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      console.log(`applying: ${file}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO eshor_core.schema_migrations (filename) VALUES ($1)",
          [file],
        );
        await client.query("COMMIT");
        console.log(`applied: ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
    console.log("MIGRATE-OK");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("MIGRATE-FAILED", err);
  process.exit(1);
});
