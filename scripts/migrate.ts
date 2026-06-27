// Migration runner — applies every supabase/migrations/*.sql in order over a direct Postgres
// connection. Migrations are idempotent (create table if not exists / add column if not exists),
// so re-running is safe. Set SUPABASE_DB_URL in .env.local:
//   Supabase dashboard → Project Settings → Database → Connection string → URI (Session pooler).
// Run: pnpm migrate

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const conn = process.env.SUPABASE_DB_URL;
if (!conn) {
  console.error(
    "Set SUPABASE_DB_URL in .env.local (Supabase → Settings → Database → Connection string → URI).",
  );
  process.exit(1);
}

async function main() {
  const dir = join(process.cwd(), "supabase/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    for (const f of files) {
      process.stdout.write(`applying ${f} … `);
      await client.query(readFileSync(join(dir, f), "utf-8"));
      console.log("ok");
    }
  } finally {
    await client.end();
  }
  console.log(`Done — ${files.length} migration(s) applied.`);
}

main().catch((e) => {
  console.error("migration failed:", e?.message ?? e);
  process.exit(1);
});
