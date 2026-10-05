# 02 - emicalculator.net technical recon

Date: 2026-10-05. Method: `curl` of `https://emicalculator.net/` (raw server HTML, 86,963 bytes, nginx, `Last-Modified: Mon, 05 Oct 2026 10:14:07 GMT`) plus download and beautification of
`/wp-content/themes/emicalculator/dist/scripts/emicalculator.js?x41029` (31 KB, the calculator logic) and
`commoncalculator.js` (3.4 MB vendor bundle). No real browser was used.

Legend: **[SRC]** = read directly in the HTML/JS source. **[INFERRED]** = derived from library knowledge or source
reading but not seen at runtime. **[UNVERIFIED]** = must be confirmed in a real browser.

---

## 0. Libraries on the page [SRC]

| Library | Version | Evidence |
|---|---|---|
| jQuery | 3.7.1 | `/wp-includes/js/jquery/jquery.min.js` header |
| jQuery UI Slider (+core, mouse) | 1.13.3 | `/wp-includes/js/jquery/ui/slider.min.js` header |
| jQuery UI Touch Punch | 0.2.3 | string in `commoncalculator.js` |
| Highcharts | 8.1.0 | `product:"Highcharts",version:"8.1.0"` in `commoncalculator.js` |
| bootstrap-datepicker | 1.9.0 | `datepicker.version="1.9.0"` in `commoncalculator.js` |
| Globalize (legacy 0.x, jQuery) | - | `Globalize.format(n,"n","en-IN")`, `addCultureInfo("en-IN",...)` |
| jquery.loadmask | - | `fn.mask` / `maskElement` (adds `.masked` + `div.loadmask`) |
| pdfmake, SheetJS (XLSX), Base64 | - | used by Download PDF / Excel / Share |
| Bootstrap 4 JS | - | `main.js` (modals etc.; no modal is opened by calculator code) |

No Highcharts accessibility module is bundled (no `highcharts-a11y` / `screenReaderSection` strings) **[SRC]**, so chart
points have **no aria-labels**; values must come from the Highcharts JS API, tooltips, or the amortization table.

---

## 1. Loan-type tabs [SRC]

```html
<ul class=loanproduct-nav>
  <li id=home-loan class=active><a href=#>Home Loan</a></li>
  <li id=personal-loan><a href=#>Personal Loan</a></li>
  <li id=car-loan><a href=#>Car Loan</a></li>
</ul>
```

- Plain `<ul>/<li>/<a href="#">`. No `role="tab"`, no `aria-selected`. Active state = class `active` on the `<li>`.
- Click handler is bound to the **`li`** (`jQuery("ul.loanproduct-nav li").click(...)`) and returns `false` -> no
  navigation, **no URL change, no reload**. It re-initialises the form via `G(...)` (resets values and sliders, rewrites
  tick labels, label text of `label[for=loanamount]`) and triggers a recalculation `B()`.
- Clicking the `<a>` bubbles to the `li`, so `getByRole('link', { name: 'Personal Loan' })` works.
- Clicking an already-active tab does nothing.
- Separate URLs: `/home-loan-emi-calculator/` returns 200 (a *different*, more advanced calculator page);
  `/personal-loan-emi-calculator/` and `/car-loan-emi-calculator/` return **404**. Stay on `/` and use tabs.
- The tab bar is hidden (`.loanproduct-nav.hide()`) when the page is opened with `?ecdata=...` share data.

Locators:
```ts
const tab = (name: 'Home Loan'|'Personal Loan'|'Car Loan') =>
  page.locator('ul.loanproduct-nav').getByRole('link', { name, exact: true });
// assert active:
await expect(page.locator('ul.loanproduct-nav li', { has: tab('Personal Loan') })).toHaveClass(/active/);
// post-switch sanity: label text changes
await expect(page.getByText('Personal Loan Amount', { exact: true })).toBeVisible();
```
Note: the main site nav menu also contains links with similar words, so always scope to `ul.loanproduct-nav`.

### Per-product configuration (from `G(label, amtMax, amtStep, amtDefault, intMax, intDefault, tenMaxYears, tenStepYears, tenDefaultMonths)`) [SRC]

