/**
 * Static brittle-locator lint: detection BEFORE a locator breaks at runtime.
 *
 *   npm run lint:locators             # report findings
 *   npm run lint:locators -- --strict # exit 1 on any finding that is not allowlisted
 *   npm run lint:locators -- --strict --exclude=src/pages/legacy
 *                                     # CI: skip the page object that is broken on purpose
 *
 * A finding can be accepted with a justified comment on the same or previous line:
 *   // locator-lint-allow: <why this is safe here>
 *
 * Static analysis can only see the *shape* of a locator. A renamed id or drifted text looks
 * perfectly valid in source; those are caught at runtime by the healer (SELF_HEALING.md).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export interface Rule {
  id: string;
  pattern: RegExp;
  why: string;
}

export const RULES: Rule[] = [
  {
    id: 'absolute-xpath',
    pattern: /['"`](xpath=)?\/html\b|['"`]xpath=\/(?!\/)/,
    why: 'absolute XPath breaks when any ancestor changes',
  },
  {
    id: 'positional-css',
    pattern: /:nth-(child|of-type|last-child)\(/,
    why: 'position in the DOM is layout, not meaning',
  },
  {
    id: 'deep-css-chain',
    pattern: /['"`][^'"`]*(\s>\s[^'"`]*){3,}['"`]/,
    why: 'long child-combinator chains couple the test to the page structure',
  },
  {
    id: 'positional-index',
    pattern: /\.(nth|first|last)\(|>>\s*nth=/,
    why: 'picks an element by index instead of by what it is',
  },
  {
    id: 'unanchored-regex-name',
    pattern: /name:\s*\/(?!\^)[^/]*\/[a-z]*\s*[,}]/,
    why: 'an unanchored regex name is a substring match and can match several elements',
  },
  {
    id: 'generated-class',
    pattern: /\.(css-[a-z0-9]{5,}|sc-[A-Za-z]{5,}|jss\d+|makeStyles-)/,
    why: 'generated class names change with every build',
  },
];

export interface Finding {
  file: string;
  line: number;
  rule: string;
  why: string;
  code: string;
  allowed?: string;
}

export function lintSource(source: string, file: string): Finding[] {
  const lines = source.split(/\r?\n/);
  const findings: Finding[] = [];
  lines.forEach((code, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(code)) return; // comments describe locators, they aren't ones
    for (const rule of RULES) {
      if (!rule.pattern.test(code)) continue;
      // `m` flag: the allow comment may sit on the previous line, so `$` must match at line ends.
      const allow = /locator-lint-allow:\s*(.+)$/m.exec(`${lines[i - 1] ?? ''}\n${code}`)?.[1];
      findings.push({
        file,
        line: i + 1,
        rule: rule.id,
        why: rule.why,
        code: code.trim(),
        allowed: allow?.trim(),
      });
    }
  });
  return findings;
}

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? tsFiles(full) : name.endsWith('.ts') ? [full] : [];
  });
}

if (require.main === module) {
  const root = path.resolve(__dirname, '..', '..');
  const excluded = process.argv
    .filter((a) => a.startsWith('--exclude='))
    .map((a) => a.slice('--exclude='.length).replace(/\/?$/, '/'));
  const findings = tsFiles(path.join(root, 'src'))
    .map((f) => path.relative(root, f).split(path.sep).join('/'))
    .filter((rel) => !excluded.some((prefix) => rel.startsWith(prefix)))
    .flatMap((rel) => lintSource(readFileSync(path.join(root, rel), 'utf8'), rel));
  if (excluded.length > 0) console.log(`Excluded: ${excluded.join(', ')}\n`);
  const open = findings.filter((f) => !f.allowed);
  for (const f of findings) {
    const status = f.allowed ? `allowed (${f.allowed})` : 'BRITTLE';
    console.log(`${f.file}:${f.line}  [${f.rule}] ${status}\n    ${f.code}\n    → ${f.why}`);
  }
  console.log(
    `\n${findings.length} finding(s): ${open.length} brittle, ${findings.length - open.length} allowlisted.`,
  );
  if (process.argv.includes('--strict') && open.length > 0) process.exitCode = 1;
}
