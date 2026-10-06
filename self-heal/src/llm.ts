/**
 * Model adapters. All return the RAW model output; candidates.ts validates it with zod.
 *
 * - claude-code: headless Claude Code (`claude -p`) with the developer's existing login. No API
 *   key, no tools, no MCP servers, no session saved: the model can only answer.
 * - anthropic:   the Messages API, with HEAL_LLM=anthropic and ANTHROPIC_API_KEY in the git-ignored .env.
 * - replay:      a recorded response ("cassette") from an earlier real run, for offline,
 *                deterministic re-runs. Cassettes are committed as evidence of what the model said.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { env } from '../../src/config/env';
import { HealResponseSchema } from './candidates';
import { SYSTEM_PROMPT } from './prompt';

export type AdapterName = 'claude-code' | 'anthropic' | 'replay';

export interface Cassette {
  target: string;
  adapter: Exclude<AdapterName, 'replay'>;
  model: string;
  recordedAt: string;
  /** See promptFingerprint(). The full prompt is stored too, so a reviewer can see exactly what the model was given. */
  promptFingerprint: string;
  prompt: string;
  raw: unknown;
}

const CASSETTE_DIR = path.resolve(__dirname, '..', 'cassettes');
const cassettePath = (target: string) => path.join(CASSETTE_DIR, `${target}.json`);
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

const SNAPSHOT_HEADING = 'ACCESSIBILITY SNAPSHOT AT FAILURE:';
const FEEDBACK_HEADING = 'PREVIOUS CANDIDATES WERE REJECTED BY VALIDATION ON THE LIVE PAGE:';

/** [before, after] the first occurrence of `marker`; `after` is '' when it is absent. */
const splitAt = (text: string, marker: string): [string, string] => {
  const i = text.indexOf(marker);
  return i < 0 ? [text, ''] : [text.slice(0, i), text.slice(i)];
};

/**
 * Fingerprint of what the model was asked, ignoring live noise: digits everywhere, and inside
 * the accessibility SNAPSHOT also element refs and values after `:` (input values, prices). So
 * "prompt changed since recording" means the page's structure, the failure or the round-2
 * feedback changed, not that an ad rotated or a number moved. Value-stripping is limited to the
 * snapshot: applied to the feedback section it erased the rejected candidates and their reasons,
 * so a stale round-2 cassette looked "unchanged".
 */
export function promptFingerprint(prompt: string): string {
  const [beforeFeedback, feedback] = splitAt(prompt, FEEDBACK_HEADING);
  const [head, snapshot] = splitAt(beforeFeedback, SNAPSHOT_HEADING);
  const snapshotStructure = snapshot
    .replace(/\s*\[(ref|cursor|active|level)=?[^\]]*\]/g, '')
    .replace(/(^\s*- [^:\n]*?):\s.*$/gm, '$1');
  return sha256(
    [head, snapshotStructure, feedback].map((part) => part.replace(/\d+/g, '#')).join('\u0000'),
  );
}

/**
 * Draft-07, without the `$schema` key: Claude Code's validator rejects zod's default 2020-12
 * meta-schema URI ("no schema with key or ref .../draft/2020-12/schema"), found on the first run.
 */
const jsonSchema = () => {
  const schema: Record<string, unknown> = z.toJSONSchema(HealResponseSchema, { target: 'draft-7' });
  delete schema.$schema;
  return JSON.stringify(schema);
};

