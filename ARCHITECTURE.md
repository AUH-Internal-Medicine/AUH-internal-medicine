# Architecture & Code Guide

This document explains how the app is organized internally so any developer or
AI model can navigate and modify it confidently. The runtime is still a static
single-page app, but the code is now split across a thin HTML shell plus
separate CSS and JavaScript files.

> Read [DATA-MODEL.md](DATA-MODEL.md) alongside this — much of the JS only makes
> sense once you know the Google Sheet column layout it reads.

---

## File layout

Approximate line ranges in `index.html` before the split were used as the
starting map; the current app code now lives in separate files.

| File / section | Notes |
|---|---|
| `index.html` | `<head>` meta, title (Arabic, `dir="rtl"`), favicon (inline SVG 🏥), CDN links, `bg.png` preload, and external includes for `styles.css`, `helpers.js`, and `app.js`. |
| `styles.css` | All CSS. CSS custom properties (`:root`), dark-mode overrides (`body.dark-mode`), component styles, and responsive `@media` blocks at the end. |
| `helpers.js` | Shared globals and non-class logic: helper functions, configuration constants, and `buildNav()` / `buildMainContent()`. |
| `app.js` | The `HospitalApp` class and `DOMContentLoaded` bootstrap. |

### Inside the `<script>` (lines 303–531)

| Lines | What |
|---|---|
| `helpers.js` top section | `toggleDarkMode()` + dark-mode restore from `localStorage`, tooltip handlers, copy helpers, collapsible/Q&A toggles, dropdown handling, `showToast`, download-progress overlay control, and the pure helper functions. |
| `helpers.js` config section | Google Sheet id, tab GIDs, Arabic month/day names, cache key + TTL, tab list. |
| `helpers.js` builder section | `buildNav()` and `buildMainContent()` — return HTML strings for the nav buttons and core tab sections, including the support/complaints section opened from the floating shortcut. Additional static WIP tabs (`exams`, `clinicalcases`) are appended at runtime by `HospitalApp.ensureAdditionalStaticTabs()`. |
| `app.js` class section | `class HospitalApp` — the whole application. |
| `app.js` bootstrap | On `DOMContentLoaded`, `app = new HospitalApp(); window.app = app`. |

`window.app` is global on purpose: inline `onclick="app.method(...)"` handlers
throughout the rendered HTML call back into the instance.

---

## The `HospitalApp` class

A single class holds all state and behavior. Key instance fields (set in the
constructor, lines 349–357):

| Field | Meaning |
|---|---|
| `this.m`, `this.mn` | Current month index (0–11) and its Arabic name. |
| `this.today` | Today as `YYYY-MM-DD` string. |
| `this.res` | Parsed resident objects (the normalized roster). |
| `this.oncRows`, `this.oncHeaders` | Parsed on-call rows and their category headers. |
| `this.evalData`, `this.linksData`, `this.qaData` | Raw row arrays for those tabs. |
| `this._resHeaders`, `this._resRaw` | Raw header row and raw resident rows (kept because shift columns are read by header-name later). |
| `this._resCols` | Resolved residents-column map (field name -> column index) built from the header row. |
| `this.filterJoined/Specialty/Shift`, `this._lrs` | Active filters and last resident-search term. |
| `this.filterDetached` | Controls whether `تم الانفكاك` residents are shown (default hidden). |
| `this.selectedResidents` | `Set` of selected resident names (for contact export). |
| `this.currentDisplayMonth`, `this.currentShiftsMonth` | Which month the on-call and shifts tabs are showing. |
| `this.myInfoOncallBreakdown`, `this.currentMyInfoOncallStats` | "My Info" monthly on-call counters state (total / done / remaining with type breakdown). |
| `this._id`, `this._dataReady` | Guards: image-download in progress, first data load complete. |

### Lifecycle

1. **`constructor` → `init()`** (358–371): injects nav + main HTML, sets header
   date/year, wires up tabs/searches/back-to-top and the floating support shortcut,
  starts the draggable header, then calls `loadData()` and schedules background
  `loadFresh(true)` refresh every 120 s.
  Auto refresh is network-first and non-disruptive: while the page is visible,
  it refreshes in the background every 120 s and also refreshes on tab resume,
    without forcing a full page reload. A separate lightweight update check polls
    `index.html` (`no-store`) for the deployed `app-build` id; when a newer build
    is detected, old `hc_v*` local caches are cleared and the page is reloaded to
    the latest bundle.
  Tab switches restore the chosen section and scroll the viewport back to the top.
