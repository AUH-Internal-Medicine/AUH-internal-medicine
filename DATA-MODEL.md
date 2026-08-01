# Data Model — Google Sheet Layout

All content shown by the app comes from **one public Google Sheet**, read live in
the browser through Google's **gviz** ("Google Visualization") query endpoint.
There is no server and no write path — the app is read-only against the sheet.

## Source spreadsheet

- **Spreadsheet ID** (`SID` in code): `1Pb5VK1HsccaJpKXm-jersktd8yk4jf1V7o8qsDDmCI4`
- The sheet must be shared as **"Anyone with the link can view"**, or the
  browser fetch fails and the page shows cached/empty data.

Each tab (worksheet) is addressed by its numeric **GID**. The app fetches seven tabs:

| Constant | GID | Tab content | Fetched as |
|---|---|---|---|
| `GID_R` | `0` | Residents roster (لائحة المقيمين) | CSV |
| `GID_O` | `238974679` | On-call schedule (المناوبات) | JSON |
| `GID_E` | `253629565` | Annual evaluation (التقييم السنوي) | CSV |
| `GID_L` | `1649404909` | Links / channels (روابط) | CSV |
| `GID_Q` | `680270268` | Q&A (الأسئلة والأجوبة) | JSON |
| `GID_LEC` | `393274093` | Lectures & medical activities calendar (رزنامة المحاضرات والانشطة الطبية) | CSV |
| `GID_OR` | `1364488029` | On-call rules (annual holiday dates only — see note below) | CSV |

> ⚠️ **As of 2026-07-30, there is no "doctor statistics" sheet tab anymore.**
> A `GID_DS` tab (`811980834`) used to be hand-maintained and read directly,
> but that manual process was unreliable, so it was removed entirely. Doctor
> statistics are now **computed by the app itself** from `GID_R` (residents)
> and `GID_O` (the on-call log) — see the "Computed Doctor Statistics"
> section near the end of this file.

### Endpoint shapes
- CSV: `https://docs.google.com/spreadsheets/d/{SID}/gviz/tq?tqx=out:csv&gid={GID}`
- JSON: `https://docs.google.com/spreadsheets/d/{SID}/gviz/tq?tqx=out:json&gid={GID}`

Both are normalized in code to the same in-memory shape:
**`[ headerRow, ...dataRows ]`**, where every row is an **array of strings**.
Indexing below is **0-based** and refers to that array.

> ⚠️ For the **residents** sheet, core fields are read by **header name** first,
> with legacy index fallback for compatibility. Shift columns are discovered by
> header pattern. Renaming required headers will affect parsing.

---

## 1. Residents (`GID_R = 0`, CSV)

Row 0 is the header. Each subsequent row is one resident. Rows whose name cell is
empty, or contains the literal "الاسم" (header echo), are skipped.

| Header name (preferred) | Field (code name) | Arabic meaning |
|---|---|---|
| `الاسم الثلاثي` (fallback: `الاسم`) | `name` | الاسم الثلاثي (full name) |
| `الاختصار` | `abbr` | الاختصار (abbreviation / short code) |
| `الاختصاص` | `spec` | الاختصاص (specialty) |
| `رقم الهاتف` (fallback: `الهاتف`) | `phone` | الهاتف |
| `تاريخ الالتحاق` (fallback: `الالتحاق`) | `join` | تاريخ الالتحاق |
| `المناوبات+` (fallback: `المناوبات التراكمية`/`المناوبات`) | `onc` / `cumulativeOnc` | المناوبات التراكمية |
| `الحالة` | `st` | الحالة (status — drives `isJoined()`) |
| `فرز شهر <رقم>` | monthly shift columns | الفرز الشهري |

**Status (`st`):** a resident is considered "joined" if the status text
contains التحق, ملتحق, or التحاق (`isJoined()`).

Residents with status containing `تم الانفكاك` are hidden from the roster by
default, excluded from contact export, and can be shown via the dedicated
detached filter button.

**Monthly shift columns:** discovered dynamically by scanning the
header row for cells matching the regex `فرز شهر (\d+)` (e.g. "فرز شهر 6" = shift
for month 6). This lets you add a new month by adding a new column with that
header; no code change needed. Cells equal to "غير محدد" (unspecified) are
ignored. In UI defaults, the app now prefers showing next month if that column
already contains real values; this supports publishing upcoming shifts before
the month actually starts.

