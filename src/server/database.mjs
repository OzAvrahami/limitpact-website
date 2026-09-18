import 'server-only';
import pg from 'pg';

let database;

export function getDatabase() {
  if (database) return database;
  if (!process.env.DATABASE_URL) throw new Error('database_not_configured');
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 10000,
    // Never disable TLS verification here. Use the provider's connection settings.
  });
  pool.on('error', () => console.error('database_pool_error'));
  database = {
    query: (text, values) => pool.query(text, values),
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
  return database;
}
