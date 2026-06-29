# Data Model — Google Sheet Layout

All content shown by the app comes from **one public Google Sheet**, read live in
the browser through Google's **gviz** ("Google Visualization") query endpoint.
There is no server and no write path — the app is read-only against the sheet.

## Source spreadsheet

- **Spreadsheet ID** (`SID` in code): `1Pb5VK1HsccaJpKXm-jersktd8yk4jf1V7o8qsDDmCI4`
- The sheet must be shared as **"Anyone with the link can view"**, or the
  browser fetch fails and the page shows cached/empty data.

Each tab (worksheet) is addressed by its numeric **GID**. The app fetches five tabs:

| Constant | GID | Tab content | Fetched as |
|---|---|---|---|
| `GID_R` | `0` | Residents roster (لائحة المقيمين) | CSV |
| `GID_O` | `238974679` | On-call schedule (المناوبات) | JSON |
| `GID_E` | `253629565` | Annual evaluation (التقييم السنوي) | CSV |
| `GID_L` | `1649404909` | Links / channels (روابط) | CSV |
| `GID_Q` | `680270268` | Q&A (الأسئلة والأجوبة) | JSON |

### Endpoint shapes
- CSV: `https://docs.google.com/spreadsheets/d/{SID}/gviz/tq?tqx=out:csv&gid={GID}`
- JSON: `https://docs.google.com/spreadsheets/d/{SID}/gviz/tq?tqx=out:json&gid={GID}`

Both are normalized in code to the same in-memory shape:
**`[ headerRow, ...dataRows ]`**, where every row is an **array of strings**.
Indexing below is **0-based** and refers to that array.

> ⚠️ **The column positions are a hard contract.** The code reads fixed indices.
> Do **not** insert, delete, or reorder columns in the sheet without updating
> `index.html` to match. Adding columns at the far right is usually safe.

---

## 1. Residents (`GID_R = 0`, CSV)

Row 0 is the header. Each subsequent row is one resident. Rows whose name cell is
empty, or contains the literal "الاسم" (header echo), are skipped.

| Index | Field (code name) | Arabic meaning |
|---|---|---|
| 0 | (sequence, recomputed in code as `seq = i+1`) | الترتيب |
| 1 | `name` | الاسم الثلاثي (full name) |
| 2 | `abbr` | الاختصار (abbreviation / short code) |
| 3 | `spec` | الاختصاص (specialty) |
| 4 | `phone` | الهاتف |
| 9 | `join` | تاريخ/حالة الالتحاق |
| 10 | `onc` / `cumulativeOnc` | المناوبات التراكمية (cumulative on-calls) |
| 11 | `st` | الحالة (status — drives `isJoined()`) |
| 12+ | monthly shift columns | الفرز الشهري |

**Status (`st`, index 11):** a resident is considered "joined" if the status text
contains التحق, ملتحق, or التحاق (`isJoined()`).

**Monthly shift columns (index ≥ 12):** discovered dynamically by scanning the
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

## Caching & refresh

- The full fetched dataset is cached in `localStorage` under key **`hc_v62`**
  with a timestamp.
- Cache **TTL is 2 minutes** (`CD = 2 * 60 * 1000`). Within the TTL the page
  renders instantly from cache and still refreshes in the background.
- The app re-fetches every **120 seconds** while open.
- To force-invalidate every visitor's cache after a breaking change, bump the
  cache key version in `index.html` (e.g. `hc_v62` → `hc_v63`).

## Changing the data source

If you point the app at a different spreadsheet, update `SID` and the five `GID_*`
constants near line 332 of `index.html`, and make sure the new tabs match the
column contracts above (or update the renderers accordingly).