---

## 2. On-call (`GID_O = 238974679`, JSON)

Parsed by `parseOncallData`. The first one or two rows may be headers; the parser
detects a header row where col 0 == "اليوم" and col 1 contains "Date".

| Index | Meaning |
|---|---|
| 0 | Day name (اليوم) — optional; computed from the date if missing. |
| 1 | Date. From gviz JSON this arrives as `Date(year, monthIndex, day)`; the parser converts it to `YYYY-MM-DD`. If absent, falls back to col 0 + `extractDate()`. |
| 2 … N | **One column per on-call category.** The header cell is the category name; the cell value is one or more resident names/abbreviations (newline- or separator-delimited). |

So an on-call day is "for each category column, these residents are on call." The
app resolves each listed name/abbr back to a full resident (for phone numbers)
via `findRbyExact`.

---

## 3. Evaluation (`GID_E = 253629565`, CSV)

Row 0 = headers. Real resident rows start at **index 3** (rows 1–2 are typically a
header continuation and an example row labeled "مثال توضيحي", which is rendered
greyed-out and excluded from cards/lookups).

| Index | Meaning |
|---|---|
| 1 | Name (الاسم) |
| 2 | Abbreviation / code (الاختصار) |
| 3 | Specialty (الاختصاص) |
| 4 | المهارات السريرية (clinical skills) |
| 5 | المعرفة الطبية (medical knowledge) |
| 6 | اتخاذ القرار (decision making) |
| 7 | المهارات الاجرائية (procedural skills) |
| 8 | العمل ضمن فريق (teamwork) |
| 9 | المهنية والانضباط (professionalism & discipline) |
| 10 | التواصل مع المرضى (patient communication) |
| 11 | النشاطات الاكاديمية (academic activities) |
| 12 | المحصلة الاجمالية (total) |
| 13 | الثناءات 🌟 (praises) |
| 14 | العقوبات ⚠️ (penalties) |

The skill labels above are defaults baked into `getEvalForResident`; if the sheet
provides its own header labels, those are used instead.

---

## 4. Links (`GID_L = 1649404909`, CSV)

Row 0 = headers. One link/channel per row.

| Index | Meaning |
|---|---|
| 0 | Sequence (ت) |
| 1 | Name (الاسم) |
| 2 | Type (النوع) |
| 3 | Purpose / goal (الغاية والهدف) |
| 4 | Members (الاعضاء) |
| 5 | Join URL (رابط الانضمام) — values starting with `http` render as a button. |

---

## 5. Q&A (`GID_Q = 680270268`, JSON)

Row 0 = headers. Rows where question or answer is empty, or equals a header
literal ("السؤال", "التصنيف"), are skipped.

| Index | Meaning |
|---|---|
| 1 | Category (التصنيف) — defaults to "عام" (general) if blank. |
| 2 | Question (السؤال) |
| 3 | Answer (الجواب) |

Entries are grouped by category into collapsible sections, sorted alphabetically.

---

## 6. Lectures Calendar (`GID_LEC = 393274093`, CSV)

Row 0 is the header and is matched by header names (trimmed/normalized).

| Header name | Meaning |
|---|---|
| `التاريخ` | Lecture/activity date. Parsed from day/month/year style values (e.g. `يوم / شهر / سنة`). |
| `التصنيف` | Category / type. |
| `العنوان` | Lecture title. |
| `المحتويات` | Lecture content/summary. |
| `المحاضر` | Speaker. |
| `المكان` | Place/location. |
| `التوقيت` | Start time. |
| `المدة` | Duration. |
| `القسم` | Department. |
| `السنة` | Year/level. |
| `رابط التسجيل` | Optional registration URL (shown only when present). |
| `رابط الاعلان` / `رابط الإعلان` | Optional announcement URL (shown only when present). |

Rendering behavior:
- Smart search covers title + content + speaker.
- Category, department, and year filters are generated dynamically from available rows.
- "Today" hero shows sessions whose end time has not passed yet.
- Past sessions are hidden by default and can be shown with the dedicated toggle.