| Product | Amount slider min/max/step | Default amount | Interest min/max/step | Default % | Tenure slider (years) min/max/step | Default tenure |
|---|---|---|---|---|---|---|
| Home | 0 / 2,00,00,000 / 1,00,000 | 50,00,000 | 5 / 20 / 0.25 | 9 | 0 / 30 / 0.5 | 240 mo = 20 yr |
| Personal | 0 / 30,00,000 / 10,000 | 7,50,000 | 5 / 25 / 0.25 | 11 | 0 / 5 / 0.25 | 36 mo = 3 yr |
| Car | 0 / 20,00,000 / 10,000 | 4,00,000 | 5 / 20 / 0.25 | 8.5 | 0 / 7 / 0.25 | 60 mo = 5 yr |

Important: the static server HTML shows `25,00,000 / 10.5 / 20` and results `24,959` but `document.ready` immediately
overwrites them with the Home defaults (50 L, 9 %, 20 yr). Never assert on the static HTML values.
The tenure slider value is always in **years** (even when the "Mo" toggle is selected; then input = 12 x slider).

Scale ticks (`#loanamountsteps`, `#loanintereststeps`, `#loantermsteps`, `span.tick > span.marker`, positioned by
`style="left: X%"`):
- Home: amount 0,25L..200L (every 12.5 %); interest 5,7.5..20; tenure 0,5..30 (yr) or 0,60..360 (mo)
- Personal: amount 0,5L,10L..30L (16.67 % each); interest 5,7.5..25 (12.5 % each); tenure 0..5 yr (20 % each) or 0..60 mo
- Car: amount 0,5L..20L; interest 5..20; tenure 0..7 yr or 0..84 mo
- Some ticks have `d-none d-sm-table-cell` (hidden on mobile widths).

---

## 2. Inputs, formatting, recalculation trigger [SRC]

| Field | Element | Label (accessible name) |
|---|---|---|
| Amount | `input#loanamount[name=loanamount][type=text]` | `<label for=loanamount>` text = "Home Loan Amount" / "Personal Loan Amount" / "Car Loan Amount" |
| Interest | `input#loaninterest[name=loaninterest]` | "Interest Rate" |
| Tenure | `input#loanterm[name=loanterm]` | "Loan Tenure" |
| Tenure unit | radios `#loanyears` ("Yr", checked) / `#loanmonths` ("Mo"), `name=loantenure`, wrapped in Bootstrap `label.btn` toggle | radio has no own label; label text "Yr"/"Mo" wraps the input |
| EMI scheme (car only) | radios `#emiadvance` / `#emiarrears` | visible only on Car Loan (`#leschemewrapper.toggle-visible`) |
| Hidden | `#loanproduct`, `#loanstartdate`, `#loanyearformat`, `#loandata`, `#calcversion=4.0` | - |

