import type { APIRequestContext, TestInfo } from '@playwright/test';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** A captured response: everything later steps need, read once. */
export interface ApiResult {
  method: HttpMethod;
  url: string;
  status: number;
  contentType: string;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * The API equivalent of a page object: one place that knows how to call the service, so steps
 * stay declarative. It wraps Playwright's APIRequestContext (baseURL comes from the `api`
 * project config, i.e. env/<TEST_ENV>.env) and attaches every exchange to the report.
 *
 * Paths are relative (no leading slash) so they resolve under baseURL. A leading "/" would
 * discard any path segment in baseURL.
 */
export class ApiClient {
  constructor(
    private readonly request: APIRequestContext,
    private readonly testInfo: TestInfo,
  ) {}

  async send(method: HttpMethod, path: string): Promise<ApiResult> {
    const relative = path.replace(/^\//, '');
    const response = await this.request.fetch(relative, { method, failOnStatusCode: false });
    const text = await response.text();
    const contentType = response.headers()['content-type'] ?? '';
    const result: ApiResult = {
      method,
      url: response.url(),
      status: response.status(),
      contentType,
      headers: response.headers(),
      body: /json/.test(contentType) && text ? (JSON.parse(text) as unknown) : text,
    };
    await this.testInfo.attach(`${method} ${relative}`, {
      body: JSON.stringify(
        {
          request: { method, url: result.url },
          response: { status: result.status, headers: result.headers, body: result.body },
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });
    return result;
  }

  get(path: string): Promise<ApiResult> {
    return this.send('GET', path);
  }
}

/** Builds `path?k=v&...` from a parameter table, keeping the order given. */
export function withQuery(path: string, params: Record<string, string>): string {
  const query = new URLSearchParams(params).toString();
  return query ? `${path}?${query}` : path;
}

/** Resource clients: typed entry points for the happy-path steps. */
export class IplApi {
  constructor(readonly client: ApiClient) {}

  teams(params: Record<string, string> = {}) {
    return this.client.get(withQuery('api/teams', params));
  }

  players(params: Record<string, string> = {}) {
    return this.client.get(withQuery('api/players', params));
  }

  player(id: string | number) {
    return this.client.get(`api/players/${id}`);
  }

  matches(params: Record<string, string> = {}) {
    return this.client.get(withQuery('api/matches', params));
  }
}