---

## 7. Computed Doctor Statistics (no sheet tab — computed by the app)

There is no "doctor statistics" sheet tab. `computeDoctorStats()` in `app.js`
builds `this.doctorStats` (one entry per resident) by:

1. Starting from every resident in `this.res` (parsed from `GID_R`): `name`,
   `abbr`, `spec`, `status`, `join`, and `joinDaysSince` (via `daysSinceDate`).
2. Scanning **every row of the on-call log** (`this.oncRows`, from `GID_O`) —
   for every category column on every day, `splitNames()` the cell, resolve
   each name/abbreviation back to a resident via `findRbyExact()`, and
   increment that resident's counters:
   - `total` — every on-call assignment found for them, past or future.
   - `completed` / `remaining` — split by whether the on-call date is before
     or on/after `this.today`.
   - `wards` / `icu` / `emergency` / `misc` — via `classifyOncallGroup(cat)`,
     which buckets the on-call category name:
     - **أجنحة (wards):** تاني/ثاني، تالت/ثالث، رابع، خارجيات، سابع
     - **عنايات (icu):** any category name containing "عناية"
     - **اسعاف (emergency):** any category name starting with "اسعاف"/"إسعاف"
     - **منوع (misc):** أورام، ديال
   - `groupDetails.{group}[categoryName]` — a per-category count *within* each
     group (e.g. `groupDetails.emergency = {'اسعاف بارد صباحي': 2, ...}`), so
     the UI can drill into "اسعاف: 4" and show which sub-types made it up.
   - `catDates[categoryName]` — every date that category occurred for this
     resident, so the UI can show "تالت: 4" → the 4 actual dates on click.
   - `holiday` — incremented when `isHolidayDate(date)` is true for that day.
   - `night` — incremented when the category name contains "ليلي".
   - `hoursTotal` — sums the duration for **every** assignment (past+future).
   - `hoursCompleted` — sums the duration only for assignments before today —
     this is the primary "hours worked so far" figure shown first in the UI.
   - `firstOncall` / `lastOncall` — the earliest/latest on-call date found.
   Durations come from `getCategorySchedule(cat, date)` (the fixed
   `ONCALL_SCHEDULE_OLD`/`_NEW` tables) parsed by `parseDurationHours()` in
   `helpers.js` (e.g. "7 ساعات ونصف" → `7.5`).
3. After the scan, ranks are computed by sorting copies of the list: `rankCompleted`
   (by `hoursCompleted` descending) and `rankTotal` (by `hoursTotal` descending) —
   shown next to each hours figure in the UI.
4. A resident found in the on-call log but missing from `GID_R` (e.g. an old
   abbreviation) still gets an entry, built from whatever name/abbr appeared
   in the log, so no on-call assignment is silently dropped from the totals.

`renderDoctorStats()` renders one card per resident into `#doctorStatsGrid`
(`.doctor-stat-card`, see `styles.css`) — no desktop table anymore, the same
card grid is used at every screen width. Each of the four group chips
(`groupDetailHtml()`) is a clickable button that expands to show the
per-category breakdown for that group (reuses the existing `toggleCollapsible`
pattern). `getFilteredDoctorStats()` applies the search box (`smartSearch`
over name/abbr/spec) and sorts by `hoursCompleted` (descending by default;
`toggleDoctorStatsSort('hours')` cycles desc → asc → off). The same computed
entry (looked up by `getDoctorStatsForResident(name, abbr)`) is reused inside
"معلوماتي" (My Info) via `doctorStatCardHtml()`, so a resident sees the
identical stat card for themselves that appears in the main احصائيات
الأطباء tab — including first/last on-call date and clickable group detail.

My Info's own top summary (separate from the reused stat card) now shows
**three** boxes instead of two — cumulative on-calls + cumulative hours,
completed on-calls + completed hours, and days since join — all sourced from
this computed data instead of the residents sheet's manual "المناوبات+"
column. Its "توزيع المناوبات التراكمية" breakdown items are also clickable,
expanding to show the exact dates for that category (from `catDates`).

Because this depends on both `GID_R` and `GID_O`, `computeDoctorStats()` is
called only after both have been parsed (end of `loadFresh()` and
`applyCachedData()`).

