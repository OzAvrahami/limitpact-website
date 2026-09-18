import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export async function migrate(database) {
  const directory = new URL('../db/migrations/', import.meta.url);
  const files = (await readdir(directory)).filter((name) => /^\d+_[a-z_]+\.sql$/.test(name)).sort();
  await database.transaction(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(1835627632, 2)');
    await db.query('CREATE SCHEMA IF NOT EXISTS limitpact_web');
    await db.query('CREATE TABLE IF NOT EXISTS limitpact_web.migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const name of files) {
      // Git may check out CRLF on Windows and LF on the production host.
      const sql = (await readFile(new URL(name, directory), 'utf8')).replace(/\r\n/g, '\n');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = (await db.query('SELECT checksum FROM limitpact_web.migrations WHERE name = $1', [name])).rows[0];
      if (existing) {
        if (existing.checksum !== checksum) throw new Error('migration_checksum_mismatch');
        continue;
      }
      // pg supports multi-statement scripts; PGlite uses exec for these.
      if (db.exec) await db.exec(sql);
      else await db.query(sql);
      await db.query('INSERT INTO limitpact_web.migrations (name, checksum) VALUES ($1, $2)', [name, checksum]);
    }
  });
}
