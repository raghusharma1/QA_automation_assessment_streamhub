# Mock data: IPL 2024 style

Hand-curated JSON that acts as the API's mock database. No real database connection is used.

**Illustrative sample data, not official statistics.** Team and player names and the 2024 season
structure (opener, playoffs, final) follow the real tournament. Fixtures, results and figures are
approximate and are there to give the API realistic, varied data. Don't use them as a source of
IPL records.

| File           | Rows             | Used by                                                       |
| -------------- | ---------------- | ------------------------------------------------------------- |
| `teams.json`   | 10               | `GET /api/teams`                                              |
| `players.json` | 36               | `GET /api/players`, `GET /api/players/:id`                    |
| `matches.json` | 24 (season 2024) | `GET /api/matches`, and the SQL scenario 2 seed (milestone 5) |

The data is frozen: API tests assert exact counts and orderings against it. If you change a row,
update the matching feature files.