function callClaudeCode(prompt: string): unknown {
  const args = [
    '-p',
    '--output-format',
    'json',
    '--model',
    env.HEAL_MODEL,
    '--system-prompt',
    SYSTEM_PROMPT,
    '--json-schema',
    jsonSchema(),
    '--tools',
    '',
    '--strict-mcp-config',
    '--disable-slash-commands',
    '--no-session-persistence',
  ];
  const run = spawnSync('claude', args, {
    input: prompt,
    encoding: 'utf8',
    timeout: 300_000,
    maxBuffer: 20 * 1024 * 1024,
    // No shell: `claude` is a native executable, and the JSON schema / system prompt must reach
    // it byte-for-byte (a shell would re-interpret quotes and newlines).
  });
  if (run.error) throw new Error(`could not start Claude Code: ${run.error.message}`);
  let envelope: { is_error?: boolean; result?: string; structured_output?: unknown };
  try {
    envelope = JSON.parse(run.stdout) as typeof envelope;
  } catch {
    throw new Error(
      `Claude Code returned non-JSON output: ${(run.stdout || run.stderr).slice(0, 300)}`,
    );
  }
  if (envelope.is_error) throw new Error(`Claude Code error: ${envelope.result ?? 'unknown'}`);
  return envelope.structured_output ?? JSON.parse(envelope.result ?? 'null');
}

async function callAnthropic(prompt: string): Promise<unknown> {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set (see .env.example)');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env.HEAL_MODEL,
      max_tokens: 2000,
      system: `${SYSTEM_PROMPT}\nJSON schema:\n${jsonSchema()}`,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!response.ok) throw new Error(`Anthropic API ${response.status}: ${await response.text()}`);
  const body = (await response.json()) as { content: { type: string; text?: string }[] };
  const textBlock = body.content.find((b) => b.type === 'text')?.text ?? '';
  return JSON.parse(/\{[\s\S]*\}/.exec(textBlock)?.[0] ?? 'null');
}

/**
 * Default: replay a recorded response when one exists, otherwise ask Claude Code live.
 * `--record` always asks a real model (HEAL_LLM may pick which one): before, an existing
 * cassette won, so a "fresh live run" silently replayed old answers.
 */
export function chooseAdapter(
  target: string,
  record: boolean,
  forced: AdapterName | undefined = env.HEAL_LLM,
): AdapterName {
  if (record) {
    if (forced === 'replay') throw new Error('--record needs a live model; unset HEAL_LLM=replay');
    return forced ?? 'claude-code';
  }
  if (forced) return forced;
  return existsSync(cassettePath(target)) ? 'replay' : 'claude-code';
}

export async function askModel(
  target: string,
  prompt: string,
  options: { record: boolean },
): Promise<{ adapter: AdapterName; model: string; raw: unknown; promptChanged?: boolean }> {
  const adapter = chooseAdapter(target, options.record);
  if (adapter === 'replay') {
    if (!existsSync(cassettePath(target))) {
      throw new Error(`No recorded response for "${target}" (HEAL_LLM=replay)`);
    }
    const cassette = JSON.parse(readFileSync(cassettePath(target), 'utf8')) as Cassette;
    return {
      adapter,
      model: `${cassette.model} (recorded ${cassette.recordedAt} via ${cassette.adapter})`,
      raw: cassette.raw,
      // Recomputed from the stored prompt, so a change to the fingerprint rules can't make every
      // cassette look stale.
      promptChanged: promptFingerprint(cassette.prompt) !== promptFingerprint(prompt),
    };
  }
  const raw = adapter === 'claude-code' ? callClaudeCode(prompt) : await callAnthropic(prompt);
  if (options.record) {
    mkdirSync(CASSETTE_DIR, { recursive: true });
    const cassette: Cassette = {
      target,
      adapter,
      model: env.HEAL_MODEL,
      recordedAt: new Date().toISOString(),
      promptFingerprint: promptFingerprint(prompt),
      prompt,
      raw,
    };
    writeFileSync(cassettePath(target), `${JSON.stringify(cassette, null, 2)}\n`, 'utf8');
    // A new round-1 answer makes any recorded follow-up rounds stale: they answered feedback
    // about different candidates. Remove them; a later round is recorded again if it happens.
    if (!target.includes('--round-')) {
      for (const name of readdirSync(CASSETTE_DIR)) {
        if (name.startsWith(`${target}--round-`)) rmSync(path.join(CASSETTE_DIR, name));
      }
    }
  }
  return { adapter, model: env.HEAL_MODEL, raw };
}
