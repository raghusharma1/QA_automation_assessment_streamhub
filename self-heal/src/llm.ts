/**
 * Model adapters. All return the RAW model output; candidates.ts validates it with zod.
 *
 * - claude-code: headless Claude Code (`claude -p`) with the developer's existing login. No API
 *   key, no tools, no MCP servers, no session saved: the model can only answer.
 * - anthropic:   the Messages API, only if ANTHROPIC_API_KEY is set in the git-ignored .env.
 * - replay:      a recorded response ("cassette") from an earlier real run, for offline,
 *                deterministic re-runs. Cassettes are committed as evidence of what the model said.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

/**
 * Fingerprint of what the model was asked, ignoring live noise: snapshot element refs, values
 * after `:` (input values, prices) and digits. So "prompt changed since recording" means the
 * page's STRUCTURE or the failure changed, not that an ad rotated or a number moved.
 */
export function promptFingerprint(prompt: string): string {
  const normalised = prompt
    .replace(/\s*\[(ref|cursor|active|level)=?[^\]]*\]/g, '')
    .replace(/(^\s*- [^:\n]*?):\s.*$/gm, '$1')
    .replace(/\d+/g, '#');
  return sha256(normalised);
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

/** Default: replay a recorded response when one exists, otherwise ask Claude Code live. */
export function chooseAdapter(target: string): AdapterName {
  if (env.HEAL_LLM) return env.HEAL_LLM;
  return existsSync(cassettePath(target)) ? 'replay' : 'claude-code';
}

export async function askModel(
  target: string,
  prompt: string,
  options: { record: boolean },
): Promise<{ adapter: AdapterName; model: string; raw: unknown; promptChanged?: boolean }> {
  const adapter = chooseAdapter(target);
  if (adapter === 'replay') {
    const cassette = JSON.parse(readFileSync(cassettePath(target), 'utf8')) as Cassette;
    return {
      adapter,
      model: `${cassette.model} (recorded ${cassette.recordedAt} via ${cassette.adapter})`,
      raw: cassette.raw,
      promptChanged: cassette.promptFingerprint !== promptFingerprint(prompt),
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
  }
  return { adapter, model: env.HEAL_MODEL, raw };
}
