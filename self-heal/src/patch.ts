/**
 * Patches touch ONLY the locator expression of one page-object member: the text between
 * `this.<member> =` and `.describe(`. Assertions, expected values and step code are never part of
 * a patch, so a "heal" can't weaken a test.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as prettier from 'prettier';
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
  // A replacer function, not a string: in a replacement string `$&`, `` $` `` and `$'` are
  // expanded, so model-supplied text containing them could splice other source into the file.
  return source.replace(target.expression, () => newExpression);
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

/**
 * A standard unified diff (3 lines of context) of the proposed change, that `git apply` accepts.
 * The patched file is formatted with the project's Prettier config first, so applying the patch
 * leaves the codebase lint- and format-clean. The leading comment line is ignored by git apply.
 */
export function makeDiff(file: string, original: string, patched: string, note: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'heal-diff-'));
  try {
    writeFileSync(path.join(dir, 'a'), original, 'utf8');
    writeFileSync(path.join(dir, 'b'), patched, 'utf8');
    const run = spawnSync('git', ['diff', '--no-index', '--no-color', '-U3', 'a', 'b'], {
      cwd: dir,
      encoding: 'utf8',
    });
    if (run.status !== 1) throw new Error(`git diff failed: ${run.stderr || 'no differences'}`);
    const body = run.stdout
      .split('\n')
      .filter((line) => !line.startsWith('index '))
      .map((line) => {
        if (line.startsWith('diff --git ')) return `diff --git a/${file} b/${file}`;
        if (line.startsWith('--- ')) return `--- a/${file}`;
        if (line.startsWith('+++ ')) return `+++ b/${file}`;
        return line;
      })
      .join('\n');
    return `# ${note}\n${body}`;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The proposal for one target as an applicable patch, formatted like the rest of the code. */
export async function unifiedDiff(target: Target, newExpression: string): Promise<string> {
  const file = path.join(ROOT, target.file);
  const original = readFileSync(file, 'utf8');
  const options = (await prettier.resolveConfig(file)) ?? {};
  const patched = await prettier.format(patchedSource(original, target, newExpression), {
    ...options,
    filepath: file,
  });
  return makeDiff(
    target.file,
    original,
    patched,
    `Proposed by \`npm run heal\` for ${target.member} ("${target.intent}"). NOT applied: review, then \`git apply\` this file.`,
  );
}
