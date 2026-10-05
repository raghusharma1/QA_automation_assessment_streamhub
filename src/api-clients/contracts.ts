/**
 * Consumer-side contracts for the IPL stats API, written from its documented contract
 * (api/README.md) and deliberately NOT imported from api/src. If the API's own schemas or
 * serialisation drift, these independent schemas catch it. Sharing one schema between producer
 * and test would make them agree by construction. ESLint enforces the separation
 * (no-restricted-imports in eslint.config.mjs).
 *
 * Strict objects: an unexpected extra field is a contract change and should fail loudly.
 */
import { z } from 'zod';

const teamId = z.enum(['CSK', 'DC', 'GT', 'KKR', 'LSG', 'MI', 'PBKS', 'RR', 'RCB', 'SRH']);

export const TeamContract = z.strictObject({
  id: teamId,
  name: z.string().min(1),
  city: z.string().min(1),
  titles: z.number().int().min(0),
});

export const PlayerContract = z.strictObject({
  id: z.number().int().positive(),
  name: z.string().min(1),
  teamId,
  role: z.enum(['BATTER', 'BOWLER', 'ALL_ROUNDER', 'WICKET_KEEPER']),
  nationality: z.string().min(1),
  matches: z.number().int().min(0),
  runs: z.number().int().min(0),
  wickets: z.number().int().min(0),
  strikeRate: z.number().min(0),
});

export const MatchContract = z.strictObject({
  id: z.number().int().positive(),
  season: z.number().int(),
  date: z.iso.date(),
  stage: z.enum(['LEAGUE', 'QUALIFIER_1', 'ELIMINATOR', 'QUALIFIER_2', 'FINAL']),
  venue: z.string().min(1),
  city: z.string().min(1),
  homeTeamId: teamId,
  awayTeamId: teamId,
  winnerTeamId: teamId.nullable(),
});

const PageMetaContract = z
  .strictObject({
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(100),
    total: z.number().int().min(0),
    totalPages: z.number().int().min(0),
  })
  .refine((m) => m.totalPages === Math.ceil(m.total / m.limit), {
    message: 'totalPages must equal ceil(total / limit)',
  });

const paged = <T extends z.ZodType>(item: T) =>
  z
    .strictObject({ data: z.array(item), meta: PageMetaContract })
    .refine((p) => p.data.length <= p.meta.limit, { message: 'page holds more than limit items' });

export const ProblemContract = z.strictObject({
  type: z.string().min(1),
  title: z.string().min(1),
  status: z.number().int().min(400).max(599),
  detail: z.string().min(1),
  instance: z.string().startsWith('/'),
  errors: z
    .array(
      z.strictObject({
        param: z.string().min(1),
        code: z.enum(['missing', 'unknown_parameter', 'invalid']),
        message: z.string().min(1),
      }),
    )
    .min(1)
    .optional(),
});

/** Contract names as used in feature files: `the response matches the "player list" contract`. */
export const CONTRACTS = {
  health: z.strictObject({ status: z.literal('ok') }),
  'team list': z.strictObject({ data: z.array(TeamContract) }),
  player: PlayerContract,
  'player list': paged(PlayerContract),
  'match list': paged(MatchContract),
  problem: ProblemContract,
} as const;

export type ContractName = keyof typeof CONTRACTS;
export type PlayerT = z.infer<typeof PlayerContract>;
export type MatchT = z.infer<typeof MatchContract>;
export type TeamT = z.infer<typeof TeamContract>;
export type ProblemT = z.infer<typeof ProblemContract>;
