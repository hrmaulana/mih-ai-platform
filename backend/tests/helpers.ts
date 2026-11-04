import { readFileSync } from "node:fs";
import { Pool } from "pg";

export const testDb = new Pool({
  connectionString:
    process.env.TEST_DATABASE_URL ?? "postgres://mih:mih@localhost:5432/mih_test",
});

/**
 * Terapkan skema dasar (db/init.sql).
 *
 * Bun menjalankan berkas tes secara paralel; tanpa penjagaan, dua berkas yang
 * memanggil ini bersamaan bisa bertabrakan saat CREATE TABLE (galat
 * "duplicate key value violates unique constraint pg_type_typname_nsp_index").
 * `pg_advisory_xact_lock` menyerialkan inisialisasi dan otomatis dilepas
 * saat COMMIT — aman untuk pool koneksi.
 */
export async function applySchema() {
  const sql = readFileSync(new URL("../../db/init.sql", import.meta.url), "utf8");
  const client = await testDb.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(918273)");
    await client.query(sql);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function truncateAll() {
  await testDb.query(
    "TRUNCATE usage_logs, api_tokens, chunks, documents, messages, conversations, users RESTART IDENTITY CASCADE"
  );
}
