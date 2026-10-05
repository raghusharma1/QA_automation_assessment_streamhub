import { expect } from '@playwright/test';
import type { DataTable } from 'playwright-bdd';
import { z } from 'zod';
import type { ApiResult } from '../../api-clients/ApiClient';
import {
  CONTRACTS,
  MatchContract,
  PlayerContract,
  ProblemContract,
  type ContractName,
  type MatchT,
  type PlayerT,
  type ProblemT,
} from '../../api-clients/contracts';
import { requireResponse, Then } from '../../fixtures';

function parseOrFail<T extends z.ZodType>(schema: T, body: unknown, what: string): z.output<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new Error(
      `Response does not match the ${what} contract:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

function toContract(name: string): ContractName {
  if (!(name in CONTRACTS)) {
    throw new Error(`Unknown contract "${name}". Known: ${Object.keys(CONTRACTS).join(', ')}`);
  }
  return name as ContractName;
}

/** Items of a list response, validated against a minimal `{ data: [...] }` envelope. */
function items(res: ApiResult): Record<string, unknown>[] {
  return parseOrFail(
    z.object({ data: z.array(z.record(z.string(), z.unknown())) }),
    res.body,
    'list',
  ).data;
}

const meta = (res: ApiResult) =>
  parseOrFail(
    z.object({
      meta: z.object({
        page: z.number(),
        limit: z.number(),
        total: z.number(),
        totalPages: z.number(),
      }),
    }),
    res.body,
    'paged list',
  ).meta;

/** Every problem response must be application/problem+json and match the RFC 9457 contract. */
function problemOf(res: ApiResult): ProblemT {
  expect(res.contentType, 'problem media type').toMatch(/^application\/problem\+json/);
  const problem = parseOrFail(ProblemContract, res.body, 'problem');
  expect(problem.status, 'problem.status equals the HTTP status').toBe(res.status);
  expect(new URL(res.url).pathname, 'problem.instance is the request path').toBe(problem.instance);
  return problem;
}

const compare = (a: unknown, b: unknown) =>
  typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'en');

function expectOrdered(rows: Record<string, unknown>[], keys: { field: string; dir: 1 | -1 }[]) {
  for (let i = 1; i < rows.length; i++) {
    const [prev, curr] = [rows[i - 1]!, rows[i]!];
    for (const { field, dir } of keys) {
      const order = compare(prev[field], curr[field]) * dir;
      expect(
        order,
        `row ${i} vs ${i - 1} by ${field}: ${String(prev[field])} -> ${String(curr[field])}`,
      ).toBeLessThanOrEqual(0);
      if (order < 0) break; // strictly ordered on this key; later keys don't apply
    }
  }
}

const direction = (word: string): 1 | -1 => {
  if (word === 'ascending') return 1;
  if (word === 'descending') return -1;
  throw new Error(`Direction must be "ascending" or "descending", got "${word}"`);
};

// ---------- status, headers, contracts ----------

Then('the response status is {int}', ({ ctx }, status: number) => {
  const res = requireResponse(ctx);
  expect(res.status, `${res.method} ${res.url}`).toBe(status);
});

Then('the response header {string} is {string}', ({ ctx }, name: string, value: string) => {
  expect(requireResponse(ctx).headers[name.toLowerCase()]).toBe(value);
});

Then('the response matches the {string} contract', ({ ctx }, name: string) => {
  const res = requireResponse(ctx);
  expect(res.contentType, 'success media type').toMatch(/^application\/json/);
  parseOrFail(CONTRACTS[toContract(name)], res.body, name);
});

Then('the response field {string} is {string}', ({ ctx }, field: string, value: string) => {
  const body = requireResponse(ctx).body as Record<string, unknown>;
  expect(String(body[field])).toBe(value);
});

// ---------- lists, pagination, ordering ----------

Then('the response contains {int} items', ({ ctx }, count: number) => {
  expect(items(requireResponse(ctx))).toHaveLength(count);
});

Then(
  'the page metadata is page {int} of {int} with limit {int} and {int} results in total',
  ({ ctx }, page: number, totalPages: number, limit: number, total: number) => {
    expect(meta(requireResponse(ctx))).toEqual({ page, limit, total, totalPages });
  },
);

Then('the page metadata reports {int} results in total', ({ ctx }, total: number) => {
  expect(meta(requireResponse(ctx)).total).toBe(total);
});

Then('the item ids are, in order: {string}', ({ ctx }, ids: string) => {
  const expected = ids.split(',').map((s) => s.trim());
  expect(items(requireResponse(ctx)).map((row) => String(row.id))).toEqual(expected);
});

Then('the item names are, in order: {string}', ({ ctx }, names: string) => {
  const expected = names.split(',').map((s) => s.trim());
  expect(items(requireResponse(ctx)).map((row) => String(row.name))).toEqual(expected);
});

Then('the first item is {string}', ({ ctx }, name: string) => {
  expect(items(requireResponse(ctx))[0]?.name).toBe(name);
});

Then('the items are ordered by {string} {word}', ({ ctx }, field: string, dir: string) => {
  expectOrdered(items(requireResponse(ctx)), [{ field, dir: direction(dir) }]);
});

Then(
  'the items are ordered by {string} {word}, then by {string} {word}',
  ({ ctx }, f1: string, d1: string, f2: string, d2: string) => {
    expectOrdered(items(requireResponse(ctx)), [
      { field: f1, dir: direction(d1) },
      { field: f2, dir: direction(d2) },
    ]);
  },
);

// ---------- filter properties: every returned row must satisfy the filter ----------

const PLAYER_FILTERS: Record<string, (p: PlayerT, v: string) => boolean> = {
  team: (p, v) => p.teamId === v,
  role: (p, v) => p.role === v,
  q: (p, v) => p.name.toLowerCase().includes(v.trim().toLowerCase()),
  minRuns: (p, v) => p.runs >= Number(v),
  maxRuns: (p, v) => p.runs <= Number(v),
};

const MATCH_FILTERS: Record<string, (m: MatchT, v: string) => boolean> = {
  season: (m, v) => m.season === Number(v),
  team: (m, v) => m.homeTeamId === v || m.awayTeamId === v,
  stage: (m, v) => m.stage === v,
  from: (m, v) => m.date >= v,
  to: (m, v) => m.date <= v,
};

Then('every player satisfies {word} {string}', ({ ctx }, param: string, value: string) => {
  const holds = PLAYER_FILTERS[param];
  if (!holds) throw new Error(`No property check for player filter "${param}"`);
  const players = items(requireResponse(ctx)).map((row) =>
    parseOrFail(PlayerContract, row, 'player'),
  );
  expect(players.length, 'filter returned rows to check').toBeGreaterThan(0);
  for (const p of players) expect(holds(p, value), `${p.name} vs ${param}=${value}`).toBe(true);
});

Then('every match satisfies {word} {string}', ({ ctx }, param: string, value: string) => {
  const holds = MATCH_FILTERS[param];
  if (!holds) throw new Error(`No property check for match filter "${param}"`);
  const matches = items(requireResponse(ctx)).map((row) =>
    parseOrFail(MatchContract, row, 'match'),
  );
  expect(matches.length, 'filter returned rows to check').toBeGreaterThan(0);
  for (const m of matches) expect(holds(m, value), `match ${m.id} vs ${param}=${value}`).toBe(true);
});

// ---------- problem documents ----------

Then('the response is a problem document with title {string}', ({ ctx }, title: string) => {
  expect(problemOf(requireResponse(ctx)).title).toBe(title);
});

Then(
  'the problem lists an error for {string} with code {string}',
  ({ ctx }, param: string, code: string) => {
    const { errors = [] } = problemOf(requireResponse(ctx));
    expect(errors).toContainEqual(expect.objectContaining({ param, code }));
  },
);

Then(
  'the problem lists an error for {string} with code {string} and message {string}',
  ({ ctx }, param: string, code: string, message: string) => {
    const { errors = [] } = problemOf(requireResponse(ctx));
    expect(errors).toContainEqual({ param, code, message });
  },
);

Then('the problem lists exactly these errors:', ({ ctx }, table: DataTable) => {
  const { errors = [] } = problemOf(requireResponse(ctx));
  const asKeys = (rows: { param?: string; code?: string }[]) =>
    rows.map(({ param, code }) => `${param}:${code}`).sort();
  expect(asKeys(errors)).toEqual(asKeys(table.hashes()));
});
