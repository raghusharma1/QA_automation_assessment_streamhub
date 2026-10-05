# Research notes

These are working notes produced with Claude Code before and during implementation. Sub-agents
researched each topic against official docs and the npm registry, and every note cites its sources.
They are kept to show the AI-assisted process. They are not required reading for running the
project.

| File | Topic | Status |
|---|---|---|
| [01-framework-playwright-bdd.md](01-framework-playwright-bdd.md) | Runner choice (playwright-bdd vs @cucumber/cucumber), config, fixtures, reporting | Basis of the framework |
| [02-emicalculator-recon.md](02-emicalculator-recon.md) | Static recon of emicalculator.net (HTML and JS source) | **Superseded by 06** where they differ |
| [03-locators-self-healing-ai.md](03-locators-self-healing-ai.md) | Locator best practices, Playwright AI tooling, self-healing design | Basis of `self-heal/` |
| [04-api-build-and-test.md](04-api-build-and-test.md) | API framework choice and design, Playwright API testing, JSONPlaceholder behaviour | Basis of `api/` |
| [05-sql-scenarios.md](05-sql-scenarios.md) | SQL engine choice, both scenarios, edge cases, verified outputs | Basis of `sql/` |
| [06-live-recon-verified.md](06-live-recon-verified.md) | Live browser recon of emicalculator.net with playwright-cli | **Authoritative** for UI tests |

Where AI output in these notes turned out to be wrong, the correction is recorded in
[../ai-log.md](../ai-log.md).
