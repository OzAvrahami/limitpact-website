import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { SubmissionError } from './validation.mjs';

export function createSubmissionStore(database) {
  return {
    database,
    async accept(data) {
      const { idempotencyKey, ...payload } = data;
      const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
      return database.transaction(async (db) => {
        // Short, database-wide serialization makes quotas and idempotency atomic
        // across instances. No network/email work happens under this lock.
        await db.query('SELECT pg_advisory_xact_lock(1835627632, 1)');
        await db.query('SET LOCAL synchronous_commit = on');
        const existing = (await db.query(
          'SELECT id, request_hash FROM limitpact_web.submissions WHERE idempotency_key = $1', [idempotencyKey],
        )).rows[0];
        if (existing) {
          if (existing.request_hash !== hash) throw new SubmissionError(409, 'This request was already used for different details. Reopen the form to send a new request.');
          return { id: existing.id, duplicate: true };
        }
        const counts = (await db.query(`SELECT count(*)::int AS total,
          count(*) FILTER (WHERE email = $1)::int AS per_email
          FROM limitpact_web.submissions WHERE created_at > clock_timestamp() - interval '1 hour'`, [data.email])).rows[0];
        if (counts.total >= 100 || counts.per_email >= 3) {
          throw new SubmissionError(429, 'Too many submissions. Please try again in an hour.');
        }
        const id = randomUUID();
        await db.query(`INSERT INTO limitpact_web.submissions
          (id, idempotency_key, request_hash, form_type, name, email, message, platform)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, idempotencyKey, hash, data.type, data.name, data.email, data.message, data.platform]);
        return { id, duplicate: false };
      });
    },
    async get(id) {
      return (await database.query('SELECT * FROM limitpact_web.submissions WHERE id = $1', [id])).rows[0];
    },
  };
}
