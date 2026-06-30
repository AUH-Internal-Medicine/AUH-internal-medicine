# AGENTS.md — Guide for AI Assistants

This file follows the cross-tool [`AGENTS.md`](https://agents.md) convention and
is meant to be read by **any** AI coding assistant (Claude, GPT, Gemini, Llama,
Cursor, Copilot, etc.), not one specific product. If you are an AI model asked to
work on this repo, read this first, then [README.md](README.md),
[ARCHITECTURE.md](ARCHITECTURE.md), and [DATA-MODEL.md](DATA-MODEL.md).

---

## ⚠️ Start-of-session and end-of-session protocol (do this every time)

1. **At the start of a session:** read [CHANGELOG.md](CHANGELOG.md) to see what
   previous sessions/models did, then this file and the other docs.
2. **At the end of any change** (code *or* docs), you **must**:
   - Append an entry to [CHANGELOG.md](CHANGELOG.md) using the template there
     (newest first, real date, who you are, what changed, whether docs were synced).
   - If you changed behavior, a column contract, a tab, or the cache key, **update
     the affected `.md` file(s)** so the docs never drift from the code.

This logging discipline is the single most important rule in this repo: it is how
future models (of any vendor) stay oriented across sessions. See
[Documentation logging protocol](#documentation-logging-protocol) below for details.

---

## TL;DR for a model with zero context

- This repo is a thin HTML shell (`index.html`) plus `styles.css`,
  `helpers.js`, `app.js`, and two background images. No framework, no build,
  no package manager, no tests, no backend.
- It renders an **Arabic, right-to-left** dashboard of internal-medicine
  residents at Aleppo University Hospital.
- All data is read **live, client-side, from a public Google Sheet** via the
  gviz API. The app never writes data. To change *content*, you change the
  *sheet*, not the code.
- The CSS and JS are **minified onto long lines** on purpose. Editing requires
  care because a single line can be hundreds of characters.

---

## How to run / verify a change

There is nothing to compile. To check your work:

```bash
# Serve statically and open in a browser:
python3 -m http.server 8000   # visit http://localhost:8000
```

Then verify in the browser:
1. The loading screen disappears and the roster (لائحة المقيمين) populates.
2. Switch tabs across the top nav; each renders without console errors.
3. Toggle dark mode (moon icon, top-left in RTL).
4. Open DevTools console — there should be no thrown exceptions.

Because data comes from a live external sheet, "it loads real data" depends on
network + sheet permissions, not on your code changes alone.

---

## Editing safely — read before you touch code

1. **Lines are long and minified.** Use targeted, exact string replacements.
   Match a unique surrounding substring rather than retyping a whole line. Do
   not attempt to "reformat" or prettify the whole file unless explicitly asked —
   it will produce an enormous, unreviewable diff.

2. **Column indices are a contract with the Google Sheet.** Code reads fields by
   fixed position (`r[1]` = name, `r[4]` = phone, `r[11]` = status, etc.). See
   [DATA-MODEL.md](DATA-MODEL.md). Do not change these unless the sheet's columns
   actually changed.

3. **Everything is Arabic and RTL.** Keep new user-facing strings in Arabic and
   consistent with existing tone. Preserve `dir="rtl"`. Be mindful that "left"
   and "right" in CSS are visually swapped.

4. **`window.app` global + inline handlers.** Rendered HTML uses
   `onclick="app.method(...)"`. If you rename a method on `HospitalApp`, update
   every inline handler string that calls it.

5. **HTML is built by string concatenation and injected with `innerHTML`.**
   - Values from the sheet are interpolated directly into markup. This is an
     **XSS surface**: the sheet is the trust boundary. If you add new fields,
     consider escaping. Don't introduce `innerHTML` sinks for genuinely
     untrusted input without escaping.
   - Single quotes inside names are escaped ad hoc (`replace(/'/g,"\\'")`) when
     passed into inline handlers. Follow that pattern if you add similar code.

6. **No dependencies to add casually.** New third-party code would mean another
   CDN `<script>`/`<link>`. Prefer vanilla JS. Existing CDN deps: Font Awesome
   (icons), Tajawal (font), `html2canvas` (image export).

7. **Cache versioning.** If you make a change that would make old cached data
   incompatible, bump the cache key `CK` (`hc_v62` → `hc_v63`) so returning
   visitors don't render stale/broken cached data.

---

## Where things live (quick index)

| You want to… | Look at (in `index.html`) |
|---|---|
| Change colors/theme | CSS `:root` variables (line 2) and `body.dark-mode` (line 3). |
| Add/rename a tab | `TABS` array (line 337) + `buildMainContent()` (339) + the `setupTabs` render hooks (389–402). |
| Change how residents are parsed | `renderRes` (462) and the column indices in [DATA-MODEL.md](DATA-MODEL.md). |
| Change search behavior | `normAr` / `smartSearch` / `exactNameMatch` (321–325). |
| Change the on-call calendar | `renderMonthlyCalendar` (508) / `showOncallDate` (504). |
| Change the personal "my info" view | `searchMe` (510) → `showMe` (513) → `updateMyInfoShift` (522). |
| Change data source / sheet | Constants `SID`, `GID_*` (332–333). |
| Change cache TTL / refresh interval | `CD` (336) and the `setInterval` in `init` (370). |
| Change image/contact export | `_captureImage` (505), `exportToContacts` (461). |

(Line numbers are approximate and will drift as the file is edited — search by
the identifier names, which are stable.)

---

## What NOT to do

- ❌ Don't add a build system, bundler, or framework. The static, no-build
  nature is a deliberate constraint (easy hosting, easy hand-editing).
- ❌ Don't move data into the repo or hardcode resident data — it belongs in the
  Google Sheet so non-developers can maintain it.
- ❌ Don't reorder or "clean up" Google Sheet columns to match prettier code;
  the sheet is maintained by other people and the indices are load-bearing.
- ❌ Don't commit secrets — there are none here, and none are needed (the sheet
  is public-read).
- ❌ Don't reflow/minify-or-unminify the entire file as a side effect of a small
  change.

---

## Documentation logging protocol

The docs in this repo are only useful to future models if they stay **accurate**
and **current**. Enforce that with this protocol on every session:

### The doc set and what each owns
| File | Owns (keep it accurate when you touch the matching thing) |
|---|---|
| [README.md](README.md) | What the app is, the tab list, features, run instructions. Update if you add/remove a feature or tab. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Code structure: the `HospitalApp` methods, helpers, lifecycle. Update if you add/rename/remove methods or change the data flow. |
| [DATA-MODEL.md](DATA-MODEL.md) | The Google Sheet contract: sheet id, GIDs, column indices, cache key/TTL. Update if any of these change. |
| [AGENTS.md](AGENTS.md) | This guide. Update if you change a convention or add a constraint future models must follow. |
| [CHANGELOG.md](CHANGELOG.md) | The append-only history. **Always** add an entry. |

### Required steps for any change
1. Make the code/doc change.
2. **Sync the owning doc(s)** from the table above so they match reality.
3. **Append a CHANGELOG.md entry** (newest first) using the template in that
   file. State the real date, who you are (model/tool name), what changed, the
   files touched, and **"Docs synced: yes/no"** with the list of `.md` files you
   updated.
4. If you bumped the cache key (`CK`), said the column contract changed, or
   renamed inline-handler methods, call that out explicitly in the entry — those
   have downstream impact.

### Style for changelog/doc entries (so any model can parse them)
- Plain Markdown, short factual sentences, no tool-specific jargon.
- Newest entry on top; never edit or delete past entries — append a correction
  entry instead.
- Prefer stable identifier names over line numbers when referencing code (line
  numbers drift).
- Write dates as `YYYY-MM-DD`.

### Self-check before you finish
- [ ] Did behavior or the data contract change? → owning `.md` updated.
- [ ] CHANGELOG.md entry appended with date, author, and "Docs synced" line.
- [ ] No past changelog entries were modified or removed.
- [ ] Line numbers I added are marked approximate (or I used identifier names).

---

## Good first tasks (examples)

- Add a new column to the roster display (after confirming the sheet column
  index in [DATA-MODEL.md](DATA-MODEL.md)).
- Add a new tab following the `TABS` → `buildMainContent` → render-hook pattern.
- Improve accessibility (ARIA labels, focus states) without changing behavior.
- Add escaping to the `innerHTML` interpolation points to harden against XSS.

When in doubt about data shape, re-read [DATA-MODEL.md](DATA-MODEL.md); when in
doubt about code structure, re-read [ARCHITECTURE.md](ARCHITECTURE.md).