2. **`loadData()`** (372–377): if cache exists, renders it immediately
  (`loadFromCache` → `applyCachedData`), waits until the header image is ready,
  hides the loading screen, and triggers `loadFresh()` in the background.
  If there is no valid cache, it waits for a foreground fetch and the same
  header-image readiness before hiding the loading screen.
3. **`loadFresh(silent)`**: fetches all seven Year-1 sheet tabs, the Year-2
   on-call tab from the second spreadsheet (`SID2`/`GID_O2`), and the on-call
   adjustments tab (`GID_ADJ`), in parallel via `Promise.all`, parses, resolves
   adjustments (`resolveOncallAdjustments()` — must run after residents + the
   Year-1 on-call log), renders, computes doctor statistics (see below), and
   writes the new snapshot to cache.
   `silent=true` skips the progress bar (used for background refreshes).

### Keeping data fresh (auto-refresh + manual refresh)

The Google Sheet and the app's own code both change often, and not everyone
remembers to reload the tab, so freshness is handled on several layers
without requiring the person to do anything:

- **Silent background data refresh**: `setInterval(..., 120000)` calls
  `loadFresh(true)` every 2 minutes while the tab is visible
  (`!document.hidden`); `silent=true` means no big progress bar, just a
  re-render once the fetch resolves.
- **Refresh on refocus**: a `visibilitychange` listener calls `loadFresh(true)`
  (and `checkForAppUpdate()`) the moment a backgrounded tab becomes visible
  again — covers the common case of a resident leaving the tab open for hours
  and switching back to it.
- **App-code update check**: a separate `setInterval(..., 90000)` calls
  `checkForAppUpdate()`, which fetches `index.html` fresh, compares its build
  id meta tag to the currently-running build, and if different, clears old
  caches and reloads to the new build — so a code deploy doesn't require
  anyone to manually hard-refresh either.
- **Visible "last updated" badge + manual refresh button**: `updateTime()`
  sets the `#lastUpdateTime` header badge's text every time data is
  (re)loaded, so staleness is visible at a glance. That badge is now also a
  button (`manualRefresh()` in `app.js`) — clicking it spins its icon,
  force-runs `loadFresh(true)`, and shows a success/failure toast, giving
  people an explicit "refresh now" action instead of only relying on the
  background timers.

### Data fetching & parsing

- **`fetchCSV(gid)`** (427): hits
  `https://docs.google.com/spreadsheets/d/{SID}/gviz/tq?tqx=out:csv&gid={gid}`,
  adds a cache-busting query parameter and requests with `fetch(..., { cache: 'no-store' })`,
  decodes UTF-8, rejects HTML error pages, parses with `parseCSV`.
- **`fetchJSON(gid)`** (428): hits the same endpoint with `out:json`, strips the
  gviz JS wrapper (`{...}` substring), also uses `no-store` + cache-busting,
  and flattens `table.cols`/`table.rows`
  into a `[headers, ...rows]` array of string arrays — the **same shape** CSV
  produces, so downstream renderers don't care which transport was used.
- **`parseCSV` / `parseCSVLine`** (429–430): a hand-written quote-aware CSV
  parser that also handles multi-line quoted fields and stops after 10
  consecutive blank rows.

### Caching

- **`loadFromCache`** / **`saveToCache`**: JSON blob in
  `localStorage` under `CK` (`hc_v63_<buildId>`) with a `timestamp`; entries older than
  `CD` (10 minutes) are treated as stale. Cache stores the **raw** resident/oncall
  data plus evaluation, links, Q&A, lectures, and on-call rules. Doctor statistics are
  **not** cached as raw data — they're recomputed from the cached residents +
  on-call data via `computeDoctorStats()` every time cached or fresh data is applied.
- On-call background refresh now preserves user reading context by re-rendering
  with the currently selected date instead of forcing a fallback to today's date.

### Rendering (one method per tab area)

