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

## 2026-06-27 — Added "Hosted by Levant Host" to footer
- **Who:** GitHub Copilot (Claude Sonnet 4.5)
- **Type:** code
- **What:** Added "Hosted by Levant Host" link to the footer. Added CSS styling 
  for footer links with green color and hover effects, and modified the footer 
  HTML to include a new line with a link to levanthost.com.
- **Files:** index.html
- **Docs synced:** no — minor visual change only, no behavior or contract changes.
- **Notes / follow-ups:** Link opens in new tab with security attributes. Styled 
  in green (#00b894) to match site theme.

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
