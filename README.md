# AUH Internal Medicine — Residents Dashboard

A single-page web app (one `index.html` file) that displays information about
**first-year Internal Medicine residents at Aleppo University Hospital**
(مشفى حلب الجامعي / قسم الداخلية - السنة الأولى).

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

The app presents resident data across **7 tabs** (Arabic label → meaning):

| Tab id | Arabic label | Purpose |
|---|---|---|
| `residents` | لائحة المقيمين | Full roster: name, specialty, phone, status, shift. Search, filter, multi-select, export to phone contacts (vCard). |
| `shifts` | الفروز | Monthly "shift assignment" (فرز) groups — which residents are assigned where, per month. |
| `oncall` | المناوبات | On-call schedule. Monthly calendar + per-day breakdown by category. Exportable as an image. |
| `evaluation` | التقييم السنوي | Annual evaluation scores per resident across 8 skill areas, plus praises (ثناءات) and penalties (عقوبات). |
| `links` | روابط هامة | Important links / channels (e.g. group chats, resources). |
| `myinfo` | معلوماتي | "My info" — search yourself by name/abbreviation and see a personal summary: cumulative on-calls, evaluation, shift, and a list of every on-call you appear in with your colleagues. Exportable as an image. |
| `qa` | Q&A (الأسئلة والأجوبة) | Categorized, collapsible frequently-asked questions. |

### Notable features
- **Live Google Sheets data** via the gviz endpoint (CSV + JSON), refreshed every 2 minutes.
- **Offline-ish caching** in `localStorage` (2-minute TTL) so the page renders instantly from cache, then refreshes in the background.
- **Dark mode** toggle (persisted in `localStorage`).
- **Arabic-aware search** with normalization (handles أ/إ/آ/ا, ة/ه, ى/ي, the "ال" prefix, diacritics, etc.).
- **Export to contacts**: select residents → download a `.vcf` (vCard) file.
- **Export to image**: render the on-call card or "my info" card to a PNG using `html2canvas`.
- **Click-to-copy phone numbers** via tooltips.
- **Responsive**: desktop tables collapse into mobile cards under 768px.

---

## Quick start

There is **no build step and no dependencies to install.** Everything is in one file.

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
| `index.html` | The entire application (HTML + CSS + JS, minified inline). |
| `bg.webp` / `bg.png` | Header background image (the `.webp` is used; `.png` is a fallback/source). |
| `README.md`, `ARCHITECTURE.md`, `DATA-MODEL.md`, `AGENTS.md` | Documentation (this set). |

---

## How the data flows (one paragraph)

On load, `HospitalApp` reads any cached snapshot from `localStorage` (key
`hc_v62`) and renders it immediately, then fetches fresh data from the Google
Sheet in the background. Five sheet tabs are fetched in parallel by their
**GID** (numeric tab id): residents, on-call, evaluation, links, and Q&A. CSV
tabs are parsed by a hand-written CSV parser; JSON tabs use the gviz JSON
response. The parsed rows are stored on the app instance and rendered into the
relevant tab. A `setInterval` re-fetches every 120 seconds. See
[DATA-MODEL.md](DATA-MODEL.md) for the exact sheet/column layout and
[ARCHITECTURE.md](ARCHITECTURE.md) for the code structure.

---

## Editing the content vs. editing the code

- **To change displayed data** (residents, schedules, evaluations, links, Q&A):
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
- Column **positions matter**. The code reads many fields by fixed index
  (e.g. resident name is column index 1, phone is 4, status is 11). Inserting
  or reordering columns in the sheet will silently break rendering. See
  [DATA-MODEL.md](DATA-MODEL.md).
- The cache key is **versioned** (`hc_v62`). Bumping it (e.g. `hc_v63`)
  invalidates everyone's cached data — useful after a breaking data change.
- All user-facing strings are Arabic. Keep RTL and Arabic copy consistent when
  editing.
