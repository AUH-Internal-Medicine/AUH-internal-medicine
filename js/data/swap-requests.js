/**
 * متابعة طلبات التبديل — reads the swap-request responses sheet.
 *
 * The reviewer's workflow is to colour a row green (approved) or red (rejected)
 * and leave the reason in the notes column. Google's read-only endpoints expose
 * VALUES but not cell formatting, with one exception: a spreadsheet that has
 * been "published to the web" serves a `pubhtml` page whose cells carry their
 * real background colours. So status is resolved in this order:
 *
 *   1. an explicit status column (الحالة / القرار …) if one exists
 *   2. the row's background colour, when the sheet is published
 *   3. otherwise: pending
 *
 * Nothing here writes; a failure degrades to "قيد المراجعة", never to an error.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const { normAr, exactNameMatch } = AUH.text;
  const log = AUH.log;

  const STATUS = { approved: 'approved', rejected: 'rejected', pending: 'pending' };

  /** Header labels we recognise, all compared Arabic-normalized. */
  const COLUMNS = {
    name: ['اسم صاحب المناوبة الاساسي', 'اسم صاحب المناوبة', 'الاسم'],
    abbr: ['اختصار صاحب المناوبة الاساسي', 'اختصار صاحب المناوبة', 'الاختصار'],
    toName: ['اسم المناوب الجديد', 'اسم الدكتور المناوب الجديد'],
    toAbbr: ['اختصار الدكتور المناوب الجديد', 'اختصار المناوب الجديد'],
    type: ['نوع المناوبة'],
    date: ['تاريخ المناوبة'],
    kind: ['شيل أم تبديل', 'نوع الطلب'],
    backDate: ['التاريخ الذي بدلت معه'],
    backType: ['نوع مناوبة الدكتور الذي سوف تبدل معه'],
    reason: ['سبب التبديل'],
    notes: ['ملاحظات', 'اي ملاحظات اضافية تحب ان تضيفها'],
    status: ['الحالة', 'القرار', 'الحكم', 'حالة الطلب'],
    stamp: ['Timestamp', 'الطابع الزمني', 'اخر تحديث']
  };

  /** First column whose header starts with one of `labels`. */
  function findCol(headers, labels) {
    // Form questions carry their own help text on later lines, and some start
    // with a stray space — so compare the FIRST line, trimmed.
    const clean = h => normAr((h || '').toString().split('\n')[0].trim());
    for (const label of labels) {
      const want = normAr(label);
      const i = headers.findIndex(h => {
        const n = clean(h);
        return n === want || n.startsWith(want) || want.startsWith(n) && n.length > 6;
      });
      if (i >= 0) return i;
    }
    return -1;
  }

  /** green-ish → approved, red-ish → rejected, anything else → pending. */
  function statusFromColour(css) {
    const m = /#([0-9a-f]{6})/i.exec(css || '');
    if (!m) return null;
    const hex = m[1].toLowerCase();
    if (hex === 'ffffff' || hex === '000000') return null;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if (Math.max(r, g, b) - Math.min(r, g, b) < 24) return null;   // grey
    if (g > r + 18 && g > b + 18) return STATUS.approved;
    if (r > g + 28 && r > b + 18) return STATUS.rejected;
    return null;
  }

  /**
   * gviz serialises date cells as `Date(2026,6,24,18,2,9)` (month is 0-based).
   * Turn that into something a person can read; leave anything else untouched.
   */
  function readableDate(value, withTime) {
    const raw = (value || '').toString().trim();
    const m = /^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)$/.exec(raw);
    if (!m) return raw;
    const pad = n => String(n).padStart(2, '0');
    const date = `${m[1]}-${pad(+m[2] + 1)}-${pad(+m[3])}`;
    if (!withTime || m[4] === undefined) return date;
    return `${date} ${pad(+m[4])}:${pad(+m[5])}`;
  }

  /** Reads a written status cell ("تم" / "مرفوض" …). */
  function statusFromText(text) {
    const n = normAr(text || '');
    if (!n) return null;
    if (/(تم|موافق|مقبول|منفذ|نفذ)/.test(n)) return STATUS.approved;
    if (/(مرفوض|رفض|ملغى|ملغي)/.test(n)) return STATUS.rejected;
    return null;
  }

  /**
   * Row colours, when the sheet is published to the web. Returns a Map of
   * row index (0 = first data row) → status, or an empty Map.
   */
  async function fetchRowColours(spreadsheetId) {
    const out = new Map();
    try {
      const res = await fetch(
        `https://docs.google.com/spreadsheets/d/${spreadsheetId}/pubhtml?widget=false&headers=false`,
        { credentials: 'omit' }
      );
      if (!res.ok) return out;
      const html = await res.text();
      if (!/<table/i.test(html)) return out;   // not published → login page

      const doc = new DOMParser().parseFromString(html, 'text/html');
      // class → background-color, from the page's own stylesheet
      const colours = {};
      Array.from(doc.querySelectorAll('style')).forEach(styleEl => {
        const css = styleEl.textContent || '';
        const re = /\.([A-Za-z0-9_-]+)\s*\{[^}]*background-color\s*:\s*([^;}]+)/g;
        let m;
        while ((m = re.exec(css))) colours[m[1]] = m[2].trim();
      });

      const rows = Array.from(doc.querySelectorAll('table tr'));
      rows.forEach((tr, i) => {
        const cells = Array.from(tr.querySelectorAll('td'));
        if (!cells.length) return;
        for (const td of cells) {
          const inline = td.getAttribute('style') || '';
          const cls = (td.className || '').split(/\s+/).map(c => colours[c] || '').join(' ');
          const st = statusFromColour(inline) || statusFromColour(cls);
          if (st) { out.set(i - 1, st); break; }   // -1: the header row
        }
      });
    } catch (err) {
      log.debug('swaps', `تعذّرت قراءة ألوان الصفوف: ${err.message}`);
    }
    return out;
  }

  /**
   * Every swap request in the sheet, newest first.
   * @returns {{list:Array, coloursAvailable:boolean}}
   */
  async function fetchAll() {
    const id = (AUH.config.spreadsheets && AUH.config.spreadsheets.swaps) || '';
    if (!id) return { list: [], coloursAvailable: false };

    // JSON, not CSV: the CSV export truncates this sheet's header row at the
    // last question it recognises (losing "اسم المناوب الجديد" onwards) and
    // pads the bottom with empty rows.
    const table = await AUH.data.gviz.fetchSource({
      spreadsheet: 'swaps', gid: '0', key: 'swaps', format: 'json'
    });
    const rows = Array.isArray(table) ? table : [];
    if (rows.length < 2) return { list: [], coloursAvailable: false };

    const headers = rows[0] || [];
    const col = {};
    Object.keys(COLUMNS).forEach(k => (col[k] = findCol(headers, COLUMNS[k])));

    const colours = await fetchRowColours(id);

    const list = rows.slice(1).map((row, i) => {
      // (blank trailing rows are dropped after mapping, see filter below)
      const get = k => (col[k] >= 0 ? (row[col[k]] || '').toString().trim() : '');
      const written = statusFromText(get('status'));
      const status = written || colours.get(i) || STATUS.pending;
      return {
        rowIndex: i + 2,                       // 1-based, header included
        status,
        statusSource: written ? 'column' : (colours.has(i) ? 'colour' : 'none'),
        name: get('name'), abbr: get('abbr'),
        toName: get('toName'), toAbbr: get('toAbbr'),
        type: get('type'), date: readableDate(get('date')),
        kind: get('kind') || 'شيل',
        backType: get('backType'), backDate: readableDate(get('backDate')),
        reason: get('reason'), notes: get('notes'),
        stamp: readableDate(get('stamp'), true)
      };
    });

    const real = list.filter(r => r.stamp || r.name);
    real.reverse();                            // newest first
    return { list: real, coloursAvailable: colours.size > 0 };
  }

  /** The requests a given resident is party to, either side of the swap. */
  function forResident(list, name, abbr) {
    return (list || []).filter(r =>
      exactNameMatch(r.name, name) || exactNameMatch(r.abbr, abbr) ||
      exactNameMatch(r.toName, name) || exactNameMatch(r.toAbbr, abbr));
  }

  AUH.data.swapRequests = { fetchAll, forResident, STATUS };
})(typeof window !== 'undefined' ? window : globalThis);
