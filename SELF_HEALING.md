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

Model: **Claude Sonnet 5.5 via headless Claude Code**, against the live site. The real responses are
recorded in [`self-heal/cassettes/`](self-heal/cassettes), so `npm run heal` replays them offline
and reproduces the same outcome. Full report:
[self-heal/out/healing-report.md](self-heal/out/healing-report.md); patches in
[self-heal/out/patches/](self-heal/out/patches).

| Scenario                       | Outcome                    | Proposed locator                                                  | Notes                                                            |
| ------------------------------ | -------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| Broken 1: ambiguous regex name | ✅ proposed                | `getByRole('link', { name: 'Personal Loan', exact: true })`       | re-run 3/3                                                       |
| Broken 2: renamed id           | ✅ proposed                | `getByRole('textbox', { name: 'Home Loan Amount', exact: true })` | re-run 3/3                                                       |
| Broken 3: absolute XPath       | ✅ proposed                | `getByLabel('Interest rate')`                                     | a `spinbutton` guess was rejected (0 matches)                    |
| Broken 4: positional CSS       | 🙋 **needs a human**       | none                                                              | every candidate was rejected; see below                          |
| Broken 5: drifted text         | ✅ proposed **in round 2** | `getByRole('heading', { name: 'Loan EMI', exact: true })`         | round 1 forgot `exact`, matched 3 headings; fixed after feedback |
| Control: wrong expected value  | 🛑 **refused**             | none                                                              | classified `assertion-mismatch` before any model call            |

**What the live run taught me (and changed in the code):**

1. **A circular locator passed every gate.** In its first version, the healer accepted
   `getByText('₹44,986')` for Broken 4. It is unique, visible, and the re-run passed. But it finds
   the EMI _by the value the test asserts_: if the EMI were ever wrong, the locator would find nothing
   and the bug would look like a locator problem. That's exactly the masking this design is meant to
   prevent. I added a **stability gate** (numbers in a name or text are data, not identity) and
   re-recorded. Broken 4 now correctly ends at **"needs a human"**: the right fix is
   `locator('#emiamount p')`, and `emiamount` doesn't appear in the accessibility snapshot the model
   sees. The honest outcome is to ask a person, or better, add a `data-testid`.
2. **Feedback beats retrying blind.** For Broken 5 the model's first answers matched 3 headings
   (no `exact: true`). One bounded feedback round, giving it our gate results ("3 element(s)
   matched"), fixed it. The loop stops after 2 rounds: past that, a model mostly spends tokens
   guessing.
3. **Real tool integration finds real problems.** The first call failed because Claude Code's
   `--json-schema` validator rejects zod's default JSON Schema 2020-12 meta-schema URI. The schema
   is now emitted as draft-07.

---

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

Every candidate goes through six gates, in order ([`validate.ts`](self-heal/src/validate.ts)).
If none survives, the gate results go back to the model **once** (a bounded second round), and
the new candidates face the same gates.

| Gate          | Check                                                                                                                                | Catches                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| schema        | output parses as a known strategy (zod, strict)                                                                                      | malformed or injected output                      |
| stable        | no numbers in the name or text: data is not identity                                                                                 | **circular** locators like `getByText('₹44,986')` |
| unique        | `count() === 1` on the live page                                                                                                     | ambiguous candidates                              |
| visible       | the element is visible                                                                                                               | hidden duplicates, templates                      |
| role fits     | Playwright's computed ARIA role suits how the steps use it (`fill` → textbox, `click` → link/button…)                                | an element that can't do what the step needs      |
| **re-run ×3** | the candidate is patched in temporarily, the failing scenario runs **3 times**, then the file is restored and verified byte-for-byte | the **wrong element**, and flakiness              |

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
- Prefer prevention: the static lint in CI (`--strict`), test ids agreed with developers, and role-based locators.

## 7. Compared with Playwright's own healer

Playwright 1.56+ ships **Test Agents** (`npx playwright init-agents --loop=claude`): planner,
generator and **healer** sub-agents for Claude Code. The healer replays a failing test, inspects
the live page through Playwright's MCP tools, **edits the test file directly**, and re-runs it. If
it decides the feature itself is broken, it can mark the test `test.fixme()`.

|                 | Playwright Test Agents healer        | This POC                                                                                              |
| --------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Model output    | free-form edits to the test file     | structured candidates only; code built by us                                                          |
| Scope of change | anything in the file                 | only the locator expression of one member                                                             |
| Failure triage  | the agent's judgement                | deterministic classifier; assertion failures refused before any model call                            |
| Validation      | the agent re-runs the test           | stable + unique + visible + role + re-run ×3, then byte-identical restore; one bounded feedback round |
| Applying        | edits in place                       | proposal + patch only; a human applies it                                                             |
| Best for        | exploratory repair in an IDE session | unattended CI triage where false heals are expensive                                                  |

They're complementary: the agent is great in an interactive session; a constrained, auditable
pipeline is safer unattended.

## 8. Where this comes from

I previously built an LLM-based Playwright test generator with an agentic locator fixer
(playwright-cli snapshots → interact → write → re-run, plus an intent-preservation check and a
flakiness gate). This POC keeps the ideas that worked: checking against the live page, re-running,
and detecting flakiness. It moves the guardrails that were prompt-level there into **code**:
deterministic triage, schema-validated structured output, diff-scope limits, and propose-only
output.
