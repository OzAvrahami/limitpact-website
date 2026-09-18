import { getDatabase } from '../src/server/database.mjs';
import { migrate } from './migrations.mjs';

let db;
try {
  db = getDatabase();
  await migrate(db);
  console.log('Submission migrations applied.');
} catch {
  console.error('Migration failed. Check database access, permissions, and migration checksums. No credentials or SQL data are logged.');
  process.exitCode = 1;
} finally {
  await db?.close();
}
