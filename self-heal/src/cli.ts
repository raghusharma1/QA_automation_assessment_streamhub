/**
 * AI self-healing POC: proposes fixes for broken locators, never applies them.
 *
 *   npm run test:broken     # run the deliberately broken scenarios -> reports/self-healing/
 *   npm run heal            # detect -> prompt -> validate -> self-heal/out/healing-report.md
 *   npm run heal -- --record   # (re)record model responses as cassettes in self-heal/cassettes/
 *
 * Model adapter: replay (cassette) if one exists, else headless Claude Code. Override with
 * HEAL_LLM=claude-code|anthropic|replay. See SELF_HEALING.md.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { HealResponseSchema, toCode, type Candidate } from './candidates';
import { classify, readFailures, type Classification } from './failures';
import { askModel } from './llm';
import { unifiedDiff } from './patch';
import { buildFeedbackPrompt, buildPrompt } from './prompt';
import { resolveTarget, type Target } from './targets';
import {
  assertedValues,
  checkOnLivePage,
  exactVariant,
  openBrowser,
  rerunWithCandidate,
  type GateResult,
} from './validate';

const ROOT = path.resolve(__dirname, '..', '..');
const REPORT = path.join(ROOT, 'reports', 'self-healing', 'results.json');
const OUT = path.join(ROOT, 'self-heal', 'out');

const MAX_ROUNDS = 2;

export interface CandidateOutcome {
  round: number;
  candidate: Candidate;
  code: string;
  gates: GateResult[];
  accepted: boolean;
  /** Not proposed by the model: the exact variant of its candidate, tried by the healer. */
  autoExact?: boolean;
}
interface FailureOutcome {
  title: string;
  classification: Classification;
  target?: Target;
  note?: string;
  models: string[];
  candidates: CandidateOutcome[];
  proposal?: CandidateOutcome;
}

/** Console marker for a candidate that was not accepted: ⏭ if it was never re-run, else ❌. */
const g0 = (gates: GateResult[]) => (gates.some((g) => g.skipped) ? '⏭' : '❌');

function pageObjectFiles(dir = path.join(ROOT, 'src', 'pages')): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return pageObjectFiles(full);
    return name.endsWith('.ts') ? [path.relative(ROOT, full).split(path.sep).join('/')] : [];
  });
}

