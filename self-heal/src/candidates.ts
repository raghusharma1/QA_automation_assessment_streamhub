/**
 * The model never writes code. It returns STRUCTURED candidates (validated with zod), and this
 * module builds both the live Locator and the source code from them. Page content can carry
 * prompt injection, so anything the model returns is data, never something we evaluate.
 */
import type { Locator, Page } from '@playwright/test';
import { z } from 'zod';

const ROLES = [
  'link',
  'button',
  'tab',
  'textbox',
  'spinbutton',
  'combobox',
  'checkbox',
  'radio',
  'heading',
  'paragraph',
  'cell',
  'listitem',
  'img',
  'slider',
  'menuitem',
] as const;
// No control characters: a newline would split the single-quoted literal toCode() emits.
const CONTROL_CHARS = /[\x00-\x1f\x7f]/; // eslint-disable-line no-control-regex
const text = z
  .string()
  .min(1)
  .max(120)
  .refine((s) => !CONTROL_CHARS.test(s), 'no control characters');
const rationale = z.string().min(1).max(400);

export const CandidateSchema = z.discriminatedUnion('strategy', [
  z.strictObject({
    strategy: z.literal('role'),
    role: z.enum(ROLES),
    name: text,
    exact: z.boolean(),
    rationale,
  }),
  z.strictObject({ strategy: z.literal('label'), label: text, exact: z.boolean(), rationale }),
  z.strictObject({
    strategy: z.literal('placeholder'),
    placeholder: text,
    exact: z.boolean(),
    rationale,
  }),
  z.strictObject({ strategy: z.literal('text'), text, exact: z.boolean(), rationale }),
  z.strictObject({ strategy: z.literal('testId'), testId: text, rationale }),
  // Last resort for elements with no accessible hook: a stable id plus a child tag name.
  z.strictObject({
    strategy: z.literal('scopedId'),
    id: z.string().regex(/^[A-Za-z][\w-]{0,60}$/),
    childTag: z
      .string()
      .regex(/^[a-z][a-z0-9]{0,10}$/)
      .optional(),
    rationale,
  }),
]);
export type Candidate = z.infer<typeof CandidateSchema>;

export const HealResponseSchema = z.strictObject({
  candidates: z.array(CandidateSchema).min(1).max(3),
});
export type HealResponse = z.infer<typeof HealResponseSchema>;

export function buildLocator(page: Page, c: Candidate): Locator {
  switch (c.strategy) {
    case 'role':
      return page.getByRole(c.role, { name: c.name, exact: c.exact });
    case 'label':
      return page.getByLabel(c.label, { exact: c.exact });
    case 'placeholder':
      return page.getByPlaceholder(c.placeholder, { exact: c.exact });
    case 'text':
      return page.getByText(c.text, { exact: c.exact });
    case 'testId':
      return page.getByTestId(c.testId);
    case 'scopedId': {
      const scope = page.locator(`#${c.id}`);
      return c.childTag ? scope.locator(c.childTag) : scope;
    }
  }
}

const quote = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** Source code for the candidate, written against a variable named `page`. */
export function toCode(c: Candidate): string {
  switch (c.strategy) {
    case 'role':
      return `page.getByRole(${quote(c.role)}, { name: ${quote(c.name)}${c.exact ? ', exact: true' : ''} })`;
    case 'label':
      return `page.getByLabel(${quote(c.label)}${c.exact ? ', { exact: true }' : ''})`;
    case 'placeholder':
      return `page.getByPlaceholder(${quote(c.placeholder)}${c.exact ? ', { exact: true }' : ''})`;
    case 'text':
      return `page.getByText(${quote(c.text)}${c.exact ? ', { exact: true }' : ''})`;
    case 'testId':
      return `page.getByTestId(${quote(c.testId)})`;
    case 'scopedId':
      return `page.locator(${quote(`#${c.id}`)})${c.childTag ? `.locator(${quote(c.childTag)})` : ''}`;
  }
}

/** Which ARIA roles fit how the steps use the locator (an action-compatibility gate). */
export function compatibleRoles(usages: string[]): readonly string[] | 'any' {
  if (usages.some((u) => ['fill', 'press', 'type', 'toHaveValue', 'clear'].includes(u))) {
    return ['textbox', 'spinbutton', 'combobox', 'searchbox'];
  }
  if (usages.includes('click')) return ['link', 'button', 'tab', 'menuitem', 'checkbox', 'radio'];
  return 'any';
}
