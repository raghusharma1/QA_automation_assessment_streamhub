/**
 * Query and path validation. Every rule has an explicit, human-readable message: clients (and
 * the tests) rely on these, never on zod's default wording, which changes between versions.
 *
 * Integers are validated as digit strings before conversion. z.coerce.number() would accept
 * "" (-> 0), "1e2" (-> 100) and " 5 ", which are not valid page numbers.
 */
import { z } from 'zod';

export const TEAM_IDS = [
  'CSK',
  'DC',
  'GT',
  'KKR',
  'LSG',
  'MI',
  'PBKS',
  'RR',
  'RCB',
  'SRH',
] as const;
export const ROLES = ['BATTER', 'BOWLER', 'ALL_ROUNDER', 'WICKET_KEEPER'] as const;
export const STAGES = ['LEAGUE', 'QUALIFIER_1', 'ELIMINATOR', 'QUALIFIER_2', 'FINAL'] as const;

/** First IPL season, and the latest season this API serves. */
export const SEASON_RANGE = { min: 2008, max: 2024 } as const;
export const MAX_LIMIT = 100;

const intParam = (name: string, min: number, max: number) => {
  const message = `${name} must be an integer between ${min} and ${max}`;
  return (
    z
      .string({ error: message })
      .regex(/^\d+$/, message)
      .transform(Number)
      // { error } here too: a 310+ digit string becomes Infinity, which would otherwise get
      // zod's default wording ("expected number, received Infinity").
      .pipe(z.number({ error: message }).int(message).min(min, message).max(max, message))
  );
};

const enumParam = <T extends readonly [string, ...string[]]>(name: string, values: T) =>
  z.enum(values, { error: `${name} must be one of: ${values.join(', ')}` });

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isRealDate = (s: string) =>
  ISO_DATE.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s);

const isoDate = (name: string) =>
  z
    .string({ error: `${name} must be a date in YYYY-MM-DD format` })
    // abort: a malformed value gets one error, not also "must be a real calendar date".
    .regex(ISO_DATE, { error: `${name} must be a date in YYYY-MM-DD format`, abort: true })
    .refine(isRealDate, `${name} must be a real calendar date`);

/** `sort=-runs,name`: comma-separated whitelisted fields, `-` prefix = descending. */
const sortParam = (fields: readonly string[]) => {
  const message = `sort must be a comma-separated list of: ${fields.join(', ')} (prefix with - for descending)`;
  return z
    .string({ error: message })
    .refine((s) => s.split(',').every((f) => fields.includes(f.replace(/^-/, ''))), message);
};

const pagination = {
  page: intParam('page', 1, 10_000).default(1),
  limit: intParam('limit', 1, MAX_LIMIT).default(10),
};

export const PLAYER_SORT_FIELDS = ['name', 'runs', 'wickets', 'matches', 'strikeRate'] as const;
export const PlayersQuery = z
  .strictObject({
    ...pagination,
    sort: sortParam(PLAYER_SORT_FIELDS).optional(),
    team: enumParam('team', TEAM_IDS).optional(),
    role: enumParam('role', ROLES).optional(),
    q: z
      .string({ error: 'q must be a search term of 2 to 50 characters' })
      .trim()
      .min(2, 'q must be a search term of 2 to 50 characters')
      .max(50, 'q must be a search term of 2 to 50 characters')
      .optional(),
    minRuns: intParam('minRuns', 0, 100_000).optional(),
    maxRuns: intParam('maxRuns', 0, 100_000).optional(),
  })
  // Cross-field rules only compare values that are valid on their own. zod 4 still runs an
  // object refine after a field has failed (with the raw input), which would add a second,
  // misleading error to `minRuns=abc&maxRuns=1`.
  .refine(
    (v) => typeof v.minRuns !== 'number' || typeof v.maxRuns !== 'number' || v.minRuns <= v.maxRuns,
    {
      message: 'minRuns must be less than or equal to maxRuns',
      path: ['minRuns'],
    },
  );

export const MATCH_SORT_FIELDS = ['date', 'id'] as const;
export const MatchesQuery = z
  .strictObject({
    ...pagination,
    // Required on purpose: a match list is always scoped to one season.
    season: intParam('season', SEASON_RANGE.min, SEASON_RANGE.max),
    sort: sortParam(MATCH_SORT_FIELDS).optional(),
    team: enumParam('team', TEAM_IDS).optional(),
    stage: enumParam('stage', STAGES).optional(),
    from: isoDate('from').optional(),
    to: isoDate('to').optional(),
  })
  .refine(
    (v) =>
      v.from === undefined ||
      v.to === undefined ||
      !isRealDate(v.from) ||
      !isRealDate(v.to) ||
      v.from <= v.to,
    { message: 'from must be on or before to', path: ['from'] },
  );

export const TEAM_SORT_FIELDS = ['name', 'titles'] as const;
export const TeamsQuery = z.strictObject({ sort: sortParam(TEAM_SORT_FIELDS).optional() });

/** Endpoints that take no query parameters still reject unknown ones, consistently. */
export const NoQuery = z.strictObject({});

export const IdParam = z.object({
  id: z
    .string()
    .regex(
      /^[1-9]\d{0,8}$/,
      'id must be a positive integer of at most 9 digits, without leading zeros',
    )
    .transform(Number),
});

export type PlayersQueryT = z.output<typeof PlayersQuery>;
export type MatchesQueryT = z.output<typeof MatchesQuery>;
export type TeamsQueryT = z.output<typeof TeamsQuery>;