---

## 8. On-call Rules (`GID_OR = 1364488029`, CSV)

> ⚠️ **As of 2026-07-30, the duty time/duration schedule is a FIXED table in
> code** (`ONCALL_SCHEDULE_OLD` / `ONCALL_SCHEDULE_NEW` in `helpers.js`), not
> read from this tab anymore. There are two schedules because duty genuinely
> changed from partial (جزئي) to full (كاملة) shifts on a real date: on-call
> days before `ONCALL_SCHEDULE_SWITCH_DATE` (`'2026-07-23'`, also fixed in
> `helpers.js`) use the old schedule; days on/after it use the new one. The
> comparison is per on-call day, not against "today". To change a duty time,
> duration, or the cutover date now, edit these constants directly in
> `helpers.js` — editing the sheet's rows 1–10 no longer has any effect.

This tab is still fetched only to read **annual holiday dates**, if present.

- Annual holiday dates are read from the section under `العطل السنوية`
  (`B14`, `B15`, ... when present). `parseOncallRules()` in `app.js` still
  looks for this section; everything else in that tab (rows 1–10, the old
  time/duration/switch-date block) is now ignored by the app.

Holiday definition used by the app:
- Fridays + Saturdays
- annual holidays from the rules sheet (if the "العطل السنوية" section exists)

### Fixed duty schedules (`helpers.js`)

`ONCALL_SCHEDULE_SWITCH_DATE = '2026-07-23'`. Each schedule has one entry per
on-call category with `workTime`, `workDuration`, `holidayTime`,
`holidayDuration` (Arabic strings, shown as-is in the UI).

**Old schedule** (`ONCALL_SCHEDULE_OLD`, used for on-call days before the switch date — partial/جزئي shifts):

| Category | Workday | Duration | Holiday | Duration |
|---|---|---|---|---|
| عناية قلبية / عناية مركز / عناية داخلية / سابع / رابع / تالت / تاني / خارجيات / ديال / أورام / إسعاف مركز صباحي / اسعاف بارد صباحي / إسعاف باب نهاري | 2:30 حتى 10:00 | 7 ساعات ونصف | 9 صباحاً حتى 10 ليلاً | 13 ساعة |
| إسعاف مركز ليلي / اسعاف بارد ليلي / اسعاف باب ليلي | 10:00 ليلاً حتى 8:30 صباحاً | 10 ساعات ونصف | 10:00 ليلاً حتى 9:00 صباحاً | 11 ساعة |

**New schedule** (`ONCALL_SCHEDULE_NEW`, used for on-call days on/after the switch date — full/كاملة shifts):

| Category | Workday | Duration | Holiday | Duration |
|---|---|---|---|---|
| عناية قلبية / عناية مركز / عناية داخلية / سابع / رابع / تالت / تاني / خارجيات / ديال / أورام | 2:30 pm حتى 8:30 am | 18 ساعة | 9:00 am حتى 9:00 am | 24 ساعة |
| إسعاف مركز صباحي / اسعاف بارد صباحي / إسعاف باب نهاري | 2:30 pm حتى 10:00 pm | 7 ساعات ونصف | 9:00 am حتى 10:00 pm | 13 ساعة |
| إسعاف مركز ليلي / اسعاف بارد ليلي / اسعاف باب ليلي | 10:00 pm حتى 8:30 am | 10 ساعات ونصف | 10:00 pm حتى 9:00 am | 11 ساعة |

> Updated 2026-07-30: `ONCALL_SCHEDULE_NEW`'s `workTime`/`holidayTime` strings
> now include `am`/`pm` (e.g. `2:30 pm حتى 8:30 am`) for clarity — purely
> display text, the underlying hour numbers and `workDuration`/
> `holidayDuration` values are unchanged. `ONCALL_SCHEDULE_OLD` (historical,
> before the switch date) was left as plain text since no AM/PM change was
> requested for it.

> Added 2026-07-30: `إسعاف باب نهاري` / `اسعاف باب ليلي` are two brand-new
> on-call categories (a person stationed at the ER door/reception, day and
> night shifts) — given the same single time/duration in both the old and new
> tables since only one schedule was supplied for them (no historical
> before/after-switch distinction was requested).