async function main() {
  const record = process.argv.includes('--record');
  const failures = readFailures(REPORT);
  const files = pageObjectFiles();
  const outcomes: FailureOutcome[] = [];
  // A run that was killed mid-validation can leave a page object patched. Refuse to start rather
  // than validate against (and propose diffs from) a modified file.
  const dirty = spawnSync('git', ['status', '--porcelain', '--', ...files], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (dirty.stdout.trim()) {
    throw new Error(
      `Page objects have uncommitted changes; restore them first (git checkout -- <file>):\n${dirty.stdout}`,
    );
  }
  const browser = await openBrowser();

  try {
    for (const failure of failures) {
      const classification = classify(failure.message);
      const outcome: FailureOutcome = {
        title: failure.title,
        classification,
        models: [],
        candidates: [],
      };
      outcomes.push(outcome);
      console.log(`\n▶ ${failure.title}\n  classified: ${classification.kind}`);

      if (!classification.healable) {
        outcome.note = `Refused: ${classification.reason}.`;
        console.log(`  ${outcome.note}`);
        continue;
      }
      const target = resolveTarget(failure.location, files);
      if ('error' in target) {
        outcome.note = `Could not resolve the locator: ${target.error}.`;
        continue;
      }
      outcome.target = target;

      const asserted = assertedValues(failure.message);
      // What the model is shown, and therefore all a candidate may be built from.
      const evidence = [failure.snapshot, target.expression, failure.message].join('\n');
      const basePrompt = buildPrompt(failure, classification, target);
      let prompt = basePrompt;
      // Bounded repair loop: if no candidate survives validation, the gate results go back to the
      // model ONCE. More rounds would just spend tokens guessing.
      for (let round = 1; round <= MAX_ROUNDS && !outcome.proposal; round++) {
        const key = round === 1 ? target.member : `${target.member}--round-${round}`;
        // One failed call (timeout, rate limit, unparsable reply) costs this failure only: the
        // proposals already validated for the others still reach the report.
        let answer: Awaited<ReturnType<typeof askModel>>;
        try {
          answer = await askModel(key, prompt, { record });
        } catch (error) {
          outcome.note = `Model call failed in round ${round}: ${error instanceof Error ? error.message : String(error)}. Needs a human.`;
          console.log(`  ${outcome.note}`);
          break;
        }
        outcome.models.push(
          `round ${round}: ${answer.adapter}, ${answer.model}${answer.promptChanged ? ' (prompt changed since recording)' : ''}`,
        );
        const parsed = HealResponseSchema.safeParse(answer.raw);
        if (!parsed.success) {
          outcome.note = `Model output rejected by the schema gate: ${parsed.error.issues[0]?.message ?? 'invalid'}.`;
          break;
        }

        // A queue, because the specificity gate can add the exact variant of a candidate.
        const queue: { candidate: Candidate; autoExact?: boolean }[] = parsed.data.candidates.map(
          (candidate) => ({ candidate }),
        );
        for (let next = queue.shift(); next; next = queue.shift()) {
          const { candidate } = next;
          const code = toCode(candidate);
          const gates = await checkOnLivePage(browser, candidate, target, asserted, evidence);
          const exact = exactVariant(candidate);
          if (exact && gates.some((g) => g.gate === 'specific' && !g.passed)) {
            queue.unshift({ candidate: exact, autoExact: true });
          }
          const live = gates.every((g) => g.passed);
          const result: CandidateOutcome = {
            round,
            candidate,
            code,
            gates,
            accepted: false,
            autoExact: next.autoExact,
          };
          if (live && !outcome.proposal) {
            console.log(`  re-running "${failure.title}" ×3 with ${code}`);
            const rerun = rerunWithCandidate(target, code, failure.title);
            gates.push(rerun);
            result.accepted = rerun.passed;
            if (rerun.passed) outcome.proposal = result;
          } else if (live) {
            gates.push({
              gate: 'rerun',
              passed: false,
              skipped: true,
              detail: 'not run: a higher-ranked candidate was already accepted',
            });
          }
          outcome.candidates.push(result);
          const summary = gates
            .map((g) => `${g.gate}:${g.skipped ? 'skipped' : g.passed ? 'ok' : 'FAIL'}`)
            .join(' ');
          console.log(
            `  [round ${round}] ${result.accepted ? '✅' : g0(gates)} ${code}  ${summary}`,
          );
        }
        if (!outcome.proposal) prompt = buildFeedbackPrompt(basePrompt, outcome.candidates);
      }
      if (!outcome.proposal && !outcome.note) {
        outcome.note = `No candidate passed every gate after ${MAX_ROUNDS} rounds: needs a human.`;
      }
    }
  } finally {
    await browser.close();
  }
  await writeReport(outcomes);
}

const icon = (passed: boolean) => (passed ? '✅' : '❌');

async function writeReport(outcomes: FailureOutcome[]) {
  rmSync(path.join(OUT, 'patches'), { recursive: true, force: true });
  mkdirSync(path.join(OUT, 'patches'), { recursive: true });
  const healed = outcomes.filter((o) => o.proposal).length;
  const refused = outcomes.filter((o) => !o.classification.healable).length;
  const lines = [
    '# Self-healing report',
    '',
    `Generated by \`npm run heal\` on ${new Date().toISOString()} from \`reports/self-healing/results.json\`.`,
    '**Nothing here has been applied.** Each proposal is a patch for a human to review.',
    '',
    `| Failures | Proposed fixes | Refused (not a locator problem) | Needs a human |`,
    `|---|---|---|---|`,
    `| ${outcomes.length} | ${healed} | ${refused} | ${outcomes.length - healed - refused} |`,
    '',
  ];
  for (const o of outcomes) {
    lines.push(`## ${o.title}`, '');
    lines.push(`- **Classification:** \`${o.classification.kind}\` (${o.classification.reason})`);
    if (o.target) {
      lines.push(
        `- **Locator:** \`${o.target.member}\` in \`${o.target.file}\`, intent "${o.target.intent}"`,
      );
      // Join a multi-line chain back into one line: "page\n  .getByRole(" -> "page.getByRole(".
      const oneLine = o.target.expression.replace(/\s*\n\s*/g, '').replace(/\s+/g, ' ');
      lines.push(`- **Broken:** \`${oneLine}\``);
    }
    for (const model of o.models)
      lines.push(`- **Model (${model.split(':')[0]}):** ${model.slice(model.indexOf(':') + 2)}`);
    if (o.note) lines.push(`- **Result:** ${o.note}`);
    if (o.candidates.length) {
      lines.push(
        '',
        '| # | Round | Candidate | grounded | stable | unique | exact preferred | visible | role fits | re-run ×3 | Verdict |',
        '|---|---|---|---|---|---|---|---|---|---|---|',
      );
      o.candidates.forEach((c, i) => {
        const g = (name: GateResult['gate']) => {
          const r = c.gates.find((x) => x.gate === name);
          if (!r) return '–';
          return r.skipped ? `⏭ ${r.detail}` : `${icon(r.passed)} ${r.detail}`;
        };
        const verdict = c.accepted
          ? '**proposed**'
          : c.gates.some((x) => x.skipped)
            ? 'not needed'
            : 'rejected';
        lines.push(
          `| ${i + 1} | ${c.round} | \`${c.code}\` | ${g('grounded')} | ${g('stable')} | ${g('unique')} | ${g('specific')} | ${g('visible')} | ${g('role')} | ${g('rerun')} | ${verdict} |`,
        );
      });
      lines.push('', '<details><summary>Model rationale</summary>', '');
      o.candidates.forEach((c, i) =>
        lines.push(
          `${i + 1}. ${c.autoExact ? '_(exact variant of the previous candidate, tried by the healer, not the model)_ ' : ''}${c.candidate.rationale}`,
        ),
      );
      lines.push('', '</details>');
    }
    if (o.proposal && o.target) {
      const diff = await unifiedDiff(o.target, o.proposal.code);
      writeFileSync(path.join(OUT, 'patches', `${o.target.member}.diff`), `${diff}\n`, 'utf8');
      lines.push(
        '',
        `Proposed patch (\`self-heal/out/patches/${o.target.member}.diff\`):`,
        '',
        '```diff',
        diff,
        '```',
      );
    }
    lines.push('');
  }
  writeFileSync(path.join(OUT, 'healing-report.md'), lines.join('\n'), 'utf8');
  console.log(`\nWrote self-heal/out/healing-report.md (${healed} proposed, ${refused} refused)`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