| Method | Renders |
|---|---|
| `renderRes` / `displayResidents` | Roster table + mobile cards; `displayResidents` re-applies filters/search on every change. |
| `buildFilters` | Populates specialty + shift `<select>` dropdowns from the data. |
| `renderShiftsFromResidents` / `dispShiftsByMonth` | The "shifts" (فروز) tab — groups joined residents by their shift value for a chosen month (auto-prefers next month when data is already present); month chooser is rendered with dedicated wrapper styling in the tab header. |
| `parseLecturesData` / `renderLectures` | The lectures/activities calendar tab — parses header-driven lecture fields with flexible date parsing, builds today/upcoming/past groups, renders an interactive monthly calendar (lecture days highlighted), and applies search + department/year filters. |
| `renderEval` | Evaluation table + cards (columns 13/14 are praise/penalty badges). |
| `renderLinks` | Links table + cards; `formatLink` turns `http…` values into buttons. |
| `renderQA` | Groups Q&A by category into collapsible sections. |
| `renderMonthlyCalendar` | The on-call month calendar grid (week starts Monday; Fri/Sat marked as weekend). |
| `showOncallDate` | The per-day on-call breakdown card for a selected date. Year-aware: reads `this.oncallYearFilter` (`y1`/`y2`/`y1y2`) and renders Year-1 categories, Year-2 categories, or both as separate labeled sections via `buildOncallCategoriesForDate()` / `oncallCategoriesSectionHtml()`. |
| `searchMe` → `showMe` | The "my info" personal summary (the most complex renderer). |
| `renderMyInfoMonthCalendar` / `focusMyInfoOncallDate` / `toggleMyInfoMonthBreakdown` | "My Info" on-call UX: month calendar with inline on-call labels, click-to-scroll + highlight for matching cards, and a fixed monthly breakdown panel. |
| `toggleMyInfoDetail` / `getResidentShiftDaysDistribution` / `changeMyInfoMonth` | Legacy helper paths from the earlier interactive-counter layout; current "My Info" uses static top counters and a dropdown-based month switch for on-calls. |
| `updateMyInfoShift` | The shift sub-section inside "my info", switchable by month. |
| `computeDoctorStats` / `classifyOncallGroup` / `renderDoctorStats` / `doctorStatCardHtml` | Doctor statistics — computed (not sheet-read, see DATA-MODEL.md) from residents + the on-call log; renders one card per resident into a grid, reused inside "my info" for the resident's own stats. |

### Cross-referencing logic (the interesting part)

The app's value is in **joining** data across sheets by matching names/abbreviations:

- **`findRbyExact(abbr)`** (501): finds a resident by exact abbreviation, falling
  back to exact full-name match.
- **`showMe`** (513–521): scans every on-call row, finds the ones the selected
  resident appears in (via `exactNameMatch` against name *or* abbreviation),
  counts them by category, and lists colleagues on each shift (re-resolving each
  colleague back to a full resident record for their phone number).
- **`getEvalForResident`** (512): looks up a resident's evaluation row by fuzzy
  name/abbr match and returns a structured object with 8 labeled skills + totals.
- **Shift columns are dynamic**: `getShiftColIndex` / `getAllShiftMonths`
  (431–433) scan header cells for the pattern
  `فرز شهر <number>` to discover per-month shift columns, so new months can be
  added to the sheet without code changes.
- **Core residents fields are header-driven**: `buildResidentColumnMap` resolves
  fields by Arabic header names (name, abbreviation, specialty, phone, status,
  join date, cumulative on-calls) with legacy index fallback only as safety.
- **Month defaulting is data-aware**: `getPreferredShiftMonth` +
  `hasShiftDataForMonth` prefer `فرز شهر <next month>` if it already contains
  real values (not empty / not `غير محدد`), otherwise fall back to current month
  or latest available populated month.

### Export features

- **`exportToContacts`** (461): builds a vCard 3.0 string from selected
  residents and triggers a `contacts.vcf` download (Blob + temporary `<a>`).
- **`_captureImage`** (505) + `downloadOncallImage` / `downloadMyInfoImage`:
  use `html2canvas` to rasterize a DOM card to PNG, add padding, and download it.
  Uses DPR-aware scaling and an off-screen capture clone to keep the source render
  crisp, then caps the **final exported dimensions to ~2200px** on the longer side —
  deliberately smaller than the render itself, since WhatsApp/Telegram recompress
  images sent as a "photo" and do noticeably less damage to an already-reasonably-sized
  image than to an oversized one. There is a single quality tier now (the old separate
  "normal" vs "دقة فائقة" buttons were merged into one "تحميل ... كصورة" button).
  On-call export uses a compact capture mode that hides the download button and
  reflows category blocks for cleaner sharing-ready cards.

