/**
 * Typed, validated test configuration.
 *
 * Precedence (first value wins, dotenv never overrides):
 *   1. real process env vars (CI secrets, `cross-env TEST_ENV=ci ...`)
 *   2. root `.env`           -> git-ignored, secrets only (ANTHROPIC_API_KEY, ...)
 *   3. `env/<TEST_ENV>.env`  -> committed, non-secret per-environment values (URLs, timeouts)
 *
 * Nothing else in the framework reads process.env directly; import `env` from here.
 */
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

const ENVIRONMENTS = ['local', 'ci'] as const;
const testEnv = process.env.TEST_ENV ?? 'local';

dotenv.config({
  path: [path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), 'env', `${testEnv}.env`)],
  quiet: true,
});

const optionalInt = (schema: z.ZodInt) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? undefined : Number(v)))
    .pipe(schema.optional());

const EnvSchema = z.object({
  TEST_ENV: z.enum(ENVIRONMENTS),
  EMI_BASE_URL: z.url(),
  API_PORT: z.coerce.number().int().min(1).max(65535),
  API_BASE_URL: z.url(),
  HEADLESS: z.stringbool().default(true),
  WORKERS: optionalInt(z.int().positive()),
  RETRIES: optionalInt(z.int().min(0)),
  TEST_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  EXPECT_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  // Block ads/analytics/consent scripts on the third-party site for deterministic UI tests.
  BLOCK_THIRD_PARTY: z.stringbool().default(true),
  // Self-healing POC: optional. Without a key the healer runs in deterministic mock mode.
  // An empty value (as copied from .env.example) counts as "not set".
  ANTHROPIC_API_KEY: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined)),
  HEAL_MODEL: z.string().min(1).default('claude-sonnet-5-5'),
});

const parsed = EnvSchema.safeParse({ ...process.env, TEST_ENV: testEnv });
if (!parsed.success) {
  // Fail fast with a readable message. Never echo values: they may contain secrets.
  throw new Error(
    `Invalid test configuration (TEST_ENV=${testEnv}):\n${z.prettifyError(parsed.error)}`,
  );
}

export const env = Object.freeze(parsed.data);
export type Env = typeof env;
