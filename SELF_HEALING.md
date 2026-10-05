# AI self-healing locators

How this project detects broken locators, asks an AI for replacements, and **validates every
proposal before a human sees it**. Nothing is ever applied automatically. There is a working
proof of concept (`self-heal/`), run against the live EMI calculator.

```bash
npm run lint:locators   # static: flag brittle locator shapes before they break
npm run test:broken     # run the deliberately broken scenarios (they fail, on purpose)
npm run heal            # detect -> prompt -> validate -> self-heal/out/healing-report.md
```

## Results of the live run

Model: **Claude Sonnet 5.5 via headless Claude Code**, against the live site. The real responses
are recorded in [`self-heal/cassettes/`](self-heal/cassettes), each with the **full prompt the
model received**, so a reviewer can check exactly what it saw and why it answered as it did.
`npm run heal` replays them offline and reproduces the outcome. Full report:
[self-heal/out/healing-report.md](self-heal/out/healing-report.md). Patches (each passes
`git apply --check`): [self-heal/out/patches/](self-heal/out/patches).

| Scenario                       | Outcome                              | Proposed locator                                                            |
| ------------------------------ | ------------------------------------ | --------------------------------------------------------------------------- |
| Broken 1: ambiguous regex name | ✅ proposed, re-run 3/3              | `getByRole('link', { name: 'Personal Loan', exact: true })`                 |
| Broken 2: renamed id           | ✅ proposed, re-run 3/3              | `getByRole('textbox', { name: 'Home Loan Amount', exact: true })`           |
| Broken 3: absolute XPath       | ✅ proposed, re-run 3/3              | `getByRole('textbox', { name: 'Interest Rate', exact: true })`              |
| Broken 4: positional CSS       | 🙋 **needs a human**                 | none: every candidate was ambiguous, circular or **ungrounded** (see below) |
| Broken 5: drifted text         | ✅ proposed, re-run 3/3              | `getByRole('heading', { name: 'Loan EMI', exact: true })`                   |
| Control: wrong expected value  | 🛑 **refused** before any model call | none                                                                        |

**Broken 4, candidate by candidate** (from the recorded rationales):

1. `locator('#emicalculatordashboard').locator('p')`: grounded in the broken locator, but matches several paragraphs → rejected by _unique_.
2. `getByRole('paragraph', { name: '₹44,986', exact: true })`: finds the EMI by the value the test asserts → rejected by _stable_ (circular).
3. Round 2, after feedback: `locator('#emiamount').locator('p')`. The model wrote: _"The id 'emiamount' is my recollection of the site's markup and is not in the snapshot."_ It recalled a public site from training data. It would work, but it is **not grounded in the evidence**, and on a private app the same behaviour invents ids → rejected by _grounded_.

The right fix (`#emiamount p`) needs information the model isn't given: ids aren't part of an
accessibility snapshot. That's an honest "needs a human", or better, a `data-testid` on the value.
A next step would be to add known-good locators from sibling page objects (the working
`EmiCalculatorPage` already uses `#emiamount p`) as a third grounding source. Playwright's own
healer found it exactly that way (section 7).

### What building and running it taught me

Each of these came from a real run, and each changed the code:

1. **The first live run was partly blind, and I wrote it up anyway.** The snapshot parser looked for
   a `# Page snapshot` heading that Playwright 1.63 only writes for _action_ failures. For failed
   `expect` assertions (3 of the 5 targets) the model got "(not available)". I had tested the parser
   with a made-up fixture and wrote conclusions without reading the model's rationales, which said
   it had no snapshot. The milestone review caught it. Fixed by parsing the yaml block itself,
   tested against two **real** error-context files (the test fails on the old parser). Everything
   on this page is from the re-run.
2. **A circular locator passed every gate.** `getByText('₹44,986')` is unique, visible and
   survives re-runs, but if the EMI were ever wrong it would turn a wrong value into a "missing
   element". This led to the **stable** gate.
3. **"Ground your answer in the snapshot" is a request, not a guarantee.** The model used remembered
   markup, and said so. This led to the **grounded** gate, which enforces in code what the prompt
   asks for.
4. **Exact beats lucky.** The blind run accepted `getByLabel('Interest rate')`, a case-insensitive
   substring match that only happened to be unique. This led to the **exact preferred** gate: if the
   exact variant is unique, the healer tries it itself.
