import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** One invalid parameter. `code` is this API's own vocabulary, not zod's. */
export interface ParamIssue {
  param: string;
  code: 'missing' | 'unknown_parameter' | 'invalid';
  message: string;
}

/**
 * RFC 9457 "Problem Details" response (media type application/problem+json), with an `errors`
 * extension listing every invalid parameter, so a client can fix all of them in one go.
 */
export function problem(
  c: Context,
  status: ContentfulStatusCode,
  title: string,
  detail: string,
  errors?: ParamIssue[],
) {
  const body = {
    type: 'about:blank',
    title,
    status,
    detail,
    instance: c.req.path,
    ...(errors ? { errors } : {}),
  };
  return c.body(JSON.stringify(body), status, { 'Content-Type': 'application/problem+json' });
}
