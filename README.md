# AUH Internal Medicine — Residents Dashboard

A single-page web app with a thin `index.html` shell plus separate `styles.css`,
`helpers.js`, and `app.js` files. It displays information about **first-year
Internal Medicine residents at Aleppo University Hospital** (مشفى حلب الجامعي /
قسم الداخلية - السنة الأولى).

The UI is **Arabic and right-to-left (RTL)**. All data is read **live from a
public Google Sheet** — there is no backend server and no database. The page is
pure static HTML/CSS/JavaScript and can be hosted on any static host (GitHub
Pages, Netlify, Cloudflare Pages, a plain file server, etc.).

> **Audience note:** This README and the companion docs ([ARCHITECTURE.md](ARCHITECTURE.md),
> [DATA-MODEL.md](DATA-MODEL.md), [AGENTS.md](AGENTS.md)) are written to be read by
> **any AI model or assistant**, not just one specific tool. They describe the
> project from scratch so a model with no prior context can understand and safely
> modify it.

---

## What it does

The app presents resident data across **11 primary tabs** (Arabic label → meaning):

| Tab id | Arabic label | Purpose |
|---|---|---|
| `residents` | لائحة المقيمين | Full roster: name, specialty, phone, status, shift. Search, filter, multi-select, export to phone contacts (vCard). |
| `lectures` | رزنامة المحاضرات | Medical lectures/activities calendar with smart search, category/department/year filters, today highlights, upcoming list, optional old-events view, and optional registration/announcement links. |
| `shifts` | الفروز | Monthly "shift assignment" (فرز) groups — which residents are assigned where, per month. |
| `oncall` | المناوبات | On-call schedule. Monthly calendar + per-day breakdown by category. Exportable as an image. |
| `exams` | الامتحانات والاختبارات | Placeholder page for upcoming exams/tests features (work in progress). |
| `clinicalcases` | مشروع الحالات السريرية | Placeholder page for clinical-cases project features (work in progress). |
| `doctorstats` | احصائيات الأطباء | Doctor analytics **computed by the app** (not read from a sheet tab): days since join, cumulative vs. completed on-calls, ward/ICU/emergency/misc breakdown, holiday/night counts, and total hours — shown as cards with smart search and sorting by hours. |
| `evaluation` | التقييم السنوي | Annual evaluation scores per resident across 8 skill areas, plus praises (ثناءات) and penalties (عقوبات). |
| `links` | روابط هامة | Important links / channels (e.g. group chats, resources). |
| `myinfo` | معلوماتي | "My info" — search yourself by name/abbreviation and see a personal summary card with an identity header (name, abbreviation, sequence number), static cumulative/join-day counters, cumulative on-call distribution, extra resident info, evaluation, shift data, and a month-selectable on-call calendar. On-call days jump to their cards, past days/cards are visually marked as completed, and holiday shifts are distinguished without recoloring the whole card. Exportable as an image. |
| `qa` | Q&A (الأسئلة والأجوبة) | Categorized, collapsible frequently-asked questions. |

A separate floating **الشكاوي** support shortcut (outside the primary tab row)
opens the technical-contact view when needed.

### Notable features
- **Live Google Sheets data** via the gviz endpoint (CSV + JSON), refreshed every 2 minutes.
- **Offline-ish caching** in `localStorage` (10-minute TTL) so the page renders instantly from cache, then refreshes in the background.
- **Strong non-disruptive refresh**: background updates fetch from network with `no-store` + cache-busting, while preserving user context (especially selected on-call date) to avoid jumping to today.
- **Deployment cache busting**: each GitHub Pages deploy now injects a unique build id into `index.html`, appends it to local asset URLs (`styles.css`, `helpers.js`, `app.js`, images), and exposes it via `<meta name="app-build">`.
- **Automatic client update**: running clients periodically fetch the latest `index.html` with `no-store`; when a newer build id is detected, stale local app caches are cleared and the page reloads to the latest version.
- **Doctor statistics tab** computed directly by the app from the residents roster + the on-call log (no separate hand-maintained sheet tab), shown as cards with group breakdowns, holiday/night counts, and total hours.
- **On-call timing rules** sourced from a dedicated sheet tab to show duty times/durations and holiday-aware highlights (Fri/Sat + annual holidays from sheet).
- **My Info on-call UX upgrade**: the personal card now uses a cleaner identity header, static cumulative/join-day cards, an always-visible cumulative distribution panel, a month dropdown for on-calls, cleaner month statistics, and a denser month calendar with on-call labels inside each active day.
- **My Info completed/holiday styling**: finished on-calls are highlighted in green with a clear `تم` badge, while holiday on-calls keep the normal card color and only use a red dot / `عطلة` badge.
- **On-call raw table freeze polish**: sticky header row and first two sticky columns were refined to avoid spacing artifacts while scrolling.
- **Lectures calendar polish**: month navigation now uses dedicated arrow buttons, the month title is shown as `الشهر X`, only the currently selected day is filled, and clicking an empty day keeps that day selected while showing `لا يوجد.` under the correct day/date heading.
- **Dark mode** toggle (persisted in `localStorage`).
- **Arabic-aware search** with normalization (handles أ/إ/آ/ا, ة/ه, ى/ي, the "ال" prefix, diacritics, etc.).
- **Export to contacts**: select residents → download a `.vcf` (vCard) file.
- **Detached-status handling**: residents with status `تم الانفكاك` are hidden from the roster by default, excluded from contact export, and can be shown using a small side filter button.
- **Export to image**: render the on-call card or "my info" card to a PNG using `html2canvas`; on-call export now uses a cleaner compact capture layout with two download options (normal and high quality) so users can choose sharper output when needed.
- **Shift month auto-preference**: if next month's shift column already has real values, the shifts views default to it immediately (instead of waiting for calendar month rollover).
- **Shift month control polish**: month selector in the shifts tab now has clearer modern styling and better spacing.
- **Faster first header paint**: header background image is now eagerly loaded to reduce partial/flicker appearance on mobile.
- **Click-to-copy phone numbers** via tooltips.
- **Responsive**: desktop tables collapse into mobile cards under 768px.
- **Lectures calendar UX**: large "today" highlight cards for sessions not yet finished, separate upcoming sessions list, and a toggle to reveal past sessions.
- **Interactive lectures month calendar**: month grid now highlights days with lectures in green (with counts) and shows that day's lectures when clicked.
- **Flexible lectures date parsing**: lecture dates now accept multiple input styles (including `YYYY-MM-DD`, `DD/MM/YYYY`, `MM/DD/YYYY`, Arabic/English month names, and `Date(y,m,d)` gviz-style values).

