# _legacy — pre-refactor snapshot (2026-08-13)

These are the original files as they were **before** the restructure of
2026-08-13, kept only so the change can be compared or reverted by hand:

| File | Was |
|---|---|
| `app.js` | the whole `HospitalApp` class (~3300 lines) |
| `helpers.js` | globals, helpers, constants, tab HTML builders |
| `index.html` | the shell that loaded those two files |

Nothing in the running site references this folder — it is not copied by the
GitHub Pages workflow. **Safe to delete** once the new structure has been live
for a while.

The current code lives in `js/` (see [../ARCHITECTURE.md](../ARCHITECTURE.md)).
