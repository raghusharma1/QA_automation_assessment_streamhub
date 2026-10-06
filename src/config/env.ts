/**
 * Typed, validated test configuration.
 *
 * Precedence (first value wins, dotenv never overrides):
 *   1. real process env vars (CI secrets, `cross-env TEST_ENV=ci ...`)
 *   2. root `.env`           -> git-ignored, secrets only (ANTHROPIC_API_KEY, ...)
 *   3. `env/<TEST_ENV>.env`  -> committed, non-secret per-environment values (URLs, timeouts)
 *
 * Nothing else in the test framework reads process.env directly (the API under test, in api/,
 * has its own minimal config on purpose); import `env` from here.
 */
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

const ENVIRONMENTS = ['local', 'ci'] as const;
const testEnv = process.env.TEST_ENV ?? 'local';
// Resolve from this file, not process.cwd(), so IDE runners and subfolder invocations still
// load the right files.
const repoRoot = path.resolve(__dirname, '..', '..');

dotenv.config({
  path: [path.join(repoRoot, '.env'), path.join(repoRoot, 'env', `${testEnv}.env`)],
  quiet: true,
});
// TEST_ENV picks the env file, so it must come from the real environment. One set in .env
// would be loaded too late to have any effect: say so instead of silently using "local".
if ((process.env.TEST_ENV ?? 'local') !== testEnv) {
  throw new Error('Set TEST_ENV in the shell (e.g. `npm run test:ci`), not in .env.');
}

const optionalInt = (schema: z.ZodInt) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? undefined : Number(v)))
    .pipe(schema.optional());

const EnvSchema = z.object({
  TEST_ENV: z.enum(ENVIRONMENTS),
  // Set to "true" by GitHub Actions and most CI services.
  CI: z.stringbool().default(false),
  EMI_BASE_URL: z.url(),
  API_PORT: z.coerce.number().int().min(1).max(65535),
  // Optional override (e.g. a deployed API). Defaults to http://localhost:<API_PORT>.
  API_BASE_URL: z.url().optional(),
  HEADLESS: z.stringbool().default(true),
  // A count, or a percentage of CPU cores ("50%"), as Playwright accepts.
  WORKERS: z.union([
    z.string().regex(/^\d{1,3}%$/, 'WORKERS must be a positive integer or a percentage like 50%'),
    optionalInt(z.int().positive()),
  ]),
  RETRIES: optionalInt(z.int().min(0)),
  TEST_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  EXPECT_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  // Block ads/analytics/consent scripts on the third-party site for deterministic UI tests.
  BLOCK_THIRD_PARTY: z.stringbool().default(true),
  // Self-healing POC: optional, used only with HEAL_LLM=anthropic (the default is replayed
  // cassettes, else headless Claude Code). An empty value (as in .env.example) counts as unset.
  ANTHROPIC_API_KEY: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined)),
  HEAL_MODEL: z.string().min(1).default('claude-sonnet-5-5'),
  // Forces a model adapter. Default: replay a recorded cassette if present, else Claude Code.
  HEAL_LLM: z.enum(['claude-code', 'anthropic', 'replay']).optional(),
  // When true, SQL tests (re)write their screenshots and raw outputs into sql/results/.
  SQL_EVIDENCE: z.stringbool().default(false),
});

const parsed = EnvSchema.safeParse({ ...process.env, TEST_ENV: testEnv });
if (!parsed.success) {
  // Fail fast with a readable message. Never echo values: they may contain secrets.
  throw new Error(
    `Invalid test configuration (TEST_ENV=${testEnv}):\n${z.prettifyError(parsed.error)}`,
  );
}

export const env = Object.freeze({
  ...parsed.data,
  API_BASE_URL: parsed.data.API_BASE_URL ?? `http://localhost:${parsed.data.API_PORT}`,
  /** True when API_BASE_URL points at an API someone else runs: don't start our own. */
  API_IS_EXTERNAL: parsed.data.API_BASE_URL !== undefined,
});
export type Env = typeof env;
