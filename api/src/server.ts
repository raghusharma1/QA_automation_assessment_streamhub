import { serve } from '@hono/node-server';
import { app } from './app';

// The API is the system under test, so it has its own minimal config and does not import the
// test framework's. Playwright's webServer passes API_PORT from env/<TEST_ENV>.env.
const port = Number(process.env.API_PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`API_PORT must be a port number, got "${process.env.API_PORT}"`);
}

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`IPL stats API listening on http://localhost:${info.port}`);
});
