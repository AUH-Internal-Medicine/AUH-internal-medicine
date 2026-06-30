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
