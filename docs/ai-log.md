# AI pair-programming log

A running record of how Claude Code was used on this project: where it helped, where it was wrong,
and how each error was caught. The README's "Claude Code reflection" section is a summary of this log.

Entry types: ✅ helped · ❌ AI was wrong (and how it was caught) · 🔍 found by review

## Milestone 0: research and recon

| Type | What happened                                                                                                                                                                                                                                                                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅   | Parallel research agents compared playwright-bdd and @cucumber/cucumber, checked current package versions on npm, ran the SQL queries on PostgreSQL (PGlite) and SQLite, and sent real POSTs to JSONPlaceholder (it returns 201 for anything, and 500 for malformed JSON).                                                                              |
| ❌   | **Conflicting TypeScript advice.** One agent said to pin TS 6.0.3, another said 5.9 because "latest is 7.0.2". Checked against the registry: `typescript-eslint@8.71.0` declares `typescript >=4.8.4 <6.1.0`. So 6.0.3 is right, and 7.x would break linting.                                                                                           |
| ❌   | **Hallucinated import.** The `eslint-plugin-playwright` README imports `defineConfig` from `@eslint/config`, a package that doesn't exist on npm (the research agent got a 404). The correct import is `eslint/config`.                                                                                                                                 |
| ❌   | **Locator that looked right but wasn't.** `getByRole('link', { name: 'Personal Loan' })` looks like the obvious locator, but live recon showed it matches 2 elements (accessible names match on substrings) and fails strict mode. Fixed with `{ exact: true }`. `playwright-cli generate-locator` fell back to `#personal-loan a` for the same reason. |
| ✅   | **Race condition found in recon.** Reading the EMI text immediately after `fill` + Tab returned a stale value (`24,126`, which is the 20-year EMI) before the site recalculated. That is why every result check uses a web-first `expect(...).toHaveText()`, which retries until it matches.                                                            |
| ✅   | The static source analysis said "5 bars if the schedule starts in January, otherwise 6". Live recon confirmed 5 year-categories (10 stacked segments) for a Jan 2027 start.                                                                                                                                                                             |
| ❌   | **Destructive command by a sub-agent.** A research agent stopped its prototype server with `taskkill /F /IM node.exe`, which killed every Node process on the machine. The rule since then: never kill processes by image name.                                                                                                                         |

## Milestone 1: scaffold

| Type | What happened                                                                                                                                                                                                                                                                           |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ❌   | **My own config bug.** The env schema required a non-empty `ANTHROPIC_API_KEY` when present. Copying `.env.example` (which has `ANTHROPIC_API_KEY=`) would then fail validation on a fresh setup. Caught by testing the config with the example file; empty now means "not set".        |
| ❌   | `"type": "module"` in package.json was dropped. Playwright's ESM loader is stricter about extensionless TS imports, which gained nothing here.                                                                                                                                          |
| 🔍   | The evaluator review found the lint wasn't type-aware (`no-floating-promises` off), env paths resolved from `cwd`, `API_PORT`/`API_BASE_URL` were duplicated, `ctx` was untyped, and there was an unchecked cast from feature text. All fixed.                                          |
| 🔍   | The evaluator found plan gaps: B2 needs a **required** query param to test "missing required parameters"; sharing the API's zod schemas with the tests would be circular; committed HTML reports are not viewable on GitHub (need PNGs, a results table, Pages). All added to the plan. |

## Milestone 2: TC1 (home loan pie chart)

| Type | What happened                                                                                                                                                                                                                                                     |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅   | The EMI oracle was written test-first: 11 unit tests pin the formula and the site's rounding convention (totals come from the unrounded EMI; `round(emi) * n` would be off by ₹27 for the personal loan).                                                         |
| ✅   | **Mutation check.** The oracle was broken on purpose (rate × 1.01). Both TC1 scenarios failed precisely (`expected ₹33,176, received ₹33,038`), which shows the UI is checked against an independent value and not compared with itself. The change was reverted. |
| ✅   | The pie chart DOM only shows rounded percentages, so the tests read both the visible labels and the Highcharts model and cross-check them against the oracle (principal exact; interest to the rupee; labels to 1 dp).                                            |
| ❌   | My first draft imported a helper (`requireLoan`) from one steps file into another. Step files should only register steps, so the helper was moved to the fixtures module.                                                                                         |
