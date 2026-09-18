import { pathToFileURL } from 'node:url';
import { getDatabase } from '../src/server/database.mjs';
import { parseReportOptions, getConversionReport, formatConversionReport, ReportUsageError } from '../src/server/conversion-report.mjs';

export const HELP = `Read-only committed submission counts (UTC).
Usage: npm run conversions -- [options]
  --from YYYY-MM-DD --to YYYY-MM-DD  Inclusive start, exclusive end; 1-366 days
  --timezone UTC                   UTC only; independent of machine/database timezone
  --format table|json              Default: table (use npm run --silent for clean JSON)
  --exclude-id UUID                Repeat to exclude known test records
  --exclude-owner-tests            Exclude the two documented September 18 acceptance tests
  --help                           Show usage without connecting to a database
Default period: the seven completed UTC calendar days before today.
No exclusions apply by default. Requires protected DATABASE_URL access; sends no email.`;

export async function runReport(args, { connect = getDatabase, write = console.log, error = console.error, now = new Date() } = {}) {
  let db;
  let code = 0;
  try {
    if (args.length === 1 && args[0] === '--help') { write(HELP); return 0; }
    const options = parseReportOptions(args, now);
    db = connect();
    const report = await getConversionReport(db, options);
    // Close before printing, so a failed operation cannot appear to succeed.
    await db.close();
    db = undefined;
    write(formatConversionReport(report, options.format));
  } catch (cause) {
    error(cause instanceof ReportUsageError ? cause.message : 'Conversion report failed. Check database access and schema. No credentials or record data are logged.');
    code = 1;
  } finally {
    try { await db?.close(); } catch { code = 1; }
  }
  return code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runReport(process.argv.slice(2));
}
