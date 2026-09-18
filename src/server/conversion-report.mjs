import 'server-only';

const DAY = 86400000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const OWNER_TEST_IDS = Object.freeze([
  '3de83c33-545f-4f32-8f5c-c906d2dc19b3',
  'dd7d135c-7b48-402a-b7ac-0ce814834273',
]);

export class ReportUsageError extends Error {}

function date(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) {
    throw new ReportUsageError('Dates must be valid YYYY-MM-DD calendar dates.');
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ReportUsageError('Dates must be valid YYYY-MM-DD calendar dates.');
  }
  return parsed.getTime();
}

export function parseReportOptions(args, now = new Date()) {
  const values = {};
  const excluded = [];
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--exclude-owner-tests') {
      excluded.push(...OWNER_TEST_IDS);
    } else if (['--from', '--to', '--format', '--timezone', '--exclude-id'].includes(key)) {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new ReportUsageError('An option value is missing.');
      if (key === '--exclude-id') excluded.push(value);
      else {
        if (values[key] !== undefined) throw new ReportUsageError('Do not repeat date, format, or timezone options.');
        values[key] = value;
      }
    } else {
      throw new ReportUsageError('Unknown option. Use --help for report usage.');
    }
  }
  if (Boolean(values['--from']) !== Boolean(values['--to'])) {
    throw new ReportUsageError('Supply both --from and --to, or neither.');
  }
  if (values['--timezone'] && values['--timezone'] !== 'UTC') throw new ReportUsageError('Only UTC is supported.');
  const format = values['--format'] ?? 'table';
  if (!['table', 'json'].includes(format)) throw new ReportUsageError('Format must be table or json.');
  if (excluded.length > 1000 || excluded.some((id) => !UUID.test(id))) {
    throw new ReportUsageError('Exclusions must be UUIDs; at most 1000 exclusions are supported.');
  }
  const today = date(now.toISOString().slice(0, 10));
  const start = values['--from'] ? date(values['--from']) : today - 7 * DAY;
  const end = values['--to'] ? date(values['--to']) : today;
  if (end <= start || end - start > 366 * DAY) throw new ReportUsageError('Range must contain 1 to 366 days; --to is exclusive.');
  return { from: new Date(start).toISOString(), to: new Date(end).toISOString(), timezone: 'UTC',
    format, excludeIds: [...new Set(excluded.map((id) => id.toLowerCase()))] };
}

const counts = () => ({ contact: 0, privateBeta: 0, total: 0, excluded: 0 });

export async function getConversionReport(database, options) {
  // One aggregate SELECT gives one snapshot. Never retrieve submitted fields or
  // individual identities. The existing primary key represents one acceptance;
  // its unique idempotency key already deduplicates client retries.
  const result = await database.transaction(async (db) => {
    await db.query('SET TRANSACTION READ ONLY');
    return db.query(`SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
      form_type,
      count(*) FILTER (WHERE NOT (id = ANY($3::uuid[]))) AS included,
      count(*) FILTER (WHERE id = ANY($3::uuid[])) AS excluded
      FROM limitpact_web.submissions
      WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
      GROUP BY day, form_type ORDER BY day, form_type`, [options.from, options.to, options.excludeIds]);
  });
  const daily = [];
  for (let time = Date.parse(options.from); time < Date.parse(options.to); time += DAY) {
    daily.push({ date: new Date(time).toISOString().slice(0, 10), ...counts() });
  }
  const byDate = new Map(daily.map((day) => [day.date, day]));
  const totals = counts();
  for (const row of result.rows) {
    const included = Number(row.included), excluded = Number(row.excluded);
    const day = byDate.get(row.day);
    if (!day || !['contact', 'beta'].includes(row.form_type) ||
      ![included, excluded].every((n) => Number.isSafeInteger(n) && n >= 0)) throw new Error('invalid_aggregate');
    const key = row.form_type === 'contact' ? 'contact' : 'privateBeta';
    for (const target of [day, totals]) {
      target[key] += included;
      target.total += included;
      target.excluded += excluded;
      if (![target.contact, target.privateBeta, target.total, target.excluded].every(Number.isSafeInteger)) {
        throw new Error('aggregate_overflow');
      }
    }
  }
  return { timezone: 'UTC', fromInclusive: options.from, toExclusive: options.to,
    metric: 'committed_submissions', totals, daily };
}

export function formatConversionReport(report, format) {
  if (format === 'json') return JSON.stringify(report, null, 2);
  const line = (label, row) => `${label.padEnd(12)} ${String(row.contact).padStart(9)} ${String(row.privateBeta).padStart(13)} ${String(row.total).padStart(9)} ${String(row.excluded).padStart(10)}`;
  return [
    'Committed submissions (not unique leads or a visitor conversion rate)',
    `Timezone: ${report.timezone}; from ${report.fromInclusive} inclusive to ${report.toExclusive} exclusive`,
    '', 'Date           Contact  Private Beta     Total   Excluded',
    ...report.daily.map((day) => line(day.date, day)), line('TOTAL', report.totals),
    '', 'Excluded counts are matching rows within this period; no records are changed.',
  ].join('\n');
}
