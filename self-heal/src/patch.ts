/**
 * Patches touch ONLY the locator expression of one page-object member: the text between
 * `this.<member> =` and `.describe(`. Assertions, expected values and step code are never part of
 * a patch, so a "heal" can't weaken a test.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Target } from './targets';

const ROOT = path.resolve(__dirname, '..', '..');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export function patchedSource(source: string, target: Target, newExpression: string): string {
  const occurrences = source.split(target.expression).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `expected the locator expression exactly once in ${target.file}, found ${occurrences}`,
    );
  }
  return source.replace(target.expression, newExpression);
}

/** Applies the patch for the duration of `fn` and always restores the original, verified. */
export function withPatch<T>(target: Target, newExpression: string, fn: () => T): T {
  const file = path.join(ROOT, target.file);
  const original = readFileSync(file, 'utf8');
  const restore = () => {
    writeFileSync(file, original, 'utf8');
    if (sha(readFileSync(file, 'utf8')) !== sha(original)) {
      throw new Error(`failed to restore ${target.file} after a validation run`);
    }
  };
  writeFileSync(file, patchedSource(original, target, newExpression), 'utf8');
  let result: T;
  try {
    result = fn();
  } catch (error) {
    restore(); // restore first; the original error is still the one reported
    throw error;
  }
  restore();
  return result;
}

/** A unified diff of the one changed statement (`this.<member> = ...;`), for human review. */
export function unifiedDiff(target: Target, newExpression: string): string {
  const source = readFileSync(path.join(ROOT, target.file), 'utf8');
  const statement = new RegExp(`[ \\t]*this\\.${target.member}\\s*=[\\s\\S]*?;`).exec(source);
  if (!statement) throw new Error(`statement for ${target.member} not found in ${target.file}`);
  const oldLines = statement[0].split('\n');
  const newLines = statement[0].replace(target.expression, newExpression).split('\n');
  const startLine = source.slice(0, statement.index).split('\n').length;
  return [
    `--- a/${target.file}`,
    `+++ b/${target.file} (proposed, not applied)`,
    `@@ -${startLine},${oldLines.length} +${startLine},${newLines.length} @@ ${target.member}: ${target.intent}`,
    ...oldLines.map((l) => `-${l}`),
    ...newLines.map((l) => `+${l}`),
  ].join('\n');
}
