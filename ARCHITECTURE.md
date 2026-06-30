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
| `helpers.js` builder section | `buildNav()` and `buildMainContent()` — return HTML strings for the nav buttons and all 7 tab sections. |
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
| `this.filterJoined/Specialty/Shift`, `this._lrs` | Active filters and last resident-search term. |
| `this.selectedResidents` | `Set` of selected resident names (for contact export). |
| `this.currentDisplayMonth`, `this.currentShiftsMonth` | Which month the on-call and shifts tabs are showing. |
| `this._id`, `this._dataReady` | Guards: image-download in progress, first data load complete. |

### Lifecycle

1. **`constructor` → `init()`** (358–371): injects nav + main HTML, sets header
   date/year, wires up tabs/searches/back-to-top, starts the draggable header,
   then calls `loadData()` and schedules `loadData()` every 120 s.
2. **`loadData()`** (372–377): if cache exists, renders it immediately
  (`loadFromCache` → `applyCachedData`), hides the loading screen, and triggers
  `loadFresh()` in the background. If there is no valid cache, it waits for a
  foreground fetch before hiding the loading screen.
3. **`loadFresh(silent)`** (412–426): fetches all five sheet tabs in parallel
   via `Promise.all`, parses, renders, and writes the new snapshot to cache.
   `silent=true` skips the progress bar (used for background refreshes).

### Data fetching & parsing

- **`fetchCSV(gid)`** (427): hits
  `https://docs.google.com/spreadsheets/d/{SID}/gviz/tq?tqx=out:csv&gid={gid}`,
  decodes UTF-8, rejects HTML error pages, parses with `parseCSV`.
- **`fetchJSON(gid)`** (428): hits the same endpoint with `out:json`, strips the
  gviz JS wrapper (`{...}` substring), and flattens `table.cols`/`table.rows`
  into a `[headers, ...rows]` array of string arrays — the **same shape** CSV
  produces, so downstream renderers don't care which transport was used.
- **`parseCSV` / `parseCSVLine`** (429–430): a hand-written quote-aware CSV
  parser that also handles multi-line quoted fields and stops after 10
  consecutive blank rows.

### Caching

- **`loadFromCache`** (410) / **`saveToCache`** (411): JSON blob in
  `localStorage` under `CK` (`hc_v62`) with a `timestamp`; entries older than
  `CD` (10 minutes) are treated as stale. Cache stores the **raw** resident/oncall
  data plus the eval/links/qa arrays.

### Rendering (one method per tab area)

| Method | Renders |
|---|---|
| `renderRes` / `displayResidents` | Roster table + mobile cards; `displayResidents` re-applies filters/search on every change. |
| `buildFilters` | Populates specialty + shift `<select>` dropdowns from the data. |
| `renderShiftsFromResidents` / `dispShiftsByMonth` | The "shifts" (فروز) tab — groups joined residents by their shift value for a chosen month (auto-prefers next month when data is already present); month chooser is rendered with dedicated wrapper styling in the tab header. |
| `renderEval` | Evaluation table + cards (columns 13/14 are praise/penalty badges). |
| `renderLinks` | Links table + cards; `formatLink` turns `http…` values into buttons. |
| `renderQA` | Groups Q&A by category into collapsible sections. |
| `renderMonthlyCalendar` | The on-call month calendar grid (week starts Monday; Fri/Sat marked as weekend). |
| `showOncallDate` | The per-day on-call breakdown card for a selected date. |
| `searchMe` → `showMe` | The "my info" personal summary (the most complex renderer). |
| `updateMyInfoShift` | The shift sub-section inside "my info", switchable by month. |

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
  (431–433) scan header cells from column 12 onward for the pattern
  `فرز شهر <number>` to discover per-month shift columns, so new months can be
  added to the sheet without code changes.
- **Month defaulting is data-aware**: `getPreferredShiftMonth` +
  `hasShiftDataForMonth` prefer `فرز شهر <next month>` if it already contains
  real values (not empty / not `غير محدد`), otherwise fall back to current month
  or latest available populated month.

### Export features

- **`exportToContacts`** (461): builds a vCard 3.0 string from selected
  residents and triggers a `contacts.vcf` download (Blob + temporary `<a>`).
- **`_captureImage`** (505) + `downloadOncallImage` / `downloadMyInfoImage`:
  use `html2canvas` to rasterize a DOM card to PNG, add padding, and download it.
  Uses DPR-aware scaling, an off-screen capture clone, and per-view width caps
  before export to keep output crisp while reducing oversized image dimensions.
  On-call export uses a compact capture mode that hides the download button and
  reflows category blocks for cleaner sharing-ready cards. The on-call card now
  exposes normal vs high-quality download actions that route to different export
  scaling/cap settings.

- **Header background strategy**: the header now uses an eager-loaded `<img>`
  layer inside `.header-bg-image` (instead of relying only on CSS background)
  so users see the hero image faster on first paint, especially on mobile.

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

- **Index-based column access.** Renderers read raw rows like `r[1]`, `r[4]`,
  `r[11]`. These indices are a hard contract with the sheet layout
  ([DATA-MODEL.md](DATA-MODEL.md)). Changing the sheet's column order breaks the app.
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