5. **A patch nobody can apply is not a patch.** The first diffs failed `git apply`. They are now
   standard diffs of the Prettier-formatted file, with a unit test that applies one.
6. **Real tool integration finds real problems.** Claude Code's `--json-schema` rejects zod's
   default 2020-12 meta-schema URI, so the schema is now emitted as draft-07.

## 1. The broken locators (left broken, as required)

They live in [`src/pages/legacy/LegacyEmiCalculatorPage.ts`](src/pages/legacy/LegacyEmiCalculatorPage.ts)
and are exercised by [`features/self-healing/broken-locators.feature`](features/self-healing/broken-locators.feature).
That suite has its own config (`playwright.self-heal.config.ts`) and reports
(`reports/self-healing/`), so `npm test` stays green and the main evidence is never overwritten.

| #       | Broken locator                                   | Brittleness                           | Runtime failure                    | Caught by the static lint?            |
| ------- | ------------------------------------------------ | ------------------------------------- | ---------------------------------- | ------------------------------------- |
| 1       | `getByRole('link', { name: /Loan/ })`            | unanchored regex name                 | strict-mode violation (13 matches) | ✅ `unanchored-regex-name`            |
| 2       | `locator('#loan-amount')`                        | id renamed (`loanamount`)             | not found (timeout)                | ❌ looks valid in source              |
| 3       | `xpath=/html/body/div[1]/…/input`                | absolute XPath from DevTools          | not found                          | ✅ `absolute-xpath`                   |
| 4       | `#emicalculatordashboard > div:nth-child(2) > …` | positional CSS chain                  | not found                          | ✅ `positional-css`, `deep-css-chain` |
| 5       | `getByRole('heading', { name: 'Monthly EMI' })`  | text drifted (now "Loan EMI")         | not found                          | ❌ looks valid in source              |
| control | `#emiamount p` (correct)                         | none: the **expected value** is wrong | assertion mismatch                 | n/a                                   |

The control scenario is the most important one. Its locator is fine and the _expectation_ is wrong
(₹33,000 vs the real ₹44,986). A healer that "fixes" it, by changing the locator or the expected
value, would hide a real defect. **It must refuse, and it does.**

Every locator carries a `.describe('<intent>')` (Playwright 1.53+). Playwright prints it in
failures, and the healer uses it as the answer to "what was this supposed to find?".

## 2. Detection

Two layers, because neither is enough alone:

1. **Before runtime: a static lint** ([`self-heal/src/lint-locators.ts`](self-heal/src/lint-locators.ts))
   flags brittle _shapes_: absolute XPath, `nth-child`, long `>` chains, index picks
   (`nth/first/last`), unanchored regex names and generated class names. It catches 3 of the 5.
   A renamed id or drifted text is syntactically perfect, so only runtime can catch those. Justified
   exceptions need a reason (`// locator-lint-allow: …`); the codebase has one (bar chart bars
   located through chart data). The lint also found an unanchored heading regex in the working
   page object, which was fixed.
2. **At runtime: classification in code**, never by the model
   ([`self-heal/src/failures.ts`](self-heal/src/failures.ts)). From Playwright's JSON report:
   - `strict mode violation` → **ambiguous** locator (healable)
   - `element(s) not found`, or a `TimeoutError … waiting for locator` → **missing** element (healable)
   - an assertion with `Received:`, where the element was found and its value is wrong → **not a locator problem** (refused)
   - anything else → refused

   The failing step's source line (`error.location`) identifies the page-object member
   (`legacyPage.loanAmountInput.fill(…)`), and the page object gives its expression and intent.

## 3. Prompt approach

[`self-heal/src/prompt.ts`](self-heal/src/prompt.ts). The model receives only:

- the **intent** (`describe()`), the **broken expression**, and **how the steps use it** (`fill`, `toHaveValue`, `click`…)
- the **failure class** and Playwright's error output (for strict-mode failures this lists every match with a suggested locator)
- the page's **accessibility snapshot at the moment of failure**, from Playwright's `error-context.md`

The rules ask for 1–3 ranked candidates grounded in the snapshot, with a preference order (role +
name → label → placeholder → text → test id → scoped id). The model may never change what the test
checks. The snapshot is page content, so the prompt says to ignore any instructions inside it.