`getCategorySchedule(cat, dateIso)` in `app.js` picks the old or new table by
comparing `dateIso` (the on-call day being displayed) to
`ONCALL_SCHEDULE_SWITCH_DATE`, looks up the category by normalized-name match
(with a fallback for any "إسعاف/اسعاف"-prefixed category name), then picks
the holiday or workday row depending on `isHolidayDate(dateIso)`.

---

## 9. Second Source Spreadsheet — Year-2 On-call Schedule

- **Spreadsheet ID** (`SID2` in code): `1dOvCHFQBYz0wFklUFicjf8iU3IscJNzUrUcSYeKMlh8`, tab `GID_O2 = '0'`, fetched as CSV.
- Structurally different from everything above: **two merged header rows** instead of
  one plain header row, and **no separate day-name column** (column A = date directly,
  columns B onward = one resident name per column, ~45 data columns).
  - Row 1 = the duty **group** name (e.g. "الاسعاف", "جناح السابع", "عناية قلبية"),
    merged across every column that group occupies (so only the first column of each
    group actually has text — Sheets/gviz leaves the rest of a merged range blank).
  - Row 2 = a **sub-role** name, merged the same way, but only present under the
    "الاسعاف" group: "الاسعاف النهاري" / "باب" / "بارد" (day shift: main hall / door /
    cold-triage-room) and "الاسعاف الليلي" / "باب" / "بارد" (same three roles, night shift).
  - Dates use a **backslash** separator (`1\8\2026`), which `extractDate()` in
    `helpers.js` now also accepts (in addition to `/`, `-`, `.`).
- `buildYear2CategoryLabels(row1, row2)` in `helpers.js` produces one clean category
  label per column by **forward-filling** each merged header row (a blank cell inherits
  the nearest earlier non-blank cell in the same row) — so it adapts automatically to
  however many columns each group/sub-role spans; nothing is hardcoded. Inside "الاسعاف"
  it also tracks which shift ("نهاري"/"ليلي") is currently active so "باب"/"بارد" become
  unambiguous combined labels: `اسعاف باب نهاري`, `اسعاف بارد نهاري`, `اسعاف باب ليلي`,
  `اسعاف بارد ليلي` (the group's own "الاسعاف النهاري"/"الاسعاف الليلي" sub-header rows
  are already unambiguous and used as-is).
- `parseOncallDataY2()` in `app.js` normalizes the result into the **same shape** as
  Year-1's on-call data (`this.oncRows2` / `this.oncHeaders2`, with placeholder
  `['اليوم','التاريخ', ...]` at index 0/1 so category columns start at index 2 for both
  years) — this lets the rendering code (calendar day view, raw table) treat both years
  uniformly instead of needing two separate code paths.
