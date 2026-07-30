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
| عناية قلبية / عناية مركز / عناية داخلية / سابع / رابع / تالت / تاني / خارجيات / ديال / أورام / إسعاف مركز صباحي / اسعاف بارد صباحي | 2:30 حتى 10:00 | 7 ساعات ونصف | 9 صباحاً حتى 10 ليلاً | 13 ساعة |
| إسعاف مركز ليلي / اسعاف بارد ليلي | 10:00 ليلاً حتى 8:30 صباحاً | 10 ساعات ونصف | 10:00 ليلاً حتى 9:00 صباحاً | 11 ساعة |

**New schedule** (`ONCALL_SCHEDULE_NEW`, used for on-call days on/after the switch date — full/كاملة shifts):

| Category | Workday | Duration | Holiday | Duration |
|---|---|---|---|---|
| عناية قلبية / عناية مركز / عناية داخلية / سابع / رابع / تالت / تاني / خارجيات / ديال / أورام | 2:30 حتى 8:30 | 18 ساعة | 9:00 حتى 9:00 | 24 ساعة |
| إسعاف مركز صباحي / اسعاف بارد صباحي | 2:30 حتى 10:00 | 7 ساعات ونصف | 9:00 حتى 10:00 | 13 ساعة |
| إسعاف مركز ليلي / اسعاف بارد ليلي | 10:00 حتى 8:30 | 10 ساعات ونصف | 10:00 حتى 9:00 | 11 ساعة |

`getCategorySchedule(cat, dateIso)` in `app.js` picks the old or new table by
comparing `dateIso` (the on-call day being displayed) to
`ONCALL_SCHEDULE_SWITCH_DATE`, looks up the category by normalized-name match
(with a fallback for any "إسعاف/اسعاف"-prefixed category name), then picks
the holiday or workday row depending on `isHolidayDate(dateIso)`.

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