**The model never writes code.** It returns structured JSON validated by a zod schema
([`candidates.ts`](self-heal/src/candidates.ts)), e.g.
`{"strategy":"role","role":"link","name":"Personal Loan","exact":true}`. Our code builds the
locator and the source from it, with escaped strings and identifier-only ids, so a malicious page
can't smuggle code into a patch.

**Model access** ([`llm.ts`](self-heal/src/llm.ts)):

| Adapter       | When                                                | Notes                                                                                                                                                                                                                                                   |
| ------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claude-code` | default for a live run                              | headless Claude Code (`claude -p`) using the developer's existing login, so **no API key** is stored anywhere. Run with no tools (`--tools ""`), no MCP servers, no saved session, and `--json-schema` for structured output: the model can only answer |
| `anthropic`   | if `ANTHROPIC_API_KEY` is in the git-ignored `.env` | Messages API                                                                                                                                                                                                                                            |
| `replay`      | a recorded response exists                          | `npm run heal -- --record` saves each real response in `self-heal/cassettes/`. Later runs replay it offline and deterministically, and say if the prompt has changed since recording                                                                    |

The model is configurable (`HEAL_MODEL`), not hardcoded.

## 4. Validation before applying

Every candidate goes through eight gates, in order ([`validate.ts`](self-heal/src/validate.ts)).
The first three need no browser.
If none survives, the gate results go back to the model **once** (a bounded second round), and
the new candidates face the same gates.

| Gate            | Check                                                                                                                                | Catches                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| schema          | output parses as a known strategy (zod, strict)                                                                                      | malformed or injected output                                      |
| grounded        | every id, name, label or text appears in the evidence the model was shown (snapshot, broken locator, failure output)                 | **invented or remembered** locators: enforced, not just requested |
| stable          | no numbers in the name or text, and not the value the test asserts: data is not identity (heuristic; known limits in `validate.ts`)  | **circular** locators like `getByText('₹44,986')`                 |
| unique          | `count() === 1` on the live page (Desktop Chrome profile, initial page state; the re-run covers later states)                        | ambiguous candidates                                              |
| exact preferred | a non-exact name/label is rejected if its exact variant is also unique; the healer then tries the exact one itself                   | matches that are unique only by luck                              |
| visible         | the element is visible                                                                                                               | hidden duplicates, templates                                      |
| role fits       | Playwright's computed ARIA role suits how the steps use it (`fill` → textbox, `click` → link/button…)                                | an element that can't do what the step needs                      |
| **re-run ×3**   | the candidate is patched in temporarily, the failing scenario runs **3 times**, then the file is restored and verified byte-for-byte | the **wrong element**, and flakiness                              |

The re-run is the semantic check. Each broken scenario ends with a post-condition only the right
element can satisfy: the value must land in the Home Loan Amount field, the Personal Loan tab must
become active, the EMI must equal the independent oracle's value. During development a
deliberately wrong candidate (`getByLabel('Interest Rate')` for the loan-amount input) passed
_unique, visible and role_ (it is a textbox too) and was **rejected by the re-run, 0/3**. The right
one passed 3/3.

**Diff scope.** A patch can only replace the locator expression between `this.<member> =` and
`.describe(…)` ([`patch.ts`](self-heal/src/patch.ts)). Assertions and expected values are never
part of a patch, so a heal can't weaken a test. An ambiguous patch (expression found more than once)
is refused.

**Output.** `self-heal/out/healing-report.md` (every candidate, every gate, the model's
rationale) plus one `.diff` per proposal. **Never auto-applied**: a person reviews the diff,
applies it in a normal commit, and the full suite runs in CI.

## 5. Why propose instead of auto-heal?

Runtime auto-healing makes red tests green, but it's the riskiest place to be wrong:

- **Wrong-element heals:** a locator that finds _a_ textbox isn't the loan-amount textbox. Silent runtime heals can turn a failing test into one that passes for the wrong reason.
- **Masked defects:** a real bug (the control scenario) looks like "the element changed" to a naive healer.
- **Drift without review:** healed locators that nobody reviews accumulate, and the suite slowly stops testing what it claims to.
- **Prompt injection:** page text reaches the model, so model output must stay data and never be executed.

So: heal **in the pipeline, not in the test**. Propose, validate hard, and let a human merge.

## 6. In a real team

- CI runs `test:broken`-style triage on failures, runs the healer, and posts `healing-report.md` and the patches as a PR comment, or opens a PR with the patch for review.
- Accepted patches are ordinary commits, so history shows what changed and why.
- Track heal acceptance rate and repeat offenders. A locator healed twice is a sign the page needs a `data-testid`.
- Prefer prevention: the static lint in CI (`--strict --exclude=src/pages/legacy` in `.github/workflows/ci.yml`; legacy is broken on purpose), test ids agreed with developers, and role-based locators.

## 7. Compared with Playwright's own healer

Playwright 1.56+ ships **Test Agents** (`npx playwright init-agents --loop=claude`): planner,
generator and **healer** sub-agents for Claude Code. I ran its healer on the same six failures
**twice**, each time on a throwaway branch that was deleted afterwards, through headless Claude
Code with only the healer's own tools (file edits and Playwright MCP). Evidence (diffs and run
summaries, local paths removed): [`self-heal/comparison/`](self-heal/comparison).

|             | Run 1: no shell at all                                                              | Run 2: `npx bddgen` allowed                               | This POC                                                          |
| ----------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| Broken 1    | `getByRole('link', { name: 'Personal Loan', exact: true })`                         | same                                                      | same                                                              |
| Broken 2    | `locator('#loanamount')` (corrected id)                                             | `getByLabel('Home Loan Amount', { exact: true })`         | `getByRole('textbox', { name: 'Home Loan Amount', exact: true })` |
| Broken 3    | `getByLabel('Interest Rate', { exact: true })`                                      | same                                                      | `getByRole('textbox', { name: 'Interest Rate', exact: true })`    |
| Broken 4    | ✅ `locator('#emiamount p')`                                                        | ✅ same: _"same id the working page object already uses"_ | 🙋 needs a human (ungrounded)                                     |
| Control     | ⚠️ tagged the scenario **`@fixme`** (a failing test silently becomes a skipped one) | ✅ left red, unchanged                                    | 🛑 refused before any model call                                  |
| Other edits | hand-edited a **generated** BDD spec; stalled asking to run `npx bddgen`            | page object only                                          | none: proposals only                                              |
| Cost        | 23 turns, 6.4 min, $1.93                                                            | 33 turns, 8.1 min, $1.78                                  | 7 schema-constrained model calls                                  |

**Caveats, stated plainly:**

- Run 1's stall on `npx bddgen` was caused by **my** permission setup (no shell at all), not by a limitation of the agent.
- In run 2 my `npx bddgen` allowance didn't actually match the forms the agent used (a `cd` prefix, PowerShell), so it stayed blocked. That run simply didn't need it.
- **Run 2 was not independent of run 1.** By then the repository contained this document, including the criticism of run 1's `@fixme`, and the agent read it. Its better handling of the control may partly reflect that.

**What I take from it.** The agent is more _capable_. Because it reads the whole repository and can
inspect the DOM, it grounded `#emiamount p` in our own working page object, a source my POC
doesn't use (yet). It is also **less predictable**: the same task produced a silently skipped test
in one run and a correct refusal in the next, depending on permissions and on what the repository
happened to contain. In an interactive session with a developer watching, that's fine. In
unattended CI, I'd rather have the constrained pipeline: deterministic triage, structured output,
code-enforced grounding, and propose-only patches.

|                 | Playwright Test Agents healer               | This POC                                                                                              |
| --------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Model output    | free-form edits to any file                 | structured candidates only; code built by us                                                          |
| Scope of change | anything in the repository                  | only the locator expression of one member                                                             |
| Failure triage  | the agent's judgement (varied between runs) | deterministic classifier; assertion failures refused before any model call                            |
| Grounding       | whole repo + live DOM                       | accessibility snapshot + broken locator + failure output, **enforced in code**                        |
| Validation      | the agent re-runs the test                  | grounded + stable + unique + exact preferred + visible + role + re-run ×3; one bounded feedback round |
| Applying        | edits in place                              | proposal + `git apply`-able patch; a human applies it                                                 |
| Best for        | exploratory repair in an IDE session        | unattended CI triage where false heals are expensive                                                  |

## 8. Where this comes from

I previously built an LLM-based Playwright test generator with an agentic locator fixer
(playwright-cli snapshots → interact → write → re-run, plus an intent-preservation check and a
flakiness gate). This POC keeps the ideas that worked: checking against the live page, re-running,
and detecting flakiness. It moves the guardrails that were prompt-level there into **code**:
deterministic triage, schema-validated structured output, diff-scope limits, and propose-only
output.
