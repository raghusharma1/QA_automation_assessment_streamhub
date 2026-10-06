import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite, types } from '@electric-sql/pglite';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { env } from '../../src/config/env';

export const SQL_DIR = path.resolve(__dirname, '..', '..', 'sql');
const RESULTS_DIR = path.join(SQL_DIR, 'results');

/** A result row. COUNT/SUM come back as bigint (PostgreSQL BIGINT). */
export type Cell = string | number | bigint | boolean | null;
export type Row = Record<string, Cell>;

/** The created tables and columns (portable equivalent of psql's \d), for the schema evidence. */
export const SCHEMA_SQL = `SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;`;

export const readSql = (...segments: string[]) =>
  readFileSync(path.join(SQL_DIR, ...segments), 'utf8');

/**
 * A fresh in-memory PostgreSQL (PGlite) per test. DATE, TIMESTAMP and NUMERIC come back as the
 * raw text PostgreSQL prints, so expected rows are compared exactly as a psql user would see them,
 * with no JS Date time-zone shifts and no float conversion of money.
 */
export async function freshDatabase(scenarioDir: string, seedSql?: string): Promise<PGlite> {
  const asText = (value: string) => value;
  const db = new PGlite({
    parsers: { [types.DATE]: asText, [types.TIMESTAMP]: asText, [types.NUMERIC]: asText },
  });
  await db.exec(readSql(scenarioDir, 'schema.sql'));
  await db.exec(seedSql ?? readSql(scenarioDir, 'seed.sql'));
  return db;
}

export async function runQuery(db: PGlite, sql: string): Promise<Row[]> {
  return (await db.query<Row>(sql)).rows;
}

/** psql-style text table, for the report and the committed markdown output. */
export function toTextTable(rows: Row[]): string {
  if (rows.length === 0) return '(0 rows)';
  const columns = Object.keys(rows[0]!);
  const cell = (v: Cell | undefined) => (v === null || v === undefined ? 'NULL' : String(v));
  const widths = columns.map((c) => Math.max(c.length, ...rows.map((r) => cell(r[c]).length)));
  const line = (values: string[]) => values.map((v, i) => v.padEnd(widths[i]!)).join(' | ');
  return [
    line(columns),
    widths.map((w) => '-'.repeat(w)).join('-+-'),
    ...rows.map((r) => line(columns.map((c) => cell(r[c])))),
    `(${rows.length} row${rows.length === 1 ? '' : 's'})`,
  ].join('\n');
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Renders the query and its result as an HTML page in the test's browser and returns a PNG.
 * This is the "screenshot of the query output" the assessment asks for, produced on every run
 * instead of by hand.
 */
async function screenshotResult(
  page: Page,
  title: string,
  serverVersion: string,
  sql: string,
  rows: Row[],
) {
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  const cell = (v: Cell | undefined) =>
    v === null || v === undefined ? '<i>NULL</i>' : escapeHtml(String(v));
  await page.setContent(`<!doctype html><html><head><style>
    body { font: 13px/1.4 system-ui, sans-serif; margin: 24px; color: #1f2328; background: #fff; }
    h1 { font-size: 16px; margin: 0 0 4px; } .meta { color: #59636e; margin-bottom: 12px; }
    pre { background: #f6f8fa; padding: 12px; border-radius: 6px; font: 12px/1.45 ui-monospace, Consolas, monospace; white-space: pre-wrap; }
    table { border-collapse: collapse; margin-top: 12px; font: 12px ui-monospace, Consolas, monospace; }
    th, td { border: 1px solid #d1d9e0; padding: 4px 10px; text-align: left; white-space: nowrap; } th { background: #f6f8fa; }
  </style></head><body>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">${escapeHtml(serverVersion)} (PGlite, in-process) · ${rows.length} row${rows.length === 1 ? '' : 's'}</div>
    <pre>${escapeHtml(sql.trim())}</pre>
    <table><thead><tr>${columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${columns.map((c) => `<td>${cell(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table>
  </body></html>`);
  return page.screenshot({ fullPage: true });
}

/** e.g. "PostgreSQL 18.3" (the full version() string, trimmed to the product and version). */
export async function serverVersion(db: PGlite): Promise<string> {
  const { rows } = await db.query<{ version: string }>('SELECT version()');
  return /^PostgreSQL [\d.]+/.exec(rows[0]?.version ?? '')?.[0] ?? 'PostgreSQL';
}

/**
 * Attaches the result (text table + PNG) to the reports. With SQL_EVIDENCE=true
 * (npm run sql:evidence) it (re)writes them to sql/results/. Otherwise it checks that the
 * committed text output still matches, so the evidence in the repository can't silently drift
 * from the queries. (PNGs are not byte-compared; they are regenerated together with the text.)
 */
export async function recordEvidence(
  page: Page,
  testInfo: TestInfo,
  db: PGlite,
  name: string,
  title: string,
  sql: string,
  rows: Row[],
): Promise<void> {
  const version = await serverVersion(db);
  const table = toTextTable(rows);
  const text = [title, version, '', table, ''].join('\n');
  const png = await screenshotResult(page, title, version, sql, rows);
  await testInfo.attach(`${name}.txt`, { body: text, contentType: 'text/plain' });
  await testInfo.attach(`${name}.png`, { body: png, contentType: 'image/png' });

  const txtPath = path.join(RESULTS_DIR, `${name}.txt`);
  if (env.SQL_EVIDENCE) {
    mkdirSync(RESULTS_DIR, { recursive: true });
    writeFileSync(path.join(RESULTS_DIR, `${name}.png`), png);
    writeFileSync(txtPath, text, 'utf8');
  } else {
    expect(existsSync(txtPath), `${name}.txt missing: run \`npm run sql:evidence\``).toBe(true);
    expect(
      readFileSync(txtPath, 'utf8'),
      'committed evidence is stale: run `npm run sql:evidence`',
    ).toBe(text);
  }
}
