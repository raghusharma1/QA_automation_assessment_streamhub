# Live recon of emicalculator.net (verified 2026-10-05 with playwright-cli 0.1.22, Chrome)

These findings come from a real browser session and take precedence over the static-source notes in `02-emicalculator-recon.md`.

## Tabs
- `getByRole('link', { name: 'Personal Loan' })` matches **2 elements** and triggers a strict-mode violation, because the name match is a substring match. Use `{ exact: true }`, which resolves to one element. `playwright-cli generate-locator` fell back to `#personal-loan a`, since no unique role locator exists without `exact`.
- Switching tabs keeps the URL at `https://emicalculator.net/` and resets the inputs to that product's defaults.

## Inputs (all have `<label for>`, so `getByLabel(..., { exact: true })` works)
| Label | id | Notes |
|---|---|---|
| Home Loan Amount / Personal Loan Amount | `#loanamount` | Indian grouping, e.g. `25,00,000`; the label text changes per tab |
| Interest Rate | `#loaninterest` | |
| Loan Tenure | `#loanterm` | years by default |
| Schedule showing EMI payments starting from | `#startmonthyear` | **readOnly**, value like `Oct 2026`, defaults to the current month |

- `fill(value)` followed by `press('Tab')` recalculates the result. **Race found:** reading `#emiamount span` immediately after the last Tab returned a **stale value** (`24,126`, which is the 25L / 10% / *20y* EMI). The correct value appeared a moment later. Always use web-first `expect(...).toHaveText()` and never read the text once and compare.

## Sliders (jQuery UI, no ARIA roles, handle is `span.ui-slider-handle[tabindex=0]`, track width about 644px at the default viewport)
| Tab | Slider | min | max | step | default |
|---|---|---|---|---|---|
| Home | `#loanamountslider` | 0 | 2,00,00,000 | 1,00,000 | 50L |
| Home | `#loaninterestslider` | 5 | 20 | 0.25 | 9 |
| Home | `#loantermslider` | 0 | 30 | 0.5 | 20 |
| Personal | `#loanamountslider` | 0 | 30,00,000 | 10,000 | 7.5L |
| Personal | `#loaninterestslider` | 5 | 25 | 0.25 | 11 |
| Personal | `#loantermslider` | 0 | 5 | 0.25 | 3 |

- Keyboard on a focused handle works: ArrowRight/ArrowLeft move one step, End/Home jump to the max/min. The input syncs and the EMI recalculates.
- Verified: 25× ArrowRight on amount (7.5L→10L), 4× on interest (11→12), End on tenure (→5) gives EMI **22,244**, total interest **3,34,667** and total payment **13,34,667**.

## Datepicker (bootstrap-datepicker, month view)
- Clicking the labelled input opens `.datepicker.datepicker-dropdown`, with `.datepicker-months` visible.
- The header row has `columnheader "«"`, `columnheader "<year>"` and `columnheader "»"`, and the months are `span.month` with text `Jan`…`Dec`.
- Clicking `»` then `Jan` sets the value to `Jan 2027`.

## Bar chart `#emibarchart` (Highcharts 8.1.0, `Highcharts.charts` has 2 charts)
- Series: `Interest` (column), `Principal` (column), `Balance` (spline). Columns are stacked.
- Start Jan 2027 with 60 months gives categories `[2027..2031]`: **5 year-bars = 10 `rect.highcharts-point` segments**.
- Hovering `rect.highcharts-point` shows `g.highcharts-tooltip` with text `Year : 2028Interest : ₹ 91,948Total Payment : ₹ 2,66,933`. Total Payment per full year is 12 × raw EMI.
- Points have no aria-label.

## Pie chart `#emipiechart`
- 2 slices (`path.highcharts-point`). The DOM data labels show **percentages only** (`74.9%`, `25.1%`), and the legend shows `Principal Loan Amount` and `Total Interest`.
- The Highcharts model gives `y` amounts: principal 1000000 and interest 334666.86 for the personal loan scenario.

## Third parties loaded (candidates for `page.route` blocking)
`googletagmanager.com`, `pagead2.googlesyndication.com`, `googleads.g.doubleclick.net`, `stats.g.doubleclick.net`, `analytics.google.com`, `fundingchoicesmessages.google.com` (the consent CMP; it could show a dialog for EU visitors), `ep1/ep2.adtrafficquality.google`, `www.google.com/recaptcha`, `secure.gravatar.com`. The page has ad iframes from doubleclick. There was 1 console error, from a third-party script.
