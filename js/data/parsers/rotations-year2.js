/**
 * فروزات السنة الثانية — one row per resident.
 *
 * The row is in three parts: a few identity columns, a block of per-rotation
 * counters (اورام, دم, صدرية …), then the rotation actually served each month,
 * in order. The trailing sequence has no headers of its own, so it is read as
 * "everything after the last counter column".
 *
 * «انفكاك» inside that sequence means the resident LEFT the programme. It is
 * not a rotation and must never be counted, listed or offered as one.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const { normAr } = AUH.text;
  const headersApi = AUH.data.headers;

  /** Values in the month sequence that mean "no rotation", not a place. */
  const NOT_A_ROTATION = ['انفكاك', 'تم الانفكاك', 'منفك', '-', '—', '0'];

  function isRotation(value) {
    const v = normAr(value || '').trim();
    if (!v) return false;
    return !NOT_A_ROTATION.some(x => normAr(x) === v);
  }

  /** Header labels that mark the start of the month-by-month sequence. */
  const MONTH_WORDS = ['كانون', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران',
    'تموز', 'آب', 'أيلول', 'تشرين'];

  const isMonthHeader = h => {
    const n = normAr(h || '').trim();
    return !!n && MONTH_WORDS.some(w => n.includes(normAr(w)));
  };

  function parseRotationsYear2(table) {
    const source = AUH.data.schema.rotationsYear2;
    const rows = Array.isArray(table) ? table : [];
    const headerRow = rows[0] || [];
    const resolution = headersApi.resolveColumns(headerRow, source);
    const get = headersApi.createAccessor(resolution.map);
    const skip = (source.skipNameValues || []).map(normAr);

    // The sheet is: identity | one counter per rotation | one column per month.
    // The first month-named header is the boundary between the two blocks.
    const firstMonth = headerRow.findIndex(isMonthHeader);
    const seqStart = firstMonth > 0 ? firstMonth : headerRow.length;
    const counterStart = headerRow.findIndex(h => normAr(h || '').includes(normAr('عداد الفروزات')));

    // "عداد الفروزات كلية" is the counter for كلية; the rest are named plainly.
    const counterLabel = h => {
      const raw = (h || '').toString().trim();
      return raw.replace(/^عداد\s+الفروزات\s*/, '').trim() || raw;
    };

    const list = [];
    const rotationNames = new Set();

    rows.slice(1).forEach((row, i) => {
      if (!row || !row.length) return;
      const name = get(row, 'name');
      if (!name || skip.includes(normAr(name))) return;

      const counters = {};
      let detached = false;
      if (counterStart >= 0) {
        for (let c = counterStart; c < seqStart; c++) {
          const label = counterLabel(headerRow[c]);
          const value = parseInt((row[c] || '').toString().trim(), 10);
          if (!label || !Number.isFinite(value)) continue;
          if (!isRotation(label)) { if (value > 0) detached = true; continue; }
          counters[label] = value;
        }
      }

      // month → rotation served, in sheet order; departures never enter it
      const sequence = [];
      for (let c = seqStart; c < row.length; c++) {
        const value = (row[c] || '').toString().trim();
        if (!value) continue;
        if (!isRotation(value)) { detached = true; continue; }
        sequence.push({ month: (headerRow[c] || '').toString().trim(), rotation: value });
        rotationNames.add(value);
      }

      list.push({
        year: 2,
        seq: list.length + 1,
        name,
        spec: get(row, 'spec'),
        counters,
        sequence,
        current: sequence.length ? sequence[sequence.length - 1].rotation : '',
        detached,
        rowIndex: i + 1
      });
    });

    const byName = new Map();
    list.forEach(r => byName.set(normAr(r.name), r));

    return {
      list, byName,
      rotations: Array.from(rotationNames).sort((a, b) => a.localeCompare(b, 'ar')),
      issues: resolution.issues || []
    };
  }

  AUH.parse.rotationsYear2 = parseRotationsYear2;
})(typeof window !== 'undefined' ? window : globalThis);
