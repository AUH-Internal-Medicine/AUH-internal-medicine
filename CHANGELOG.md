# Changelog

A running log of meaningful changes to this project — **maintained by every AI
model (and human) that edits the repo.** Read this file at the start of a session
to understand what happened before you, and append to it when you finish.

> **Why this exists:** there is no backend, no issue tracker, and the code is
> minified, so git diffs alone are hard to read. This log is the human/AI-readable
> memory of the project across sessions and across different AI models.

## How to log a change (read this before editing)

When you make a change to **either the code (`index.html`) or any `.md` doc**:

1. Add a new entry to the top of the [Entries](#entries) section (newest first).
2. Use this exact template:

   ```
   ## YYYY-MM-DD — <short title>
   - **Who:** <model/tool name, e.g. "Claude Opus 4.8" or "GPT-5" or a human name>
   - **Type:** code | docs | data-contract | both
   - **What:** 1–3 sentences on what changed and why.
   - **Files:** index.html, README.md, ...
   - **Docs synced:** yes/no — if you changed behavior or the sheet contract,
     which .md files you updated to match (README/ARCHITECTURE/DATA-MODEL/AGENTS).
   - **Notes / follow-ups:** anything the next model should know (gotchas, TODOs,
     things you did NOT do).
   ```

3. Use the **real calendar date** (today's date in the session). Do not guess —
   if unsure, state the date you believe it is and say so in Notes.
4. Keep entries short and factual. The git history has the line-level detail;
   this log captures the *intent* and the *cross-file impact*.

### Rules
- **Every behavior change must say whether the docs were synced.** If you changed
  how data is parsed, a column index, a tab, or the cache key, you MUST update the
  relevant `.md` file(s) and record "Docs synced: yes" with the file list.
- **Doc-only edits get logged too** (Type: docs) so future models can trust that
  the docs reflect the latest decisions.
- Never delete or rewrite past entries — only append. Correct mistakes with a new
  entry that references the old one.
- If you bump the cache key (`CK`, e.g. `hc_v62` → `hc_v63`), say so explicitly —
  it invalidates every visitor's cache.

---

## Entries

## 2026-07-30 — Full visual redesign (new medical color identity) + on-call raw table as a mobile modal
- **Who:** Claude Sonnet 5 (claude.ai)
- **Type:** code
- **What:** Complete visual identity redesign per the resident's request for something new that reads as internal medicine / doctors, replacing the earlier blue-teal unification entirely:
  - New `:root` palette: `--primary` deep clinical navy `#1b3a5c`, `--secondary` sage/scrub green `#2f7d5c`, `--accent`/`--success` aligned sage-greens, `--danger`/`--weekend-color` warm clinical red `#c0392b`, `--warning` warm amber `#d98c3d`, header gradient navy → sage → warm gold (`#1b3a5c → #2f7d5c → #d4a24c`). Dark mode got matching brighter navy/sage/gold variants for contrast on dark backgrounds.
  - Every hardcoded occurrence of the old blue/teal/gold/purple-remnant hexes (and their `rgba()` equivalents) across `styles.css` and the two leftover text-color spots in `app.js` was swept to the new palette — buttons, calendar "today"/hover, collapsible headers, badges, nav-btn active state, contacts/links buttons, support-shortcut button, on-call raw-table header, and the ambient decorative background (`.animated-bg`/`.bg-orb-*`, previously a generic lavender/pink/mint wash with a bright pink orb) which is now a soft navy/sage/cream wash.
  - The My Info calendar's category dot-indicator palette (`app.js`) was also updated to sage/navy/gold/terracotta tones instead of indigo/pink.
  - Loading screen: recolored to navy→sage gradient + warm-gold ring/progress bar, and the icon was changed from a generic heart-pulse to a stethoscope (`fa-stethoscope`), more specifically evocative of doctors/internal medicine.
  - Left untouched intentionally: neutral grays/text colors, and the many small semantic status colors (status badges like "not joined"/"detached", praise/penalty boxes, has-lecture/has-oncall tinting) — these encode meaning distinct from brand identity and weren't part of what was asked to be re-themed.
  - On-call "عرض كجدول" (raw table) UX on mobile: replaced the previous "unstick one column" workaround with a proper modal. A backdrop element (`#oncallRawBackdrop`) was added in `helpers.js`'s on-call tab markup; `toggleOncallRawTable()` now also toggles the backdrop and a `body.oncall-raw-modal-open` class (which disables background scroll on mobile); `renderOncallRawTable()` now prepends a small header bar with a title and a close (×) button. Under `max-width:768px`, the table wrap becomes a fixed, near-fullscreen rounded panel over a dimmed backdrop; both frozen columns (day name + date) stay frozen as requested, just shrunk to 52px/66px so more data columns are visible per horizontal scroll, and the panel itself scrolls both directions. Desktop behavior (inline panel, larger frozen columns) is unchanged.
- **Files:** styles.css, app.js, helpers.js, index.html, CHANGELOG.md
- **Docs synced:** no — visual/UX only, no data-contract or documented-feature change.
- **Notes / follow-ups:** If any specific element still looks off-brand (e.g. a status badge color), it was left as-is deliberately for semantic clarity — flag it and it can be re-themed individually. The raw-table modal reuses the existing `#oncallRawTableWrap` element (styled as a modal via CSS only on narrow screens), so no duplicate rendering logic was introduced.

## 2026-07-30 — Unify site colors around a medical blue/teal identity
- **Who:** Claude Sonnet 5 (claude.ai)
- **Type:** code
- **What:** The site had two competing "brand" colors: the official `:root` primary/secondary (medical blue `#0f6ecf` / teal `#0f766e`, already used in the header gradient) vs. a generic indigo-purple (`#667eea`/`#764ba2`, plus a related `#4f46e5`/`#7c3aed`) hardcoded 90+ times across buttons, calendar highlights, hover states, collapsible headers, badges, and the loading screen — nothing to do with medicine and visually inconsistent with the header. Replaced every purple/indigo occurrence with the existing blue/teal identity: `#667eea`→`#0f6ecf`, `#764ba2`→`#0f766e`, `#4f46e5`→`#0f6ecf` (plus their `rgba()` equivalents), including the one instance URL-encoded inside an inline SVG dropdown-arrow icon, and the two matching text-color usages in `app.js`. Also updated the loading-screen background gradient (added in an earlier session) from indigo/violet/teal to blue/teal/deep-teal to match.
- **Files:** styles.css, app.js, CHANGELOG.md
- **Docs synced:** no — visual-only, no behavior/data-contract change.
- **Notes / follow-ups:** The whole site's interactive color (buttons, "today" highlights, hover states, badges, collapsible headers, loading screen) is now a single blue→teal gradient (`#0f6ecf → #0f766e`), matching the header and the official `:root` `--primary`/`--secondary` variables — chosen deliberately as calm, clinical, trustworthy colors associated with internal medicine, distinct from the generic "web app purple" that was there before. Green (`--accent #10b981`, plus `#22c55e`/`#16a34a` used for on-call/has-data highlighting) and red (`--danger #e74c3c`, weekend/holiday marking) were left untouched since they carry semantic meaning (success/positive vs. warning/holiday) rather than being decorative. As a possible future refinement, the hardcoded `#0f6ecf`/`#0f766e` literals introduced by this change could be swapped for `var(--primary)`/`var(--secondary)` so the whole palette derives from one place — not done in this pass to keep the diff safe and reviewable.

## 2026-07-30 — Correct: two fixed on-call schedules (old/new), not one; fix mobile raw-table freeze
- **Who:** Claude Sonnet 5 (claude.ai)
- **Type:** both
- **What:** Corrected the previous change: on-call duty was genuinely partial (جزئي) before 2026-07-23 and became full (كاملة) on/after that date, with two different real time/duration sets — not just one fixed schedule. Replaced the single `ONCALL_SCHEDULE` constant with `ONCALL_SCHEDULE_OLD`, `ONCALL_SCHEDULE_NEW`, and a fixed `ONCALL_SCHEDULE_SWITCH_DATE = '2026-07-23'` in `helpers.js` (values taken from the sheet's rows 2–5 and 7–10 before removing sheet-reading). `getCategorySchedule(cat, dateIso)` in `app.js` now picks old vs. new based on comparing the on-call day's own date to the fixed switch date (same per-date logic as before, but against a hardcoded date instead of a sheet cell). Also fixed the on-call raw table ("عرض كجدول") on mobile: the two frozen columns (day name + date) were together consuming ~250px on narrow screens, leaving only a sliver of one data column visible per scroll step. Under `max-width:768px`, only the date column stays frozen (shrunk to 78px), the day-name column becomes a normal scrolling column, and the table's min-width was reduced from 1200px to 820px so more columns fit per screen width.
- **Files:** helpers.js, app.js, styles.css, DATA-MODEL.md, CHANGELOG.md
- **Docs synced:** yes — DATA-MODEL.md (documented both fixed schedule tables + switch date instead of one).
- **Notes / follow-ups:** To change any duty time/duration, edit `ONCALL_SCHEDULE_OLD`/`ONCALL_SCHEDULE_NEW` in `helpers.js`; to change the cutover date, edit `ONCALL_SCHEDULE_SWITCH_DATE`. Desktop raw-table behavior (both columns frozen) is unchanged.

## 2026-07-30 — Fix schedule times not updating; make on-call duty schedule a fixed table in code
- **Who:** Claude Sonnet 5 (claude.ai)
- **Type:** both
- **What:** Per the resident's request, stopped reading duty times/durations from the "on-call rules" sheet tab (`GID_OR`). Read the tab's actual current values via its share link, confirmed the `B6` switch date (2026-07-23) had already passed so the "new" schedule block (rows 7–10) is the one currently in effect, and hardcoded those values as `ONCALL_SCHEDULE` in `helpers.js` (one entry per on-call category with workTime/workDuration/holidayTime/holidayDuration). Removed `switchDate`/`oldSet`/`newSet` and the old/new selection logic (`getRuleSetForDate`) from `app.js`; `getCategorySchedule()` now looks up `ONCALL_SCHEDULE` directly with the same normalized-name + "إسعاف/اسعاف" fallback matching as before. `parseOncallRules()` still runs but now only extracts annual holiday dates (if a "العطل السنوية" section exists in the tab) — everything else in that tab is now ignored.
- **Files:** helpers.js, app.js, DATA-MODEL.md, CHANGELOG.md
- **Docs synced:** yes — DATA-MODEL.md (rewrote the "On-call Rules" section to document `ONCALL_SCHEDULE` as the source of truth and mark rows 1–10 of that tab as no longer read).
- **Notes / follow-ups:** To change any duty time/duration going forward, edit `ONCALL_SCHEDULE` directly in `helpers.js` — editing the Google Sheet's rows 1–10 in that tab has no effect anymore. The tab is still fetched only for a possible future "العطل السنوية" (annual holidays) list; if that section is never used, `GID_OR` fetching could be removed entirely in a future session. No cache-key bump needed (removing this from `saveToCache`/`loadFromCache` wasn't necessary since `oncallRulesData`/`this.oncallRules` shape didn't change format, just lost two now-unused keys).

## 2026-07-30 — Remove hospital name from loading screen, modernize loader design
- **Who:** Claude Sonnet 5 (claude.ai)
- **Type:** code
- **What:** Removed the "مشفى حلب الجامعي" title text from the loading screen (`.loader-title` div removed from `index.html`). Replaced it with an animated pulsing heart-pulse icon inside two counter-rotating rings. Redesigned the loading screen visuals: animated shifting gradient background, glowing progress bar, restyled percentage/subtitle text.
- **Files:** index.html, styles.css, CHANGELOG.md
- **Docs synced:** no — purely visual, no behavior/data-contract change.
- **Notes / follow-ups:** `.loader-title` class was removed entirely (confirmed no JS references it). New classes added: `.loader-orb`, `.loader-orb-ring`, `.loader-orb-ring-2`, `.loader-icon`, plus keyframes `loaderBgShift`, `loaderSpin`, `loaderPulse`.

## 2026-07-30 — Fix auto-update, My Info calendar "today" bug, and on-call rules switch date; calendar polish
- **Who:** Claude Sonnet 5 (claude.ai)
- **Type:** both
- **What:** Fixed three real bugs and polished calendar visuals:
  1. `checkForAppUpdate()` referenced an undefined `remoteBuild` variable and never read the fetched `index.html` response, so it always threw silently and the documented auto-update-on-new-deploy feature never actually worked. Now it reads the response text, extracts the build id via the existing (previously unused) `extractBuildIdFromHtml()`, compares it to the current build, and only clears caches + reloads when a genuinely newer build is detected.
  2. `renderMyInfoMonthCalendar()` marked a day as "today" using `day === todayDay` (day-of-month only), so viewing a different month highlighted whichever day-of-month matched today's date-of-month (e.g. day 30 in next month lit up as if it were today). Now compares the full `YYYY-MM-DD` string against `this.today`.
  3. `getRuleSetForToday()` (on-call duty time/duration rules) compared the real current date against the `B6` switch date and applied the same old/new schedule to every displayed on-call day, instead of comparing each on-call day's own date to `B6`. Renamed to `getRuleSetForDate(dateIso)` and it now decides old vs. new schedule per displayed date, so days before `B6` correctly show the old times and days on/after `B6` show the new ones, even within the same month.
  4. Calendar CSS polish (main on-call calendar, My Info calendar, day headers): added weekend background tinting (light + dark mode), replaced the jarring `scale(1.2)` hover with a smoother lift + shadow, added a separating border under the calendar header, and consistent shadows/borders across calendar containers.
- **Files:** app.js, styles.css, DATA-MODEL.md, CHANGELOG.md
- **Docs synced:** yes — DATA-MODEL.md (clarified that the `B6` switch date is evaluated per on-call date, not real-world "today").
- **Notes / follow-ups:** No cache-key bump needed — these are logic/rendering fixes, not data-shape changes. Verified with `node --check` on app.js/helpers.js and a brace-balance check on styles.css. Recommend a manual check in a browser against real sheet data (especially an on-call month straddling the `B6` date) since the fetched sheet content couldn't be verified in this offline session (no network access in this session).

## 2026-07-10 — Make My Info calendar identical to main calendar + dots/tooltip
- **Who:** Cline (Claude)
- **Type:** code
- **What:** Removed all `.myinfo-day`/`.myinfo-past-day` CSS classes. `renderMyInfoMonthCalendar()` now uses the exact same `.calendar-day` class as the main oncall calendar (`renderMonthlyCalendar()`), so both calendars are visually identical (same aspect-ratio, padding, hover effects, colors). My Info days with oncall data show colored dot indicators (up to 4, +N overflow) instead of text labels, plus a CSS tooltip on hover that lists the oncall categories. Past days with oncall keep grey background + green border. Full dark mode support.
- **Files:** app.js, styles.css, CHANGELOG.md
- **Docs synced:** no — UI enhancement only, no data contract or behavior change.
- **Notes / follow-ups:** Dot colors rotate through green, indigo, amber, pink, teal. Tooltip appears above the day on hover. The `focusMyInfoOncallDate` selector was also updated from `.myinfo-day[data-date]` to `.calendar-day[data-date]`.

## 2026-07-10 — Change support shortcut button color to green
- **Who:** Cline (Claude)
- **Type:** code
- **What:** Changed the floating support shortcut button (شكاوي/دعم فني) background color from orange to green (`#10b981` to `#059669`) and updated matching box-shadow colors.
- **Files:** styles.css, CHANGELOG.md
- **Docs synced:** no — visual-only CSS change, no behavior or data contract change.
- **Notes / follow-ups:** The button is the `support-shortcut` class in the bottom-left corner with the headset icon.

## 2026-07-07 — Reshape My Info and fix lectures month selection UX
- **Who:** GPT-5.4 (GitHub Copilot)
- **Type:** both
- **What:** Rebuilt the `معلوماتي` card header and counters to match the requested static layout, replaced the old clickable counter/details flow with always-visible cumulative distribution and a month-dropdown on-call summary, and cleaned up on-call card/calendar styling for completed vs holiday shifts. Fixed the lectures month calendar so arrow navigation keeps the selected month, shows the title as `الشهر X`, and preserves user-selected empty days with a correct `لا يوجد.` state.
- **Files:** app.js, helpers.js, styles.css, README.md, ARCHITECTURE.md, CHANGELOG.md
- **Docs synced:** yes — README.md, ARCHITECTURE.md, CHANGELOG.md
- **Notes / follow-ups:** Validated syntax with workspace diagnostics and checked the updated UI locally in the browser; browser validation still showed the existing preload warnings for background images only.

## 2026-07-07 — Fix app startup parse corruption
- **Who:** GPT-5.4 mini (GitHub Copilot)
- **Type:** code
- **What:** Removed stray corrupted fragments that had been inserted into `app.js` and restored the constructor/method boundaries in `HospitalApp`, which was preventing the script from parsing and leaving the page stuck on the loading overlay.
- **Files:** app.js, CHANGELOG.md
- **Docs synced:** no — runtime boot fix only, no data contract or documented feature change.
- **Notes / follow-ups:** Verified in the browser that `window.app` initializes, the nav renders, and the loading screen hides.

## 2026-07-07 — Remove residual My Info on-call fields
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** code
- **What:** Removed the remaining first/last on-call and days-since-join fields from the `معلوماتي` extra-info grid so the simplified layout only shows the resident identity, contact, join date, status, and the interactive counters. This keeps the on-call area focused on the new month selector, breakdown counters, and calendar/row navigation.
- **Files:** app.js, CHANGELOG.md
- **Docs synced:** no — layout cleanup only, no new data contract.
- **Notes / follow-ups:** No sheet or cache changes.

## 2026-07-07 — Simplify My Info counters and hide lectures today block
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Removed the name sequence number from `معلوماتي`, replaced the erroneous days-since-join counter with a shift-history counter based on the resident's `فرز شهر` columns, and kept the monthly on-call breakdown open by default. Added compact hover popups with a details button on on-call calendar days, and marked completed on-call cards with a clearer done badge and softer completed styling. Hidden the standalone lectures-today hero block, kept upcoming lectures unchanged, and moved the old lectures/workshops toggle to the end of the lectures section.
- **Files:** app.js, styles.css, README.md, ARCHITECTURE.md, CHANGELOG.md
- **Docs synced:** yes — README.md, ARCHITECTURE.md, CHANGELOG.md
- **Notes / follow-ups:** No sheet contract or cache-key changes.

## 2026-07-07 — Refine table freeze, My Info structure, and lectures calendar UX
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Fixed on-call raw table freeze quality by refining sticky behavior/offsets for the header row and first two columns. Reworked `معلوماتي` layout so the identity row sits under the name, top counters are interactive (cumulative on-calls and days-since-join with shift-based details), removed the old-oncalls toggle from the on-call section, added month navigation for on-calls, and kept month cards in chronological order with past-day/card greying and click-to-focus from the calendar. Polished lectures calendar visuals and selection behavior: today uses border highlight, selected day uses fill, lecture count badge is clearly separated, and an inline button near upcoming lectures toggles old lectures/workshops.
- **Files:** app.js, styles.css, README.md, ARCHITECTURE.md, CHANGELOG.md
- **Docs synced:** yes — README.md, ARCHITECTURE.md, CHANGELOG.md
- **Notes / follow-ups:** No data-contract changes were made.

## 2026-07-07 — My Info on-call calendar UX, raw-table freeze, and two new tabs
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Upgraded the `معلوماتي` on-call experience with an interactive current-month calendar (on-call days in green with on-call-type labels), past-day greying, click-to-scroll + highlight to matching on-call cards, and monthly counters (total/done/remaining) with clickable category distributions. Added sticky behavior in on-call raw table mode to freeze the header row and first two columns while scrolling. Added two new navigation tabs (`الامتحانات والاختبارات`, `مشروع الحالات السريرية`) as styled work-in-progress sections.
- **Files:** app.js, helpers.js, styles.css, README.md, ARCHITECTURE.md, CHANGELOG.md
- **Docs synced:** yes — README.md, ARCHITECTURE.md, CHANGELOG.md
- **Notes / follow-ups:** No Google Sheet contract change and no cache-key bump were required.

## 2026-07-05 — Fix stale-site caching with deploy build-id and auto-update check
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Implemented a durable anti-stale-cache strategy for GitHub Pages deployments. The build pipeline now injects a unique build id into `index.html` and appends it to local asset URLs, local data cache keys are now build-scoped (`hc_v63_<buildId>`), and clients periodically check remote `index.html` to detect newer builds and auto-reload after clearing old app caches.
- **Files:** index.html, app.js, helpers.js, .github/workflows/pages.yml, README.md, ARCHITECTURE.md, DATA-MODEL.md, CHANGELOG.md
- **Docs synced:** yes — README.md, ARCHITECTURE.md, DATA-MODEL.md, CHANGELOG.md
- **Notes / follow-ups:** This avoids requiring hard refresh in normal update flows and reduces long-lived stale sessions.

## 2026-07-05 — Fix lectures date parsing and add interactive lectures month calendar
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Fixed lectures date parsing so the app accepts multiple date formats (including `YYYY-MM-DD`, `DD/MM/YYYY`, `MM/DD/YYYY`, Arabic/English month names, and gviz `Date(y,m,d)` values). Added an interactive month calendar to the lectures tab that highlights lecture days in green and shows that day’s lectures when clicked.
- **Files:** app.js, helpers.js, styles.css, README.md, ARCHITECTURE.md, CHANGELOG.md
- **Docs synced:** yes — README.md, ARCHITECTURE.md, CHANGELOG.md
- **Notes / follow-ups:** No Google Sheet column contract changes were made.

## 2026-07-04 — Add retry logic for transient Pages deploy backend failures
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Hardened GitHub Pages deployment by adding up to 3 deploy attempts in the `deploy` job and failing only if all attempts fail. This specifically targets intermittent `Deployment failed, try again later` errors after artifact upload succeeds.
- **Files:** .github/workflows/pages.yml, README.md, CHANGELOG.md
- **Docs synced:** yes — README.md, CHANGELOG.md
- **Notes / follow-ups:** Node 20 deprecation and `punycode` messages in the shown logs are warnings, not the direct failure.

## 2026-07-04 — Keep strong 2-minute refresh without disrupting on-call reading
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Switched auto-refresh behavior to a non-disruptive network-first path every 120 seconds (and on tab resume) without forced page reloads. Fixed on-call refresh flow to always update data while preserving the currently selected on-call date and syncing the date picker, preventing unexpected jumps back to today's date during reading.
- **Files:** app.js, helpers.js, README.md, ARCHITECTURE.md, DATA-MODEL.md, CHANGELOG.md
- **Docs synced:** yes — README.md, ARCHITECTURE.md, DATA-MODEL.md, CHANGELOG.md
- **Notes / follow-ups:** Existing `no-store` + request cache-busting remains in place for strong refresh behavior.

## 2026-07-04 — Harden Pages artifact packaging for deploy stability
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Updated Pages workflow to prepare and upload a dedicated `_site` directory (runtime files only) plus `.nojekyll`, instead of uploading the full repository root. This reduces deployment backend failures that surface as generic `Deployment failed, try again later` during `actions/deploy-pages`.
- **Files:** .github/workflows/pages.yml, README.md, CHANGELOG.md
- **Docs synced:** yes — README.md, CHANGELOG.md
- **Notes / follow-ups:** Node deprecation/punycode lines in the runner logs are warnings and were not the failure cause in this run.

## 2026-07-04 — Add GitHub Pages Actions deploy workflow
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Added a dedicated GitHub Actions workflow for Pages deployment (`pages build and deployment`) with build and deploy jobs using official `configure-pages`, `upload-pages-artifact`, and `deploy-pages` actions. This addresses fast-failing dynamic deploy checks when Pages is expected to deploy through Actions.
- **Files:** .github/workflows/pages.yml, README.md, CHANGELOG.md
- **Docs synced:** yes — README.md, CHANGELOG.md
- **Notes / follow-ups:** In GitHub repository settings, Pages source should be set to `GitHub Actions` for this workflow to be used.

## 2026-07-04 — Add automatic stale-cache recovery and periodic hard reload
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Added an automatic hard-reload policy to reduce cases where users stay on stale site versions: at startup/resume/interval checks, the app now reloads itself when the configured interval is exceeded. Also hardened Google Sheets fetches with `cache: 'no-store'` plus cache-busting query params to reduce stale network responses.
- **Files:** app.js, helpers.js, README.md, ARCHITECTURE.md, DATA-MODEL.md, CHANGELOG.md
- **Docs synced:** yes — README.md, ARCHITECTURE.md, DATA-MODEL.md, CHANGELOG.md
- **Notes / follow-ups:** Cache key `CK` stayed `hc_v63` because payload format is unchanged; only refresh policy changed.

## 2026-07-04 — Improve on-call raw table name readability
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Updated the `عرض كجدول` rendering in the on-call tab so multiple abbreviations in a single cell are displayed with separators (`، `) instead of crowded merged text.
- **Files:** app.js, CHANGELOG.md
- **Docs synced:** no — behavior-only display polish with no data-contract change.
- **Notes / follow-ups:** Date formatting and trailing empty-column fixes from the previous entry remain unchanged.

## 2026-07-04 — Fix stats sorting UX, on-call raw table date display, and My Info labels
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Updated Doctor Statistics sorting buttons to a three-state cycle (تصاعدي → تنازلي → إلغاء), added clearer state labels on the buttons, and normalized number display to hide trailing `.0`. Added vertical column separators in the Doctor Statistics desktop table and hardened subgroup extraction so subtype counts are displayed more reliably. Fixed On-call raw table date rendering to show `YYYY/MM/DD` instead of `Date(...)`, and removed trailing empty columns. Updated My Info wording from `إجمالي المناوبات الظاهرة` to `المناوبات المتبقية` and applied cleaned cumulative number display.
- **Files:** app.js, styles.css, CHANGELOG.md
- **Docs synced:** no — no data contract or architecture change.
- **Notes / follow-ups:** Sorting now uses click-cycling states; if explicit dropdown menus are preferred later, this can be switched without changing data logic.

## 2026-07-04 — Add doctor statistics tab, on-call rule engine, and major UX updates
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Implemented requested UI reorder and added a new `احصائيات الأطباء` tab driven by `gid=811980834` with smart search, grouped totals/details, and sorting by hours/shifts. Added on-call rules integration from `gid=1364488029` to show duty time/duration and holiday-aware highlights, prevented background refresh from forcing the selected on-call day back to today, and added a raw on-call table view. Expanded lectures with category filter and optional registration/announcement links, updated complaints content, and enriched `معلوماتي` with clearer guidance, counters, statistics section, and upcoming-vs-all on-call toggle.
- **Files:** helpers.js, app.js, styles.css, README.md, DATA-MODEL.md, ARCHITECTURE.md, CHANGELOG.md
- **Docs synced:** yes — README.md, DATA-MODEL.md, ARCHITECTURE.md, CHANGELOG.md
- **Notes / follow-ups:** Cache key bumped from `hc_v62` to `hc_v63` because cache payload and rendered contracts changed.

## 2026-07-03 — Reorder tabs and adjust old lectures ordering
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Reordered top navigation and section flow so the first four tabs are: residents, shifts, on-call, then lectures calendar. Improved today-lectures header emphasis and changed old lectures list order to chronological ascending (oldest to newest) when the old-lectures toggle is enabled.
- **Files:** helpers.js, app.js, styles.css, README.md, CHANGELOG.md
- **Docs synced:** yes — README.md, CHANGELOG.md
- **Notes / follow-ups:** Today area remains filtered to sessions that have not ended yet.

## 2026-07-03 — Add lectures and medical activities calendar tab
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Added a new tab powered by Google Sheet `gid=393274093` for lectures/medical activities with header-name based parsing (`التاريخ`, `التصنيف`, `العنوان`, `المحتويات`, `المحاضر`, `المكان`, `التوقيت`, `المدة`, `القسم`, `السنة`). Implemented smart search (title/content/speaker), department/year filters, large today highlight cards (excluding ended sessions), upcoming sessions view, and a toggle to reveal old sessions.
- **Files:** helpers.js, app.js, styles.css, README.md, ARCHITECTURE.md, DATA-MODEL.md, CHANGELOG.md
- **Docs synced:** yes — README.md, ARCHITECTURE.md, DATA-MODEL.md, CHANGELOG.md
- **Notes / follow-ups:** Lectures are fetched as CSV and cached with the same cache key payload; no cache key bump was required.

## 2026-07-03 — Detached count moved into button text + normal row styling
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Updated the detached filter button label to include the detached count directly in the button text (`المنفكين N`). Kept click behavior as a standard filter toggle that shows only `تم الانفكاك` rows. Removed detached-specific black row/card styling so list rows render with normal theme styling.
- **Files:** helpers.js, app.js, styles.css, CHANGELOG.md
- **Docs synced:** yes — CHANGELOG.md
- **Notes / follow-ups:** Detached status badge color remains unchanged; only row/card forced black styling was removed.

## 2026-07-03 — Detached button now filters detached-only rows
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Changed detached button click behavior to toggle filtering the residents roster by status `تم الانفكاك` only. When disabled, detached rows remain hidden by default; when enabled, only detached rows are shown.
- **Files:** app.js, CHANGELOG.md
- **Docs synced:** yes — CHANGELOG.md
- **Notes / follow-ups:** If joined-only filter is active, enabling detached-only now automatically turns joined-only off to avoid contradictory filters.

## 2026-07-03 — Detached count badge polish beside button
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Updated the detached button UI so the number appears in a separate compact badge beside the button (instead of inside button text). Added a subtle bounce animation when the count updates, while keeping click behavior as count-only toast with no names/details shown.
- **Files:** helpers.js, app.js, styles.css, CHANGELOG.md
- **Docs synced:** yes — CHANGELOG.md
- **Notes / follow-ups:** Behavior is unchanged functionally; this is a presentation polish for the detached count indicator.

## 2026-07-03 — Detached button switched to count-only action
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Changed the detached residents button behavior from filter-toggle to count-only. The button label now shows `عدد المنفكين: X`, and clicking it only shows a toast with the count without displaying names or any detached details.
- **Files:** app.js, CHANGELOG.md
- **Docs synced:** yes — CHANGELOG.md
- **Notes / follow-ups:** Detached residents remain hidden from roster details and excluded from contacts export.

## 2026-07-03 — Header-based residents mapping + detached filter
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Switched residents parsing from fixed column indices to header-name mapping for core fields (`الاسم الثلاثي`, `الاختصار`, `الاختصاص`, `رقم الهاتف`, `الحالة`, `تاريخ الالتحاق`, `المناوبات+`) while keeping fallback compatibility. Added explicit detached-status handling: `تم الانفكاك` is hidden from the roster by default, excluded from contacts export, color-coded black, and viewable only through a small dedicated filter button.
- **Files:** app.js, helpers.js, styles.css, README.md, ARCHITECTURE.md, DATA-MODEL.md, CHANGELOG.md
- **Docs synced:** yes — README.md, ARCHITECTURE.md, DATA-MODEL.md, CHANGELOG.md
- **Notes / follow-ups:** Shift month discovery still uses `فرز شهر <number>` by header pattern; no cache key bump was required.

## 2026-07-01 — Shrink support shortcut to icon and fix thanks wording
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** code
- **What:** Converted the floating support shortcut into a smaller icon-only button and switched the icon to a clearer support/IT symbol. Updated the complaints message ending from "وشطرا" to "وشكرا".
- **Files:** index.html, styles.css, helpers.js, CHANGELOG.md
- **Docs synced:** no
- **Notes / follow-ups:** Visual/UI copy update only; no data flow or contract changes.

## 2026-07-01 — Move complaints outside primary nav and speed first header paint
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Removed الشكاوي from the primary top tab row and added it as a separate floating shortcut button on the side/bottom area. Also improved first-open visual loading by preloading both header image formats and waiting for header-image readiness before dismissing the loading screen.
- **Files:** index.html, styles.css, helpers.js, app.js, README.md, ARCHITECTURE.md, CHANGELOG.md
- **Docs synced:** yes — README.md, ARCHITECTURE.md, CHANGELOG.md
- **Notes / follow-ups:** Data contract and cache key are unchanged.

## 2026-07-01 — Add complaints tab with technical support contact
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Added a new top navigation tab (الشكاوي) and a dedicated page section that shows technical support contact details (name, WhatsApp number, and Telegram handle) when opened.
- **Files:** helpers.js, README.md, ARCHITECTURE.md, CHANGELOG.md
- **Docs synced:** yes — README.md, ARCHITECTURE.md, CHANGELOG.md
- **Notes / follow-ups:** The complaints tab is static UI content and does not use Google Sheet data.

## 2026-07-01 — Unpin top nav and reset scroll on tab switch
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Made the top navigation non-sticky so it scrolls away with the page, and changed tab switching to scroll back to the top for a cleaner section transition.
- **Files:** styles.css, app.js, ARCHITECTURE.md, CHANGELOG.md
- **Docs synced:** yes — ARCHITECTURE.md, CHANGELOG.md
- **Notes / follow-ups:** This is a UI behavior change only; data loading, sheet contract, and cache key are unchanged.

## 2026-07-01 — Use WebP full-bleed header image
- **Who:** GPT-5.4 mini (GitHub Copilot)
- **Type:** code
- **What:** Switched the header hero to use `bg.webp` as the primary asset and restored the image to a true edge-to-edge full-bleed layout so the top section loads faster and fills the full header area.
- **Files:** index.html, styles.css, CHANGELOG.md
- **Docs synced:** no
- **Notes / follow-ups:** No data flow, tab behavior, or cache contract changed.

## 2026-07-01 — Restore the framed header image
- **Who:** GPT-5.4 mini (GitHub Copilot)
- **Type:** code
- **What:** Reverted the header photo from full-bleed back to the framed hero style with inset margins, rounded corners, and a soft shadow, matching the look before the last change.
- **Files:** styles.css, CHANGELOG.md
- **Docs synced:** no
- **Notes / follow-ups:** This is a visual rollback only; no app logic or data contract changed.

## 2026-07-01 — Make the header image full-bleed
- **Who:** GPT-5.4 mini (GitHub Copilot)
- **Type:** code
- **What:** Removed the inset frame around the header photo so it now fills the entire hero area edge-to-edge without showing uncovered background around it.
- **Files:** styles.css, CHANGELOG.md
- **Docs synced:** no
- **Notes / follow-ups:** This is a visual-only change; app behavior and data flow are unchanged.

## 2026-07-01 — Frame the header image instead of full-bleed
- **Who:** GPT-5.4 mini (GitHub Copilot)
- **Type:** code
- **What:** Changed the header photo from a flat full-bleed rectangle to a framed hero with inset edges, rounded corners, and a soft shadow so the image reads more intentionally.
- **Files:** styles.css, CHANGELOG.md
- **Docs synced:** no
- **Notes / follow-ups:** This is purely visual; no data flow, tab behavior, or cache contract changed.

## 2026-07-01 — Split the JavaScript into helpers and app class files
- **Who:** GPT-5.4 mini (GitHub Copilot)
- **Type:** both
- **What:** Moved the shared globals, helper functions, and tab builders into `helpers.js`, leaving `app.js` as the `HospitalApp` class and bootstrap. `index.html` now loads `helpers.js` before `app.js` so the runtime order stays correct.
- **Files:** index.html, helpers.js, app.js, README.md, ARCHITECTURE.md, AGENTS.md, CHANGELOG.md
- **Docs synced:** yes — README.md, ARCHITECTURE.md, AGENTS.md, CHANGELOG.md
- **Notes / follow-ups:** Behavior is unchanged; this is a structural refactor to make future edits easier and safer.

## 2026-07-01 — Split the app into external CSS and JS files
- **Who:** GPT-5.4 mini (GitHub Copilot)
- **Type:** both
- **What:** Moved the inline stylesheet and script out of `index.html` into `styles.css` and `app.js`, keeping `index.html` as a thin bootstrap shell. This makes future edits easier without changing the app's runtime behavior.
- **Files:** index.html, styles.css, app.js, README.md, ARCHITECTURE.md, AGENTS.md, CHANGELOG.md
- **Docs synced:** yes — README.md, ARCHITECTURE.md, AGENTS.md, CHANGELOG.md
- **Notes / follow-ups:** Validated in browser after the split; the page loaded, the nav rendered, and the loader cleared normally.

## 2026-07-01 — Add safe fallback for header background image
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Kept the header pointed at `bg.png` but added an `onerror` fallback to `bg.webp` so the site still renders a background if the preferred local file is missing or renamed.
- **Files:** index.html, CHANGELOG.md
- **Docs synced:** yes — CHANGELOG.md
- **Notes / follow-ups:** This is a runtime safety improvement only; app behavior and data loading are unchanged.

## 2026-07-01 — Switch header to the new hospital background image
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Switched the header hero image source from `bg.webp` to the new `bg.png` hospital image and retuned header crop, opacity, and brightness so the building reads clearly in both light and dark mode.
- **Files:** index.html, CHANGELOG.md
- **Docs synced:** yes — CHANGELOG.md
- **Notes / follow-ups:** Visual-only change; no app behavior, data contract, or cache changes.

## 2026-07-01 — Add normal/HQ on-call export actions
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Added two explicit on-call image download actions: normal and high quality. Wired HQ mode to stronger capture scaling and a higher export cap so users can get sharper PNG output on demand while keeping normal export lighter.
- **Files:** index.html, README.md, ARCHITECTURE.md, CHANGELOG.md
- **Docs synced:** yes — README.md, ARCHITECTURE.md, CHANGELOG.md
- **Notes / follow-ups:** My Info export path is unchanged; this is specific to on-call image downloads.

## 2026-07-01 — Raise on-call export sharpness
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Increased on-call image export clarity by raising capture scale and final max-side cap while preserving the compact table-style layout. This improves text/edge sharpness in downloaded PNGs without changing data behavior.
- **Files:** index.html, CHANGELOG.md
- **Docs synced:** yes — CHANGELOG.md
- **Notes / follow-ups:** Layout and column contracts are unchanged; this is a quality-tuning pass.

## 2026-07-01 — Compact table-style on-call export layout
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Adjusted on-call image export to be more compact and table-like by enforcing a 3-column category grid in capture mode and 2-column name cells inside each category. Reduced on-call export capture width/scale/max-side to keep high clarity while avoiding oversized output images.
- **Files:** index.html, CHANGELOG.md
- **Docs synced:** yes — CHANGELOG.md
- **Notes / follow-ups:** This specifically targets exported on-call card structure and size; runtime data behavior is unchanged.

## 2026-07-01 — On-call layout cleanup + compact high-res image export
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Reworked the per-day on-call card into a cleaner structured layout with summary pills and a responsive category grid for easier reading. Updated image export to capture from an off-screen compact clone at high resolution with stricter max dimensions, producing sharper PNGs that are less oversized when shared.
- **Files:** index.html, README.md, ARCHITECTURE.md, CHANGELOG.md
- **Docs synced:** yes — README.md, ARCHITECTURE.md, CHANGELOG.md
- **Notes / follow-ups:** No Google Sheet column contract or cache-key changes.

## 2026-07-01 — Second art-direction pass (clinical modern)
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Added a second visual pass with a more intentional clinical-modern look: display typography for headings/navigation, cleaner top-nav treatment, richer section framing, and gentle staged panel reveal animations. Preserved all app behavior and data parsing while keeping prior performance optimizations.
- **Files:** index.html, CHANGELOG.md
- **Docs synced:** yes — CHANGELOG.md
- **Notes / follow-ups:** No Google Sheet contract, cache key, or functional workflow changes.

## 2026-06-30 — Visual refresh with smoother runtime performance
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Refreshed the visual direction to a cooler blue/teal/amber palette, added a decorative textured hero overlay, and improved motion/accessibility with reduced-motion handling. Added runtime optimizations including CDN preconnect hints, debounced search inputs, hidden-tab refresh skipping, mobile animation load reduction, and asynchronous hero image decoding for faster perceived startup.
- **Files:** index.html, CHANGELOG.md
- **Docs synced:** yes — CHANGELOG.md
- **Notes / follow-ups:** Behavior and sheet-column contracts were not changed; update is visual/performance-focused.

## 2026-06-30 — Fix header image as a fixed decorative banner
- **Who:** GPT-5.4 mini (GitHub Copilot)
- **Type:** both
- **What:** Disabled touch/mouse dragging on the header image so it stays fixed, and adjusted its sizing, position, opacity, and contrast to read more clearly across light and dark mode.
- **Files:** index.html, CHANGELOG.md
- **Docs synced:** no
- **Notes / follow-ups:** Visual-only change; no data contract or app flow changes.

## 2026-06-30 — Split not-joined status colors by phrase
- **Who:** GPT-5.4 mini (GitHub Copilot)
- **Type:** both
- **What:** Split the resident status badge styling so the exact phrase "لم ينضم للغروب" renders red while "لم يلتحق بعد" renders yellow. Updated the roster table/cards and My Info to use the new status-to-class helper.
- **Files:** index.html, CHANGELOG.md
- **Docs synced:** no
- **Notes / follow-ups:** This is a presentation-only change; the sheet contract and data parsing stayed the same.

## 2026-06-30 — Polish banner framing and pending badge color
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Smoothed the header background image framing on mobile, increased dark-mode image visibility, and changed the normal pending badge from yellow to red so not-joined states read more clearly.
- **Files:** index.html, CHANGELOG.md
- **Docs synced:** yes — CHANGELOG.md
- **Notes / follow-ups:** Visual-only refinement; no data contract or behavior changes.

## 2026-06-30 — Fix mobile banner crop and pending status color
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Improved the header background image framing on mobile and increased dark-mode visibility so the banner is less washed out. Changed the pending status badge from yellow to red so "not joined" states are clearer and match the requested emphasis.
- **Files:** index.html, CHANGELOG.md
- **Docs synced:** yes — CHANGELOG.md
- **Notes / follow-ups:** Visual-only CSS update; no data contract or behavior changes.

## 2026-06-30 — Treat copied future-month shifts as not-ready
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Fixed shifts/month display logic so a future month (e.g., month 7) that is an exact auto-copy of the previous month is treated as not populated yet. In this case, the app now shows "no data" in the shifts tab and in My Info for that month until real changes are entered.
- **Files:** index.html, CHANGELOG.md
- **Docs synced:** yes — CHANGELOG.md
- **Notes / follow-ups:** Detection is strict (exact copy across joined residents), designed to prevent showing duplicated placeholder future-month data.

## 2026-06-30 — Icon consistency polish (chevrons + spacing)
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Added a second-pass icon polish to normalize icon spacing/sizing in nav and labels, and fixed toggle behavior so only chevron indicators rotate in collapsible and Q&A category headers (not all icons in the row).
- **Files:** index.html, CHANGELOG.md
- **Docs synced:** yes — CHANGELOG.md
- **Notes / follow-ups:** Visual-only CSS refinement; no behavior/data contract changes.

## 2026-06-30 — Replace emoji-heavy UI labels with icons
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Replaced emoji-based UI markers across navigation, section labels, status badges, tooltips, and dynamic cards with consistent Font Awesome icons already loaded in the project. This keeps the same behavior while improving visual consistency across devices and fonts.
- **Files:** index.html, CHANGELOG.md
- **Docs synced:** yes — CHANGELOG.md
- **Notes / follow-ups:** No data model, cache key, or sheet-column contract changes.

## 2026-06-29 — Hotfix loader stuck at 0% after footer text change
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Fixed startup crash that occurred because `init()` still wrote to `#currentYear` after footer markup was simplified. Added a null-safe guard so app initialization proceeds even when that element is absent.
- **Files:** index.html, CHANGELOG.md
- **Docs synced:** yes — CHANGELOG.md
- **Notes / follow-ups:** This specifically resolves the loading screen freezing at 0%.

## 2026-06-29 — Immediate download feedback + higher mobile export detail
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Added instant button loading state for image export actions so users get immediate confirmation on tap before capture starts. Increased mobile capture scale and output limits to improve text/detail quality in downloaded images. Added clearer in-app guidance that WhatsApp/Telegram reduce quality when sent as photos and that document/file sending preserves quality.
- **Files:** index.html, CHANGELOG.md
- **Docs synced:** yes — CHANGELOG.md
- **Notes / follow-ups:** Platform-side compression in chat apps cannot be fully bypassed by image format alone.

## 2026-06-29 — Footer text simplification and bottom alignment
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Updated footer content to show only `تجربة 2026` as requested. Fixed footer vertical behavior by switching to a flex-column page layout and letting main content grow, ensuring the footer remains at the bottom even when "معلوماتي" content is short.
- **Files:** index.html, CHANGELOG.md
- **Docs synced:** yes — CHANGELOG.md
- **Notes / follow-ups:** Removed dynamic year/footer icon text intentionally per request.

## 2026-06-29 — Fix shifts selector scaling on medium widths
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Fixed the remaining shifts month rectangle overflow that appeared while resizing between desktop and mobile breakpoints. Added responsive width rules (`clamp` + max-width 1100px behavior) so the selector shrinks progressively instead of staying oversized.
- **Files:** index.html, CHANGELOG.md
- **Docs synced:** yes — CHANGELOG.md
- **Notes / follow-ups:** This is scoped to the shifts tab selector only; no changes to data logic or on-call selector behavior.

## 2026-06-29 — Fix shifts dropdown overflow and header layout
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Fixed responsive overflow in the shifts tab header by constraining the month selector wrapper and applying tab-scoped layout rules for desktop/mobile. This restores proper alignment inside the card and prevents the dropdown from escaping the frame.
- **Files:** index.html, CHANGELOG.md
- **Docs synced:** yes — CHANGELOG.md
- **Notes / follow-ups:** Fix is scoped to the shifts tab only to avoid side effects on the on-call and my-info month selectors.

## 2026-06-29 — Image quality tuning + shifts selector UI + faster header image paint
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Retuned image export scaling/canvas limits to preserve more detail on mobile before messaging-app recompression. Restyled the shifts month selector with clearer modern UI and improved spacing. Switched header hero image layer to eager-loaded `<img>` for faster first visual paint on mobile and reduced partial-loading look.
- **Files:** index.html, README.md, ARCHITECTURE.md, CHANGELOG.md
- **Docs synced:** yes — README.md, ARCHITECTURE.md
- **Notes / follow-ups:** WhatsApp/Telegram still compress image sends by default; sending as document preserves maximum quality.

## 2026-06-29 — Faster mobile startup with cache-first render
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Optimized startup flow so cached data is rendered immediately and the first background refresh no longer blocks the loading screen. Increased cache TTL from 2 minutes to 10 minutes to reduce cold starts on mobile while still refreshing data in the background.
- **Files:** index.html, README.md, ARCHITECTURE.md, DATA-MODEL.md, CHANGELOG.md
- **Docs synced:** yes — README.md, ARCHITECTURE.md, DATA-MODEL.md
- **Notes / follow-ups:** Refresh interval remains 120 seconds; no data-column contract changes; cache key version unchanged.

## 2026-06-29 — Mobile image export + early next-month shifts
- **Who:** GPT-5.3-Codex (GitHub Copilot)
- **Type:** both
- **What:** Improved PNG export logic for on-call/my-info cards to reduce quality loss after mobile sharing apps recompress very large images. Added data-aware shift month selection so the app can default to next month as soon as `فرز شهر X` has real values, instead of waiting for calendar rollover.
- **Files:** index.html, README.md, ARCHITECTURE.md, DATA-MODEL.md, CHANGELOG.md
- **Docs synced:** yes — README.md, ARCHITECTURE.md, DATA-MODEL.md
- **Notes / follow-ups:** User can still manually pick any month in the selectors; auto-preference is applied as the default only. Cache key was not bumped because the data contract is unchanged.

## 2026-06-27 — Initial documentation set
- **Who:** Claude Opus 4.8 (1M context)
- **Type:** docs
- **What:** Read the full `index.html` and authored model-agnostic documentation
  so any future AI model can understand and safely modify the project. Created
  README.md (overview), ARCHITECTURE.md (code map), DATA-MODEL.md (Google Sheet
  column contract), AGENTS.md (cross-tool AI guide), and this CHANGELOG.md.
- **Files:** README.md, ARCHITECTURE.md, DATA-MODEL.md, AGENTS.md, CHANGELOG.md
- **Docs synced:** yes — docs describe `index.html` as of this date; no code was
  changed.
- **Notes / follow-ups:** Line numbers cited in the docs are approximate and will
  drift as `index.html` is edited — search by stable identifier names instead.
  `index.html` itself has no section-marker comments yet; adding some was offered
  but not done. No tests exist (none expected for this static app).
