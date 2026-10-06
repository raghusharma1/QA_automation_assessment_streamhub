/**
 * Replaces this machine's absolute paths in the committed reports with placeholders, so the
 * repository doesn't publish a local folder layout or user name:
 *   <repo>  the repository root      <home>  any other path under the user's home folder
 *   <node>  the Node.js executable
 *
 *   npm run evidence:scrub        # after the curated run, before committing reports/
 *   npx tsx scripts/scrub-report-paths.ts <dir>   # scrub another folder (e.g. a copy)
 *
 * JSON reports are plain text. The Playwright HTML reports embed their data as a base64 zip in a
 * <template> tag, so that zip is unpacked, scrubbed entry by entry and packed again. The healer
 * maps <repo> back to the repository root, so `npm run heal` still works on scrubbed reports.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';

const ROOT = path.resolve(__dirname, '..');
// A folder to scrub instead of reports/ (used to try it on a copy first).
const REPORTS = path.resolve(process.argv[2] ?? path.join(ROOT, 'reports'));

/** A path written with any separator style: \, / or the JSON-escaped \\. */
function anySeparators(absolute: string): RegExp {
  const parts = absolute.split(/[\\/]+/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(parts.join(String.raw`(?:\\\\|\\|/)`), 'gi');
}

const REPLACEMENTS: [RegExp, string][] = [
  [anySeparators(ROOT), '<repo>'],
  [anySeparators(process.execPath), '<node>'],
  [anySeparators(homedir()), '<home>'],
  // Any other user folder (the repo may live under a different user than the one running this).
  [/[A-Z]:(?:\\\\|\\|\/)Users(?:\\\\|\\|\/)[^\\/"'\s<>]+/gi, '<home>'],
];

export function scrubText(text: string): { text: string; count: number } {
  let count = 0;
  for (const [pattern, placeholder] of REPLACEMENTS) {
    text = text.replace(pattern, () => {
      count += 1;
      return placeholder;
    });
  }
  return { text, count };
}

interface ZipEntry {
  name: Buffer;
  data: Buffer;
}

/** Reads a zip (stored or deflated entries) through its central directory. */
function readZip(zip: Buffer): ZipEntry[] {
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1;
  if (eocd < 0) throw new Error('not a zip: no end of central directory');
  const count = zip.readUInt16LE(eocd + 10);
  let at = zip.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error('bad central directory entry');
    const method = zip.readUInt16LE(at + 10);
    const compressedSize = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const localHeader = zip.readUInt32LE(at + 42);
    const name = zip.subarray(at + 46, at + 46 + nameLength);
    const dataStart =
      localHeader + 30 + zip.readUInt16LE(localHeader + 26) + zip.readUInt16LE(localHeader + 28);
    const raw = zip.subarray(dataStart, dataStart + compressedSize);
    if (method !== 0 && method !== 8) throw new Error(`unsupported zip method ${method}`);
    entries.push({ name: Buffer.from(name), data: method === 8 ? inflateRawSync(raw) : raw });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Writes deflated entries with a central directory (no zip64: reports are small). */
function writeZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const compressed = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, compressed);
    centrals.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const EMBEDDED_ZIP =
  /(<template id="playwrightReportBase64">data:application\/zip;base64,)([A-Za-z0-9+/=]+)/;

function scrubHtmlReport(html: string): { text: string; count: number } {
  const match = EMBEDDED_ZIP.exec(html);
  let count = 0;
  if (match) {
    const entries = readZip(Buffer.from(match[2]!, 'base64')).map((entry) => {
      const scrubbed = scrubText(entry.data.toString('utf8'));
      if (scrubbed.count === 0) return entry; // e.g. binary attachments: untouched
      count += scrubbed.count;
      return { name: entry.name, data: Buffer.from(scrubbed.text, 'utf8') };
    });
    if (count > 0) {
      const zip = writeZip(entries).toString('base64');
      html = html.replace(EMBEDDED_ZIP, () => `${match[1]}${zip}`);
    }
  }
  const outside = scrubText(html);
  return { text: outside.text, count: count + outside.count };
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

if (require.main === module) {
  let total = 0;
  for (const file of files(REPORTS).filter((f) => /\.(json|html|xml|md|txt)$/.test(f))) {
    if (file.includes(`${path.sep}test-results${path.sep}`) || file.includes('heal-runs')) continue;
    const original = readFileSync(file, 'utf8');
    const { text, count } = file.endsWith('.html')
      ? scrubHtmlReport(original)
      : scrubText(original);
    if (count === 0) continue;
    writeFileSync(file, text, 'utf8');
    total += count;
    console.log(`${path.relative(ROOT, file)}: ${count} path(s) replaced`);
  }
  console.log(`\n${total} local path(s) replaced in reports/.`);
}
