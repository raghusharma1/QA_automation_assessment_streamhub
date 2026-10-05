/**
 * The "database": frozen JSON files plus pure filter / sort / paginate functions.
 * Kept free of HTTP concerns so the query logic is easy to read and reason about.
 */
import matchesData from '../data/matches.json';
import playersData from '../data/players.json';
import teamsData from '../data/teams.json';
import type { MatchesQueryT, PlayersQueryT, TeamsQueryT } from './schemas';

export type Team = (typeof teamsData)[number];
export type Player = (typeof playersData)[number];
export type Match = (typeof matchesData)[number];

export interface Page<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

type Row = Record<string, unknown> & { id: number | string };

/**
 * Strings sort alphabetically, ignoring case ("Mohammed Siraj" before "MS Dhoni"); numbers sort
 * numerically. A plain `<` would compare UTF-16 code units and put every capital letter before
 * every lowercase one, which is the bug the API tests caught.
 */
const collator = new Intl.Collator('en', { sensitivity: 'base' });
const compareValues = (x: unknown, y: unknown): number =>
  typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y));

/** Stable multi-field sort. `id` is the final tie-breaker so equal keys keep a fixed order. */
function sortRows<T extends Row>(rows: T[], sort: string | undefined): T[] {
  if (!sort) return rows;
  const keys = sort.split(',').map((f) => ({
    field: f.replace(/^-/, ''),
    dir: f.startsWith('-') ? -1 : 1,
  }));
  return [...rows].sort((a, b) => {
    for (const { field, dir } of keys) {
      const order = compareValues(a[field], b[field]);
      if (order !== 0) return order * dir;
    }
    return compareValues(a.id, b.id);
  });
}

function paginate<T>(rows: T[], page: number, limit: number): Page<T> {
  const total = rows.length;
  return {
    data: rows.slice((page - 1) * limit, page * limit),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export function listTeams(q: TeamsQueryT): Team[] {
  return sortRows(teamsData, q.sort);
}

export function listPlayers(q: PlayersQueryT): Page<Player> {
  const term = q.q?.toLowerCase();
  const rows = playersData.filter(
    (p) =>
      (!q.team || p.teamId === q.team) &&
      (!q.role || p.role === q.role) &&
      (!term || p.name.toLowerCase().includes(term)) &&
      (q.minRuns === undefined || p.runs >= q.minRuns) &&
      (q.maxRuns === undefined || p.runs <= q.maxRuns),
  );
  return paginate(sortRows(rows, q.sort), q.page, q.limit);
}

export function getPlayer(id: number): Player | undefined {
  return playersData.find((p) => p.id === id);
}

export function listMatches(q: MatchesQueryT): Page<Match> {
  const rows = matchesData.filter(
    (m) =>
      m.season === q.season &&
      (!q.team || m.homeTeamId === q.team || m.awayTeamId === q.team) &&
      (!q.stage || m.stage === q.stage) &&
      (!q.from || m.date >= q.from) &&
      (!q.to || m.date <= q.to),
  );
  return paginate(sortRows(rows, q.sort), q.page, q.limit);
}
