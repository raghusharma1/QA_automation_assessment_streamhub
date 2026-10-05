import { zValidator } from '@hono/zod-validator';
import { Hono, type Context } from 'hono';
import type { z } from 'zod';
import { problem, type ParamIssue } from './problem';
import { getPlayer, listMatches, listPlayers, listTeams } from './repo';
import { IdParam, MatchesQuery, NoQuery, PlayersQuery, TeamsQuery } from './schemas';

/** Maps zod issues to this API's error vocabulary (missing / unknown_parameter / invalid). */
function toIssues(error: z.core.$ZodError, c: Context, target: 'query' | 'param'): ParamIssue[] {
  const supplied = new Set(Object.keys(target === 'query' ? c.req.queries() : c.req.param()));
  return error.issues.flatMap((issue): ParamIssue[] => {
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({
        param: key,
        code: 'unknown_parameter',
        message: `${key} is not a supported parameter`,
      }));
    }
    const param = issue.path.map(String).join('.');
    if (issue.code === 'invalid_type' && !supplied.has(param)) {
      return [{ param, code: 'missing', message: `${param} is required` }];
    }
    return [{ param, code: 'invalid', message: issue.message }];
  });
}

const validate = <T extends z.ZodType>(target: 'query' | 'param', schema: T) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return problem(
        c,
        400,
        'Bad Request',
        `Invalid ${target === 'query' ? 'query' : 'path'} parameter(s)`,
        toIssues(result.error, c, target),
      );
    }
  });

export const app = new Hono();

app.get('/health', validate('query', NoQuery), (c) => c.json({ status: 'ok' }));

app.get('/api/teams', validate('query', TeamsQuery), (c) =>
  c.json({ data: listTeams(c.req.valid('query')) }),
);

app.get('/api/players', validate('query', PlayersQuery), (c) =>
  c.json(listPlayers(c.req.valid('query'))),
);

app.get('/api/players/:id', validate('param', IdParam), validate('query', NoQuery), (c) => {
  const { id } = c.req.valid('param');
  const player = getPlayer(id);
  return player ? c.json(player) : problem(c, 404, 'Not Found', `Player ${id} not found`);
});

app.get('/api/matches', validate('query', MatchesQuery), (c) =>
  c.json(listMatches(c.req.valid('query'))),
);

// Hono answers an unmatched method with 404 by default; a known path with the wrong method is
// 405 with an Allow header (RFC 9110 §15.5.6). Hono serves HEAD for every GET route, so HEAD is
// listed as allowed too.
for (const path of ['/health', '/api/teams', '/api/players', '/api/players/:id', '/api/matches']) {
  app.all(path, (c) => {
    c.header('Allow', 'GET, HEAD');
    return problem(c, 405, 'Method Not Allowed', `${c.req.method} is not allowed on ${c.req.path}`);
  });
}

app.notFound((c) => problem(c, 404, 'Not Found', `No route for ${c.req.method} ${c.req.path}`));

// Never leak internals: a generic message only (contrast: JSONPlaceholder returns stack traces).
app.onError((err, c) => {
  console.error(err);
  return problem(c, 500, 'Internal Server Error', 'An unexpected error occurred');
});