---

## Quick start

There is **no build step and no dependencies to install.** The app still runs
as plain static files.

```bash
# Just open it, or serve it statically:
open index.html
# or
python3 -m http.server 8000   # then visit http://localhost:8000
```

Third-party libraries (Font Awesome icons, the Tajawal Arabic font, and
`html2canvas`) are loaded from CDNs at runtime, so an internet connection is
required for the full experience — and is required regardless, since the data
itself comes from Google Sheets.

### Files in the repo
| File | Role |
|---|---|
| `index.html` | Thin HTML shell that loads the app assets and bootstraps the page. |
| `styles.css` | All app styling, extracted from the old inline `<style>` block. |
| `helpers.js` | Shared globals, helper functions, constants, and tab HTML builders. |
| `app.js` | The `HospitalApp` class and bootstrap, extracted from the old inline `<script>` block. |
| `.github/workflows/pages.yml` | GitHub Pages deployment workflow (build + deploy jobs) for the `pages build and deployment` checks. |
| `bg.webp` / `bg.png` | Header background image (the `.webp` is used; `.png` is a fallback/source). |
| `README.md`, `ARCHITECTURE.md`, `DATA-MODEL.md`, `AGENTS.md` | Documentation (this set). |

### GitHub Pages deployment mode

- This repo uses **GitHub Actions** deployment for Pages via [`.github/workflows/pages.yml`](.github/workflows/pages.yml).
- In repository settings, set **Pages > Source** to **GitHub Actions**.
- If source is set to branch mode while relying on Actions checks, deployment checks can fail quickly.
- The workflow publishes a clean `_site` artifact (not the whole repo root), containing only runtime site files, and injects a per-deploy build id into `index.html` for cache-safe asset URLs.
- The deploy job retries up to 3 times to handle transient Pages backend errors like `Deployment failed, try again later`.

---

## How the data flows (one paragraph)

On load, `HospitalApp` reads any cached snapshot from `localStorage` (key
`hc_v63`) and renders it immediately, then fetches fresh data from the Google
Sheet in the background. Seven sheet tabs are fetched in parallel by their
**GID** (numeric tab id): residents, on-call, evaluation, links, Q&A,
lectures calendar, and on-call rules (used only for annual holiday dates now — see
[DATA-MODEL.md](DATA-MODEL.md)). Doctor statistics are **computed by the app**
from the residents + on-call data, not read from a sheet tab. CSV
tabs are parsed by a hand-written CSV parser; JSON tabs use the gviz JSON
response. The parsed rows are stored on the app instance and rendered into the
relevant tab. A `setInterval` re-fetches every 120 seconds (network-first),
and refresh on tab resume uses the same non-disruptive path without forcing a
full page reload. See
[DATA-MODEL.md](DATA-MODEL.md) for the exact sheet/column layout and
[ARCHITECTURE.md](ARCHITECTURE.md) for the code structure.

---

## Editing the content vs. editing the code

- **To change displayed data** (residents, schedules, lectures, evaluations, links, Q&A):
  edit the **Google Sheet** — not this repo. The sheet id and tab GIDs are in
  [DATA-MODEL.md](DATA-MODEL.md). The site picks up changes within ~2 minutes
  (or immediately on a hard refresh that bypasses cache).
- **To change layout, styling, or behavior:** edit `index.html`. Be aware the
  CSS and JS are intentionally minified/condensed onto long lines. See the
  [AGENTS.md](AGENTS.md) "editing safely" section before making changes.

---

## Important constraints / gotchas

- The Google Sheet **must be publicly readable** ("anyone with the link can
  view") for the gviz endpoints to work from the browser. If data stops
  loading, sharing permissions are the first thing to check.
- For the residents sheet, core fields are now matched by **header name** (e.g.
  `الاسم الثلاثي`, `الاختصار`, `الاختصاص`, `رقم الهاتف`, `الحالة`,
  `تاريخ الالتحاق`, `المناوبات+`) instead of hard-coded column positions.
  Monthly shift columns are discovered by headers matching `فرز شهر <number>`.
  See [DATA-MODEL.md](DATA-MODEL.md).
- The cache key is **versioned** (`hc_v63`). Bumping it (e.g. `hc_v64`)
  invalidates everyone's cached data — useful after a breaking data change.
- All user-facing strings are Arabic. Keep RTL and Arabic copy consistent when
  editing.