- **Year-1 ↔ Year-2 category matching** (`YEAR2_CATEGORY_MAP` in `helpers.js`) is a
  best-effort name correspondence used only to show "زملاء السنة الثانية" in My Info —
  the two schedules don't track duty identically (Year-2 splits emergency duty into
  hall/cold-room/door, which Year-1 doesn't), so categories with no clear equivalent
  (e.g. Year-1's "أورام") are simply omitted rather than guessed. Edit that map in
  `helpers.js` if a correspondence turns out to be wrong.
- **UI**: the المناوبات tab has a year filter (`#oncallYearFilter`, three buttons —
  أولى فقط / ثانية فقط / أولى + ثانية) driving `changeOncallYearFilter()` in `app.js`,
  which re-renders both the day-view (`showOncallDate`) and the raw table
  (`renderOncallRawTable`); when both years are selected, each renders as its own
  clearly-headed section rather than merging category lists together.

---

## 10. On-call Adjustments (`GID_ADJ = 1181737768`, CSV, main spreadsheet)

A manually-maintained tab for cases that can't be edited directly into the main
on-call table (`GID_O`): per-person overtime-hour corrections, and brand-new
volunteer shifts. Columns (no strict header-name matching — read by fixed
position):

| Col | Field | Notes |
|---|---|---|
| A | الاسم | Full name |
| B | الاختصار | Abbreviation |
| C | تاريخ المناوبة | Day-month-year (`extractDate()` handles `-`, `/`, `.`, `\`) |
| D | نوع المناوبة | Category name — must match a category name in `GID_O`'s header row for an hours-override to be recognized; for a volunteer addition it can be any category name (existing or new) |
| E | عدد الساعات | Numeric hours for that person on that shift |

`parseOncallAdjustments()` in `app.js` parses this into `this.oncallAdjustments`
(skips rows with an unparsable date/hours, logging a `console.warn`).
`resolveOncallAdjustments()` (run once, after both residents and the Year-1
on-call log are parsed) classifies each row into exactly one of:

- **Override** — the person is *already* listed in `GID_O` for that
  date+category (checked via `isResidentOnCallFor()`). Stored in
  `this.adjustmentOverrides` (`Map`, key `` `${date}|${abbr}|${normAr(category)}` ``
  → corrected hours). This lets 3 out of 5 people on the same shift get a
  personal hour correction while the other 2 keep the standard duration.
- **Addition** — the person is *not* already listed there (a new date, or an
  existing date/category they simply weren't on). Stored in
  `this.adjustmentAdditions` (array of `{date, category, name, abbr, hours}`) —
  treated everywhere as if it were a real entry in `GID_O`.

Consumed by:
- **`computeDoctorStats()`** — overrides replace the computed duration for that
  specific person+shift; additions are folded in as brand-new entries (same
  group/holiday/night/hours accounting as a normal on-call row).
- **My Info (`showMe`)** — `getColleaguesForDateCategory()` merges real on-call
  names with same-day/category additions so colleague lists stay consistent in
  both directions; overridden/volunteer entries show a "ساعات معدّلة" /
  "تطوعية" badge.
- **On-call day view (`showOncallDate` / `buildOncallCategoriesForDate`)** —
  additions appear inside their category (creating the category if it's a
  brand-new one for that day) with a "تطوعي" badge + their hours; people with
  an override get a small hours badge next to just their name tag. Only
  applied to Year-1 (`applyAdjustments` is `false` for the Year-2 render path).
- **Main on-call calendar (`renderMonthlyCalendar`)** — any day with at least
  one addition gets a small gold dot, so a brand-new volunteer date is
  discoverable even though it wasn't previously a normal on-call day.

Not applied to the raw "عرض كجدول" table, which intentionally mirrors `GID_O`'s
literal cell contents.

---

## Doctor Statistics Excel export

`downloadDoctorStatsExcel()` in `app.js` (button in the احصائيات الأطباء tab)
uses SheetJS (loaded via CDN in `index.html`) to export `this.doctorStats` —
sorted by `hoursCompleted` descending — as a 17-column `.xlsx` file (name,
abbr, days since join, cumulative/completed on-call counts, hours + rank for
both completed and cumulative, the four group counts, holiday/night counts,
first/last on-call date). Column widths and an autofilter are set for
readability; hour values are rounded to 1 decimal to avoid floating-point
noise in the exported cells.

---

## Caching & refresh

- The full fetched dataset is cached in `localStorage` under key pattern
  **`hc_v63_<buildId>`** with a timestamp (`buildId` is injected at deploy time).
- Cache **TTL is 10 minutes** (`CD = 10 * 60 * 1000`). Within the TTL the page
  renders instantly from cache and still refreshes in the background.
- The app re-fetches every **120 seconds** while open.
- Sheet fetches use `fetch(..., { cache: 'no-store' })` plus a cache-busting
  query parameter on each request to reduce stale CDN/browser responses.
- Refresh on tab resume follows the same non-disruptive network-first path,
  and on-call rendering keeps the currently selected date to avoid unexpected
  jumps back to today's date while reading.
- To force-invalidate every visitor's cache after a breaking data change, bump
  the cache key base version in `helpers.js` (e.g. `hc_v63` → `hc_v64`).
  Note that each deploy already gets a unique `buildId`, so stale payload reuse
  across deployments is avoided by default.

## Changing the data source

If you point the app at a different spreadsheet, update `SID` and the eight `GID_*`
constants near line 332 of `index.html`, and make sure the new tabs match the
column contracts above (or update the renderers accordingly).
