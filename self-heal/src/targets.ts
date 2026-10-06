/**
 * Resolves a failure to the page-object locator that caused it: the step line tells us which
 * member was used (`legacyPage.loanAmountInput.fill(...)`), and the page object's source gives
 * that member's expression and its `describe()` intent.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface Target {
  /** Page-object file, relative to the repository root. */
  file: string;
  member: string;
  /** What the locator is supposed to find, from `.describe('...')`. */
  intent: string;
  /** The locator expression before `.describe(`, exactly as written in the source. */
  expression: string;
  /** How the steps use it, e.g. ['click'] or ['fill', 'toHaveValue']. */
  usages: string[];
}

const ROOT = path.resolve(__dirname, '..', '..');

/**
 * `this.member = <expression>.describe('intent');` (multi-line aware). The expression may not
 * cross a `;` or another `this.` assignment: a member without a single-quoted describe() is
 * skipped rather than swallowed into the next member's expression (which would let a patch for
 * one member delete another).
 */
export function parseTargets(source: string, file: string): Omit<Target, 'usages'>[] {
  const targets: Omit<Target, 'usages'>[] = [];
  const pattern = /this\.(\w+)\s*=\s*((?:(?!this\.)[^;])*?)\s*\.describe\(\s*'([^'\\]+)'\s*\)\s*;/g;
  for (const m of source.matchAll(pattern)) {
    targets.push({ file, member: m[1]!, expression: m[2]!, intent: m[3]! });
  }
  return targets;
}

/** Methods and matchers called on `<fixture>.<member>` in the steps source. */
export function findUsages(stepsSource: string, member: string): string[] {
  const usages = new Set<string>();
  for (const m of stepsSource.matchAll(new RegExp(`\\.${member}\\.(\\w+)\\(`, 'g')))
    usages.add(m[1]!);
  for (const m of stepsSource.matchAll(
    new RegExp(`expect\\(\\w+\\.${member}\\)\\s*\\.(\\w+)\\(`, 'g'),
  )) {
    usages.add(m[1]!);
  }
  return [...usages];
}

/** Maps a failure's step location to its target in one of the page objects, or explains why not. */
export function resolveTarget(
  location: { file: string; line: number } | undefined,
  pageObjectFiles: string[],
): Target | { error: string } {
  if (!location) return { error: 'the failure has no source location' };
  const stepsSource = readFileSync(location.file, 'utf8');
  const stepLine = stepsSource.split(/\r?\n/)[location.line - 1] ?? '';
  const member = /\b\w+Page\.(\w+)\b/.exec(stepLine)?.[1];
  if (!member) return { error: `no page-object locator on the failing line: "${stepLine.trim()}"` };

  for (const file of pageObjectFiles) {
    const target = parseTargets(readFileSync(path.join(ROOT, file), 'utf8'), file).find(
      (t) => t.member === member,
    );
    if (target) return { ...target, usages: findUsages(stepsSource, member) };
  }
  return { error: `"${member}" is not a described locator in any page object` };
}
