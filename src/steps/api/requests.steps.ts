import type { DataTable } from 'playwright-bdd';
import type { HttpMethod } from '../../api-clients/ApiClient';
import { When } from '../../fixtures';

const METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function toMethod(value: string): HttpMethod {
  const method = METHODS.find((m) => m === value);
  if (!method) throw new Error(`Unsupported HTTP method "${value}"`);
  return method;
}

/** Two-column table (param | value) -> query parameters, in the order written. */
const params = (table: DataTable): Record<string, string> => table.rowsHash();

// Raw request: used for the error matrices, where the query may be deliberately malformed
// (repeated keys, empty values) and must reach the API exactly as written.
When('I send a {word} request to {string}', async ({ api, ctx }, method: string, path: string) => {
  ctx.response = await api.client.send(toMethod(method), path);
});

When('I request the teams list', async ({ api, ctx }) => {
  ctx.response = await api.teams();
});

When('I request the teams list with:', async ({ api, ctx }, table: DataTable) => {
  ctx.response = await api.teams(params(table));
});

When('I request the players list', async ({ api, ctx }) => {
  ctx.response = await api.players();
});

When('I request the players list with:', async ({ api, ctx }, table: DataTable) => {
  ctx.response = await api.players(params(table));
});

When('I request the player with id {string}', async ({ api, ctx }, id: string) => {
  ctx.response = await api.player(id);
});

When('I request the matches list', async ({ api, ctx }) => {
  ctx.response = await api.matches();
});

When('I request the matches list with:', async ({ api, ctx }, table: DataTable) => {
  ctx.response = await api.matches(params(table));
});