- **Doctor statistics** (see DATA-MODEL.md "Computed Doctor Statistics"): computed
  from residents + the on-call log rather than read from a sheet tab, and rendered
  as a card grid (`renderDoctorStats`, `doctorStatCardHtml`) reused inside "my info".
  `downloadDoctorStatsExcel()` exports the full computed table as a 17-column `.xlsx`
  via SheetJS (CDN-loaded in `index.html`).

- **On-call adjustments** (see DATA-MODEL.md "On-call Adjustments"): a manual
  correction/addition sheet (`GID_ADJ`) resolved once into `adjustmentOverrides`
  (per-person hour corrections) and `adjustmentAdditions` (volunteer shifts),
  consumed by `computeDoctorStats`, `showMe`, `showOncallDate`, and the main
  on-call calendar (a gold dot marks days with an addition). Not applied to the
  raw table, which mirrors `GID_O` literally.

- **On-call raw table on mobile**: "عرض كجدول" opens as a fixed near-fullscreen modal
  (`#oncallRawTableWrap` + `#oncallRawBackdrop`, toggled together by
  `toggleOncallRawTable()`) under `max-width:768px`, instead of an inline panel. Both
  frozen columns (day name + date) stay frozen, just shrunk (52px/66px) so more data
  columns are visible per horizontal scroll; the table area uses `flex:1; min-height:0`
  so it scrolls internally in both directions (the `min-height:0` matters — without it
  a flex child with `overflow:auto` won't actually become scrollable).

- **Header background strategy**: the header now uses an eager-loaded `<img>`
  layer inside `.header-bg-image` (instead of relying only on CSS background)
  so users see the hero image faster on first paint, especially on mobile.
- **On-call raw table usability**: raw-table mode now freezes the header row and
  first two columns to keep date/category context visible while scrolling.
- **Lectures calendar behavior**: until users click a different day, the selected
  date defaults to today's date when the current month is shown; changing the
  lectures month now moves selection into that month instead of snapping back to
  today's month. Only the selected day is filled, empty selected days still show
  the correct day/date heading with `لا يوجد.`, the standalone "today lectures"
  hero block is hidden, and the old lectures/workshops toggle remains at the end
  of the section.

---

## Pure helper functions (reusable, no side effects)

These near the top of the script are the safest things to read first:

| Function | Purpose |
|---|---|
| `normAr(t)` | Arabic normalization: lowercase, unify alef/hamza/ya/ta-marbuta forms, strip the "ال" prefix and diacritics, collapse whitespace. The backbone of search. |
| `smartSearch(text, query)` | Every normalized query word must appear in the normalized text (AND semantics). |
| `exactNameMatch(a, b)` | Strict equality after normalization (also ignoring dots/spaces). Used for cross-sheet joins. |
| `splitNames(t)` | Splits a multi-name cell on newlines and separators (`- – — , ، ; ؛ / \ |`). |
| `extractDate(t)` | Pulls a `YYYY-MM-DD` date out of messy strings (handles Arabic-Indic digits, day names, multiple formats). |
| `getDayName` / `getDayIndex` / `isWeekend` | Date → Arabic weekday / index / weekend (Fri=5, Sat=6). |
| `isJoined(s)` | True if a status string contains "التحق/ملتحق/التحاق" (= the resident has joined). |
| `mcn(name, phone, abbr)` | Builds the clickable-name HTML span that opens the phone tooltip. |

---

## Conventions & quirks

- **Header-name access for residents data.** Core resident fields are resolved
  from the header row by name via `buildResidentColumnMap`/`getResidentCell`.
  Monthly shifts remain header-pattern based (`فرز شهر <number>`).
- **Two render targets per list.** Tables (`.desktop-table`) and cards
  (`.mobile-cards`) are both built; CSS shows one based on viewport width.
- **Arabic month/day arrays.** `AM` (months, Levantine names like كانون الثاني)
  and `DAY_NAMES` (Sunday-first) are referenced throughout.
- **Short, terse identifiers.** Much of the code uses 1–3 char names (`d`, `r`,
  `h`, `tb`, `cd`, `mcn`). This is deliberate minification, not a style to
  emulate when adding readable new code.
- **HTML built as strings** and assigned via `innerHTML`. Values from the sheet
  are interpolated directly; quotes in names are escaped ad hoc in a few places
  (`replace(/'/g,"\\'")`). Be careful with untrusted input (see AGENTS.md).