Because real `<label for>` elements exist, `page.getByLabel('Interest Rate')`, `getByLabel('Loan Tenure')` and
`getByLabel(/Loan Amount$/)` should resolve to the inputs. Caveat [UNVERIFIED]: `getByLabel('Loan Tenure')` might also
pick up something else; prefer `{ exact: true }`. Unit toggle: `page.getByText('Yr', { exact: true })` / `getByText('Mo')`
(click the label, the radio itself is visually hidden by Bootstrap's btn-group-toggle - [INFERRED]).

Formatting:
- Amount displayed with Indian grouping via `Globalize.format(n,"n","en-IN")`: `10,00,000`, `25,00,000`, `50,00,000`.
  Culture default `decimals:0`, so `"n"` = integer, rounded.
- Parsing strips everything except digits/dot (`replace(/[^\d\.]/g,"")`), so typing `1000000` or `10,00,000` both work.
- Interest: plain number; on blur rounded to 3 dp. Tenure (years mode): on blur rounded to nearest month (`round(12*v)/12`, 2 dp).

Recalculation triggers:
- `#loanamount`, `#loaninterest`, `#loanterm` -> jQuery **`change`** event: sets slider value programmatically then `B()`.
  `change` fires on blur/commit, **not** on keyup. Playwright `fill()` alone does not blur; do
  `await input.fill('1000000'); await input.press('Tab');` (or `.blur()`/`dispatchEvent('change')`).
  Enter will not submit (3 text inputs, no submit button -> no implicit submission) and is not a reliable trigger.
- Yr/Mo radio `change` -> converts the input value and redraws ticks (no recalculation call; values are equivalent).
- Slider `change` callback runs `B()` only if `event.originalEvent` exists (i.e. real user mouse/keyboard).
  Programmatic `$('#x').slider('value', v)` does NOT recalculate.
- `#yearformat` select (Calendar Year wise / Financial Year wise) `change` -> `B()`.
- Datepicker `changeDate` -> `B()`.
- **Typing updates the slider**: yes, the input `change` handler calls `slider("value", ...)`.

`B()` = `$('#emicalculatorform').mask("Calculating EMI...")` then `setTimeout(D,10)`; `D()` is synchronous and ends with
`unmask()`. Wait condition: result text changed / `#emicalculatorform:not(.masked)` [INFERRED class name from
loadmask plugin source].

---

## 3. Sliders [SRC + INFERRED]

- jQuery UI Slider 1.13.3, `range:"min"`, horizontal. Containers: `#loanamountslider`, `#loaninterestslider`,
  `#loantermslider` (each gets classes `ui-slider ui-slider-horizontal ui-widget ui-widget-content ui-corner-all`).
- Handle: `#loanamountslider .ui-slider-handle` (`<span tabindex="0" class="ui-slider-handle ui-corner-all ui-state-default">`),
  fill bar `.ui-slider-range.ui-slider-range-min` [INFERRED from jQuery UI 1.13 markup].
- **No ARIA** (no `role="slider"`, no `aria-valuenow`): jQuery UI slider does not emit them. There is no semantic hook;
  `getByRole('slider')` will find nothing. Use the container ids (honest fallback) and read the value from the paired input.
- `slide` callback writes the formatted value into the input live; `change` callback (on mouse-up / key-up) recalculates.
- Touch Punch is loaded (touch emulation on mobile).

Keyboard support (jQuery UI 1.13 `_handleEvents`, applies when the handle is focused) [INFERRED from jQuery UI source]:
- `ArrowRight`/`ArrowUp` +step, `ArrowLeft`/`ArrowDown` -step
- `Home` -> min, `End` -> max
- `PageUp`/`PageDown` +/- (max-min)/numPages, numPages default 5
- keydown = `_slide` (updates input), keyup = `_change` with originalEvent -> recalculation. Each `press()` recalculates.

Steps per key: Home amount 1,00,000; Personal/Car amount 10,000; interest 0.25 everywhere; tenure 0.5 yr (Home), 0.25 yr (Personal/Car).

Recommended Playwright strategy for TC2 (Personal Loan: 10 L, 12 %, 5 yr):
1. Mouse "drag/click" to computed x: `box = await slider.boundingBox(); x = box.x + box.width * (target-min)/(max-min); y = box.y + box.height/2;`
   then `mouse.move(handleCenter)`, `mouse.down()`, `mouse.move(x, y, { steps: 10 })`, `mouse.up()`.
   (jQuery UI also accepts a click on the track: `_mouseCapture` jumps the handle to the click position.)
   Ratios: amount 10L/30L = 0.3333; interest (12-5)/(25-5) = 0.35; tenure 5/5 = 1.0 (right edge).
2. Fine-tune: focus the handle and press ArrowLeft/ArrowRight while reading the input until exact
   (parse `#loanamount` with `/[^\d.]/g`). The amount track spans 300 steps over a few hundred px, so a pure drag
   will often land 1-2 steps off - the keyboard correction loop is what makes it deterministic.
3. Alternative pure keyboard path (fully deterministic from defaults): amount 7.5L -> 10L = 25 x ArrowRight;
   interest 11 -> 12 = 4 x ArrowRight; tenure: `End` (5 yr = max). Good as a fallback, but the assessment wants
   slider *interaction*, so do the mouse drag first, keyboard only for correction.
4. Always end with an assertion that the input shows `10,00,000`, `12`, `5`.

Snippet:
```ts
async function setSlider(page, sliderSel: string, inputSel: string, min: number, max: number, step: number, target: number) {
  const slider = page.locator(sliderSel);
  const handle = slider.locator('.ui-slider-handle');
  await slider.scrollIntoViewIfNeeded();
  const box = (await slider.boundingBox())!;
  const hb = (await handle.boundingBox())!;
  const x = box.x + box.width * ((target - min) / (max - min));
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, box.y + box.height / 2, { steps: 15 });
  await page.mouse.up();
  const read = async () => Number((await page.locator(inputSel).inputValue()).replace(/[^\d.]/g, ''));
  for (let i = 0; i < 20; i++) {
    const v = await read();
    if (Math.abs(v - target) < step / 2) break;
    await handle.press(v < target ? 'ArrowRight' : 'ArrowLeft');
  }
}
// Note: for tenure in "Yr" mode the input shows years; in "Mo" mode it shows 12x the slider value.
```

---

## 4. Result elements [SRC]

```html
<div id=emipaymentsummary>
  <div id=emiamount><h4>Loan EMI</h4><p>₹<span>24,959</span></p></div>
  <div id=emitotalinterest><h4>Total Interest Payable</h4><p>₹<span>34,90,279</span></p></div>
  <div id=emitotalamount><h4>Total Payment<br>(Principal + Interest)</h4><p>₹<span>59,90,279</span></p></div>
</div>
```
- Locators: `#emiamount span`, `#emitotalinterest span`, `#emitotalamount span`. Semantic alternative:
  `page.locator('#emipaymentsummary > div', { has: page.getByRole('heading', { name: 'Loan EMI' }) }).locator('p span')`.
- Format: Indian grouping, integer, no currency symbol inside the span (the `₹` is a sibling text node).
- Rounding (from `D()`):
  - `emi = Math.round(o)`
  - `totalInterest = Math.round(o*n - P)`  (uses the **unrounded** EMI `o`)
  - `totalPayment = Math.round(o*n)`
  So `totalPayment` is NOT `roundedEMI * n`. Compute exactly like the site.
- `n = Math.round(12 * years)` in Yr mode, else the month value.
- Guard rails in `D()`: interest 0 -> forced to 9 %; tenure 0 -> forced to 1 yr/12 mo.

---

## 5. Charts (Highcharts 8.1.0) [SRC]

Both charts are created with `new Highcharts.Chart({ chart: { renderTo: "<id>" } })` on **every** recalculation.
Highcharts reads `data-highcharts-chart` on the container and destroys the previous chart, so `Highcharts.charts`
contains `undefined` holes; always look the chart up by container. jQuery adapter is present so `$('#id').highcharts()`
also returns the chart [SRC: `s[r(this[0],"data-highcharts-chart")]`].

### Pie: `#emipiechart` (class `highcharts-container` is also on the outer div - careful, Highcharts adds an inner `div.highcharts-container` too)
- Title "Break-up of Total Payment".
- One series `"Principal Loan Amount vs. Total Interest"`, two points:
  - `{ name: "Principal Loan Amount", y: P, color: "#88A825" }`
  - `{ name: "Total Interest", y: o*n - P (unrounded), sliced: true, selected: true, color: "#ED8C2B" }`
- Data labels: white `<b>xx.x%</b>` (percent, 1 dp) inside slices (`distance:-30`). Legend shows the two names.
- Tooltip: `"<name>: xx.x%"`.
- **Visible text only gives percentages**, not amounts. Amounts are in `point.y` via the JS API.
- DOM: slices are `path.highcharts-point` in `g.highcharts-pie-series` (shape "arc") [INFERRED]; labels in
  `g.highcharts-data-labels text`; legend `g.highcharts-legend-item text`.

```ts
const pie = await page.evaluate(() => {
  const el = document.querySelector('#emipiechart')!;
  const idx = Number(el.getAttribute('data-highcharts-chart'));
  const ch = (window as any).Highcharts.charts[idx];
  return ch.series[0].points.map((p: any) => ({ name: p.name, y: p.y, pct: p.percentage }));
});
// UI-level cross-check: data label texts like "63.1%" / "36.9%"
const labels = await page.locator('#emipiechart .highcharts-data-labels text').allTextContents();
```

### Bar/column: `#emibarchart` (class `hidden-ts` - may be hidden at some small widths [UNVERIFIED])
- `chart.defaultSeriesType: "column"`, `plotOptions.column.stacking: "normal"`.
- Series (order in `series[]`):
  0. `"Interest"` column, yAxis 0, `#ED8C2B`
  1. `"Principal"` column, yAxis 0, `#88A825`
  2. `"Balance"` **spline** on secondary yAxis 1, `#B8204C`
- x-axis categories:
  - Calendar Year wise (default `#yearformat=calendaryear`): `2026`, `2027`, ... (numbers)
  - Financial Year wise: `"FY27"`, ... (FY = Apr-Mar, labelled by ending year; Jan-Mar belong to `FY<yy>`, Apr-Dec to `FY<yy+1>`)
- One "bar" per year = a stack of two `rect`s (Interest + Principal). Count bars = `series[0].points.length`
  (= number of categories). DOM count: `#emibarchart .highcharts-series-0 rect.highcharts-point` (columns use
  `shapeType "rect"` in v8 [SRC]; class names [INFERRED]). Do not count all `rect`s (plot background/legend use rects too).
- Tooltip formatter (non-shared, per point):
  - Column: `<b>Year : 2027</b><br/>Interest : ₹ 1,06,938<br/>Total Payment : ₹ 2,66,933`
    (`Total Payment` = `point.stackTotal` = principal+interest of that year)
  - Balance: `<b>Year : 2027</b><br/>Balance : ₹ 8,02,902<br/>Loan Paid To Date : 19.71%`
  - Values are unrounded yearly sums formatted with `"n"` (0 dp, rounded).
- Tooltip DOM (useHTML not set): `g.highcharts-tooltip > text > tspan` lines [INFERRED for v8]. `textContent` concatenates
  lines without separators; read `tspan`s individually or regex on the concatenation. Default `hideDelay` 500 ms.

Hover to trigger tooltip:
```ts
const bar = page.locator('#emibarchart .highcharts-series-1 .highcharts-point').nth(1); // Principal of year #2
await bar.hover();               // or hover series-0 (Interest), which sits on top of the stack
const tip = page.locator('#emibarchart .highcharts-tooltip');
await expect(tip).toBeVisible();
const lines = await tip.locator('tspan').allTextContents();
```
If hover is flaky (thin segments, ads overlapping), fall back to `point.onMouseOver()` via `page.evaluate` (still renders the
real tooltip DOM), or hover at the point's `plotX/plotY + chart.plotLeft/plotTop` offset.

Reading bar data via API:
```ts
const bars = await page.evaluate(() => {
  const el = document.querySelector('#emibarchart')!;
  const ch = (window as any).Highcharts.charts[Number(el.getAttribute('data-highcharts-chart'))];
  const [interest, principal, balance] = ch.series;
  return ch.xAxis[0].categories.map((c: any, i: number) => ({
    year: c, interest: interest.points[i].y, principal: principal.points[i].y,
    total: principal.points[i].stackTotal, balance: balance.points[i].y }));
});
```
Independent oracle: the amortization table `#emipaymenttable` (rows `tr.yearlypaymentdetails`, year cell `td#year2027.paymentyear`,
columns Principal / Interest / Total / Balance / Loan Paid To Date). Clicking the year cell toggles monthly rows.

### How many bars (calendar-year mode)
Schedule starts at the selected month and spans `n` months; bars = distinct calendar years touched.
For 60 months: start in **Jan -> 5 bars**; start in **any other month -> 6 bars**. In FY mode: start in **Apr -> 5**, otherwise 6.
General: `bars = (endYear - startYear + 1)` where end = start + n - 1 months.

---

## 6. "Schedule showing EMI payments starting from" calendar [SRC]

```html
<label for=startmonthyear>Schedule showing EMI payments starting from</label>
<input class=form-control id=startmonthyear name=startmonthyear type=text>   <!-- set readonly by JS -->
<span class=input-group-text><i class="far fa-calendar-alt"></i></span>
<select id=yearformat name=yearformat> Calendar Year wise | Financial Year wise </select>
```
- bootstrap-datepicker 1.9.0 initialised with `{ format: "M yyyy", minViewMode: 1, autoclose: true }` -> month picker,
  value like **`Oct 2026`**. Initial value = today (`new Date()`), so on 2026-10-05 the schedule starts **Oct 2026**.
- `readonly` is set via JS -> `fill()` will fail; must use the UI picker (which is the TC2 requirement anyway).
- Opening: click the input (`showOnFocus` default) -> dropdown appended to `body`: `div.datepicker.datepicker-dropdown.dropdown-menu`,
  month view `div.datepicker-months` with `th.prev` («), `th.datepicker-switch` (year text, e.g. "2026"), `th.next` (»),
  and `td > span.month` x12 (`Jan`...`Dec`, current one has `.active`/`.focused`) [INFERRED from bootstrap-datepicker 1.9 DOM].
- Selecting a month fires `changeDate` -> `f.g = getDate()` (1st of month) -> `B()` recalculates pie (unchanged),
  bar chart categories, and the table. `autoclose` closes the picker.
- The datepicker does **not** set a min date - past months are selectable.

Locators:
```ts
const start = page.getByLabel('Schedule showing EMI payments starting from'); // label has for=startmonthyear
await start.click();
const picker = page.locator('.datepicker-dropdown .datepicker-months');
await expect(picker).toBeVisible();
await picker.locator('th.next').click();                       // -> 2027
await expect(picker.locator('th.datepicker-switch')).toHaveText('2027');
await picker.locator('span.month', { hasText: /^Jan$/ }).click();
await expect(start).toHaveValue('Jan 2027');
```
`getByRole` fallbacks: months are `<span>` without roles; there are no semantic hooks inside the picker.
Choosing a month **in the same year as today** keeps tests stable only until the year rolls over; prefer computing the
target relative to `new Date()` or navigating to a fixed year with prev/next and asserting the switch text.

---

## 7. Ads, consent, popups, bot protection

[SRC]
- Google tag: `googletagmanager.com/gtag/js?id=GT-NFR33QC`.
- AdSense: `pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6020664305604651`, several
  `<ins class=adsbygoogle data-ad-format=rectangle>` slots: one directly **above** `.calculatorcontainer`, one in the sidebar,
  one in `.banner-emicalculator` **between the calculator and `#emipaymentdetails`** (i.e. between the pie and the
  start-month picker / bar chart). Ads load async and shift layout -> bounding boxes computed before ads load go stale.
- Auto ads (anchor/vignette full-screen interstitials) are typical for this AdSense setup [UNVERIFIED] and can overlay the page.
- No cookie/consent banner markup or CMP code in the static source. Google Funding Choices
  (`fundingchoicesmessages.google.com`) may be injected by AdSense for EEA/UK visitors at runtime [UNVERIFIED].
- Akismet, comment-reply, ajax-load-more (comments section far below).
- No Cloudflare: headers are plain `Server: nginx`, no `cf-ray`; `curl` with a non-browser UA also got 200. Long cache headers
  (`Cache-Control: max-age=315360000`) - static cached HTML.

Suggested route blocking (does not affect calculator JS, which is self-hosted on emicalculator.net):
```ts
const BLOCK = [
  /googlesyndication\.com/, /doubleclick\.net/, /googleadservices\.com/, /adservice\.google\./,
  /googletagmanager\.com/, /google-analytics\.com/, /fundingchoicesmessages\.google\.com/,
  /googletagservices\.com/, /tpc\.googlesyndication\.com/, /ampproject\.org/, /gstatic\.com\/adsense/,
];
await context.route('**/*', r => BLOCK.some(re => re.test(r.request().url())) ? r.abort() : r.continue());
```
Also keep fonts (`fonts.googleapis.com`) or block them too - not required for functionality. Add a defensive
`page.addLocatorHandler` for any consent dialog (`getByRole('button', { name: /consent|accept|do not consent/i })`) -
prefer "Do not consent"/privacy-preserving option if it ever appears.

---

## 8. Formula and expected numbers [SRC formula, computed with node]

Site formula (`D()`), arrears mode: `s = rate/12/100`, `n = round(12*years)`,
`o = P * s * (1+s)^n / ((1+s)^n - 1)`. Car loan "EMI in Advance": `o = P*s*(1+s)^(n-1)/((1+s)^n - 1)`.

| Scenario | P | Rate | Years (n) | EMI raw | **EMI** | **Total Interest** | **Total Payment** | Pie % principal / interest |
|---|---|---|---|---|---|---|---|---|
| TC1-A Home | 25,00,000 | 10 % | 10 (120) | 33037.6842 | **33,038** | **14,64,522** | **39,64,522** | 63.1 % / 36.9 % |
| TC1-B Home | 50,00,000 | 7.5 % | 15 (180) | 46350.6180 | **46,351** | **33,43,111** | **83,43,111** | 59.9 % / 40.1 % |
| TC2 Personal | 10,00,000 | 12 % | 5 (60) | 22244.4477 | **22,244** | **3,34,667** | **13,34,667** | 74.9 % / 25.1 % |

Pie point values expected: A `y = 2500000` and `1464522.11`; B `5000000` and `3343111.24`; Personal `1000000` and `334666.86`.

Personal loan yearly schedule (calendar year mode), as the bar tooltips/table should show:

Start **Oct 2026** (default today) -> 6 bars

| Year | Principal | Interest | Total | Balance | Paid % |
|---|---|---|---|---|---|
| 2026 | 37,102 | 29,631 | 66,733 | 9,62,898 | 3.71 |
| 2027 | 1,59,996 | 1,06,938 | 2,66,933 | 8,02,902 | 19.71 |
| 2028 | 1,80,287 | 86,646 | 2,66,933 | 6,22,615 | 37.74 |
| 2029 | 2,03,152 | 63,781 | 2,66,933 | 4,19,463 | 58.05 |
| 2030 | 2,28,917 | 38,017 | 2,66,933 | 1,90,546 | 80.95 |
| 2031 | 1,90,546 | 9,654 | 2,00,200 | 0 | 100.00 |

Start **Jan 2027** -> 5 bars: 2027 (1,55,290 / 1,11,643 / 2,66,933), 2028 (1,74,985 / 91,948), 2029 (1,97,177 / 69,756),
2030 (2,22,184 / 44,749), 2031 (2,50,363 / 16,570 / bal 0).

Start **Jun 2027** -> 6 bars: 2027 (88,326 / 67,385 / 1,55,711), 2028 (1,66,492 / 1,00,441), 2029 (1,87,608 / 79,326),
2030 (2,11,401 / 55,533), 2031 (2,38,212 / 28,722), 2032 (1,07,962 / 3,260 / 1,11,222).

Note: a full year's total is `12 * EMI_raw = 2,66,933` (rounded). Rounded components may not sum exactly to the rounded
total (each is rounded independently) -> compare with +/-1 tolerance. Last-year balance is forced to 0.

Reference implementation (mirrors site code):
```ts
export function emi(P: number, ratePct: number, months: number) {
  const s = ratePct / 12 / 100;
  const o = (Math.pow(1 + s, months) / (Math.pow(1 + s, months) - 1)) * s * P;
  return { raw: o, emi: Math.round(o), totalInterest: Math.round(o * months - P), totalPayment: Math.round(o * months) };
}
export function yearly(P: number, ratePct: number, months: number, startYear: number, startMonth0: number) {
  const { raw: o } = emi(P, ratePct, months); const s = ratePct / 1200;
  const out = new Map<number, { principal: number; interest: number; balance: number }>();
  let bal = P; const d = new Date(startYear, startMonth0, 1);
  for (let t = 0; t < months; t++) {
    if (t > 0) d.setMonth(d.getMonth() + 1, 1);
    const i = bal * s, p = o - i; bal -= p;
    const y = d.getFullYear(); const r = out.get(y) ?? { principal: 0, interest: 0, balance: 0 };
    r.principal += p; r.interest += i; r.balance = bal; out.set(y, r);
  }
  [...out.values()].at(-1)!.balance = 0;
  return out; // size === number of bars
}
// Indian format: Math.round(n).toLocaleString('en-IN')  -> "2,66,933"
```

---

## Candidate locator table

| Target | Preferred (semantic) | Fallback |
|---|---|---|
| Tabs | `ul.loanproduct-nav` scope + `getByRole('link', { name: 'Personal Loan', exact: true })` | `#personal-loan > a` |
| Amount input | `getByLabel(/^(Home|Personal|Car) Loan Amount$/)` | `#loanamount` |
| Interest input | `getByLabel('Interest Rate', { exact: true })` | `#loaninterest` |
| Tenure input | `getByLabel('Loan Tenure', { exact: true })` | `#loanterm` |
| Yr / Mo | `getByText('Yr', { exact: true })` | `label:has(#loanyears)` |
| Sliders | none (no ARIA) | `#loanamountslider .ui-slider-handle`, `#loaninterestslider ...`, `#loantermslider ...` |
| EMI / interest / total | heading `Loan EMI` / `Total Interest Payable` / `Total Payment` inside `#emipaymentsummary` | `#emiamount span`, `#emitotalinterest span`, `#emitotalamount span` |
| Pie | none | `#emipiechart svg`, `.highcharts-data-labels text`, Highcharts API |
| Bar chart | none | `#emibarchart svg`, `.highcharts-series-N .highcharts-point`, `.highcharts-tooltip` |
| Start month | `getByLabel('Schedule showing EMI payments starting from')` | `#startmonthyear`, `.datepicker-months span.month` |
| Year format | `getByLabel`? (no label for `#yearformat`) -> `getByRole('combobox')` scoped to `#emipaymentscheduleheader` | `#yearformat` |
| Schedule table | `#emipaymenttable` rows `tr.yearlypaymentdetails` | `td#year2027` |

---

## Risks

1. **Ads / layout shift** - AdSense slot between calculator and schedule; auto/anchor/vignette ads may cover sliders or bars.
   Mitigate with `page.route` blocking + re-measuring bounding boxes right before mouse actions.
2. **Slider precision** - 300 steps on the Personal amount track; pixel rounding means a drag lands off by a step; must
   correct with arrow keys and assert the input. Viewport width changes step/pixel ratio.
3. **No accessible names** for sliders, chart points, datepicker cells - id/class locators unavoidable there.
4. **Recalc only on `change`/user events** - `fill()` without blur, or programmatic slider value, leaves results stale.
5. **Async recalculation** (`setTimeout 10ms` + mask) - always `expect(...).toHaveText(...)` (auto-retry), never read once.
6. **Charts re-created** on every recalculation; stale element handles / chart references. Re-query after every change;
   look up by `data-highcharts-chart`.
7. **Date dependence** - default start month = today; bar count (5 vs 6) and first-year values change month to month.
   Select an explicit month in tests and compute expectations from it.
8. **Tooltip hover** on stacked columns: tiny segments (e.g. final-year interest 9,654) are hard to hover; hover the
   principal segment of a middle year; tooltip hides after 500 ms.
9. **Responsive classes** (`hidden-ts`, `d-none d-sm-*`) - bar chart/ticks may be hidden on narrow viewports [UNVERIFIED]; use a desktop viewport.
10. **Static HTML values differ from runtime defaults** (25 L / 10.5 % vs 50 L / 9 %). Wait for JS init before interacting
    (e.g. `expect(#loanamount).toHaveValue('50,00,000')`).
11. **Tab switch resets all inputs** - set values after switching, not before.
12. Third-party Funding Choices consent dialog for EU IPs [UNVERIFIED]; CI runners in EU regions could see it.
13. Site may update its theme JS (`?x41029` cache buster); ids are long-lived but re-verify before submission.

## To verify in a real browser
- Exact handle element / classes, `.masked` class during recalculation.
- Datepicker DOM classes and that `getByLabel` resolves `#startmonthyear`.
- Bar DOM classes (`highcharts-series-0/1`, `rect.highcharts-point`) and tooltip `tspan` structure.
- Presence/absence of consent dialogs and auto ads with and without route blocking.
- That `getByLabel('Interest Rate', { exact: true })` etc. are unique.
