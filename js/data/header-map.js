/**
 * Header → column resolution.
 *
 * Turns a sheet's header row plus a schema description into a `{field: index}`
 * map, so the rest of the app can say `get(row, 'phone')` instead of `row[4]`.
 *
 * Resolution order (strongest signal first, so a weak match can never steal a
 * column from a strong one):
 *
 *   0. repeated patterns — "فرز شهر 8", "مناوبات شهر 8" … claimed up front
 *   1. exact             — normalized header equals one of the field's labels
 *   2. prefix            — header starts with a label ("المهارات السريرية 25%")
 *   3. contains          — label appears inside the header, and ONLY when exactly
 *                          one unclaimed header matches (never a coin flip)
 *   4. fallbackIndex     — declared position, only for columns the sheet leaves
 *                          unlabeled, and only if that slot is still free
 *
 * Every column is claimed at most once, and anything unresolved is reported
 * instead of silently defaulted — a wrong column is worse than a missing one.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const { normAr, toAsciiDigits } = AUH.text;
  const log = AUH.log;

  const DEFAULT_STRATEGIES = ['exact', 'prefix', 'contains'];
  /** NBSP, zero-width and bidi marks that Sheets loves to leave inside headers. */
  const INVISIBLE_CHARS = /[\u00A0\u200B-\u200F\uFEFF]/g;

  /** Trim, collapse whitespace, drop trailing punctuation — then Arabic-normalize. */
  function normalizeHeader(h) {
    const raw = String(h === null || h === undefined ? '' : h)
      .replace(INVISIBLE_CHARS, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[:*]+$/, '')
      .trim();
    return normAr(raw);
  }

  /** Raw (unnormalized) header text, cleaned of invisible characters. */
  function cleanHeader(h) {
    return String(h === null || h === undefined ? '' : h)
      .replace(INVISIBLE_CHARS, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** True when `header` starts with `label` at a word boundary. */
  function startsWithLabel(header, label) {
    if (!header.startsWith(label)) return false;
    const rest = header.slice(label.length);
    return rest === '' || /^[\s\d(%[/–—-]/.test(rest);
  }

  function matches(header, label, strategy) {
    if (!header || !label) return false;
    if (strategy === 'exact') return header === label;
    if (strategy === 'prefix') return startsWithLabel(header, label);
    return header.includes(label);
  }

  /**
   * Resolves one source's header row against its schema entry.
   *
   * @param {Array} headerRow raw header cells
   * @param {object} source schema entry (see data/schema.js)
   * @returns {{map:Object, columns:Object, patterns:Object, issues:Array, unknownHeaders:Array, headers:string[]}}
   */
  function resolveColumns(headerRow, source) {
    const headers = (headerRow || []).map(cleanHeader);
    const normalized = headers.map(normalizeHeader);
    const claimed = new Set();
    const map = {};
    const detail = {};
    const issues = [];
    const columnDefs = source.columns || {};

    /* 0 — repeated-pattern columns are claimed first so no label can steal one. */
    const patterns = {};
    for (const [name, def] of Object.entries(source.patterns || {})) {
      const found = [];
      // Most repeated headers capture a number ("فرز شهر 8"); a few capture a
      // word instead ("تموز 2025"), and those must not go through parseInt.
      const numeric = def.numeric !== false;
      for (let i = 0; i < headers.length; i++) {
        const raw = toAsciiDigits(headers[i]);
        const m = raw.match(def.regex);
        if (!m) continue;
        const value = numeric ? parseInt(m[1], 10) : m[1];
        if (numeric && !Number.isFinite(value)) continue;
        const entry = { col: i, label: headers[i], value };
        entry[def.field || 'value'] = value;
        found.push(entry);
        claimed.add(i);
      }
      found.sort((a, b) => (numeric ? a.value - b.value : a.col - b.col));
      patterns[name] = found;
    }

    /* 1–3 — label matching, strongest strategy first. */
    const fields = Object.keys(columnDefs);
    for (const strategy of DEFAULT_STRATEGIES) {
      for (const field of fields) {
        if (map[field] !== undefined) continue;
        const def = columnDefs[field] || {};
        const allowed = def.match || DEFAULT_STRATEGIES;
        if (!allowed.includes(strategy)) continue;

        for (const label of def.labels || []) {
          const target = normalizeHeader(label);
          const hits = [];
          for (let i = 0; i < normalized.length; i++) {
            if (claimed.has(i) || !normalized[i]) continue;
            if (matches(normalized[i], target, strategy)) hits.push(i);
          }
          if (!hits.length) continue;

          if (strategy === 'contains' && hits.length > 1) {
            issues.push({
              level: 'warn',
              source: source.key,
              field,
              message: `العنوان "${label}" يطابق أكثر من عمود — تم تجاهل المطابقة الغامضة`,
              candidates: hits.map(i => headers[i])
            });
            continue;
          }

          map[field] = hits[0];
          claimed.add(hits[0]);
          detail[field] = { index: hits[0], header: headers[hits[0]], via: strategy, label };
          break;
        }
      }
    }

    /* 4 — positional fallback for columns the sheet leaves unlabeled. */
    for (const field of fields) {
      if (map[field] !== undefined) continue;
      const def = columnDefs[field] || {};
      const idx = def.fallbackIndex;
      if (!Number.isInteger(idx) || claimed.has(idx) || idx >= Math.max(headers.length, 1)) continue;
      map[field] = idx;
      claimed.add(idx);
      detail[field] = { index: idx, header: headers[idx] || '', via: 'fallbackIndex', label: null };
      issues.push({
        level: 'info',
        source: source.key,
        field,
        message: `تعذر العثور على عنوان العمود، تم استخدام الموضع الافتراضي (${idx})`
      });
    }

    /* Report anything still unresolved. */
    for (const field of fields) {
      if (map[field] !== undefined) continue;
      const def = columnDefs[field] || {};
      issues.push({
        level: def.required ? 'error' : def.silentIfMissing ? 'info' : 'warn',
        source: source.key,
        field,
        message: def.required
          ? `عمود إلزامي غير موجود في الشيت: ${(def.labels || []).join(' / ')}`
          : `عمود اختياري غير موجود: ${(def.labels || []).join(' / ')}`
      });
    }

    /* Headers nobody claimed — a renamed column shows up here. */
    const unknownHeaders = [];
    for (let i = 0; i < headers.length; i++) {
      if (claimed.has(i) || !normalized[i]) continue;
      unknownHeaders.push({ index: i, header: headers[i] });
    }

    return { map, columns: detail, patterns, issues, unknownHeaders, headers };
  }

  /**
   * Resolves a list of same-shaped columns declared as `{key, labels}` objects
   * (used for the evaluation sheet's eight skill columns).
   */
  function resolveList(headerRow, defs, options) {
    const opts = options || {};
    const headers = (headerRow || []).map(cleanHeader);
    const normalized = headers.map(normalizeHeader);
    const claimed = new Set(opts.claimed || []);
    const out = [];

    for (const def of defs || []) {
      let index = -1;
      for (const strategy of DEFAULT_STRATEGIES) {
        for (const label of def.labels || [def.label]) {
          const target = normalizeHeader(label);
          for (let i = 0; i < normalized.length; i++) {
            if (claimed.has(i) || !normalized[i]) continue;
            if (matches(normalized[i], target, strategy)) {
              index = i;
              break;
            }
          }
          if (index >= 0) break;
        }
        if (index >= 0) break;
      }
      if (index >= 0) claimed.add(index);
      out.push({ key: def.key, label: index >= 0 ? headers[index] || def.label : def.label, index });
    }

    return out;
  }

  /**
   * Builds a `(row, field) => string` accessor over a resolved map.
   * Returns '' for unknown fields so callers never crash on a missing column.
   */
  function createAccessor(map) {
    return function get(row, field) {
      const idx = map ? map[field] : undefined;
      if (!Number.isInteger(idx) || !row) return '';
      const v = row[idx];
      return v === null || v === undefined ? '' : String(v).trim();
    };
  }

  /** Console summary of what was resolved — detail only with `auh_debug` on. */
  function logResolution(source, resolution) {
    log.group(`[schema] ${source.key} — ${source.label}`, () => {
      log.table(
        Object.entries(resolution.columns).map(([field, info]) => ({
          field,
          index: info.index,
          header: info.header,
          via: info.via
        }))
      );
      if (resolution.unknownHeaders.length) log.debug('schema', 'أعمدة غير معروفة:', resolution.unknownHeaders);
    });
    resolution.issues.forEach(issue => {
      if (issue.level === 'error') log.error('schema', `${issue.source}.${issue.field}: ${issue.message}`);
      else if (issue.level === 'warn') log.warn('schema', `${issue.source}.${issue.field}: ${issue.message}`);
      else log.debug('schema', `${issue.source}.${issue.field}: ${issue.message}`);
    });
  }

  AUH.data.headers = { normalizeHeader, cleanHeader, resolveColumns, resolveList, createAccessor, logResolution };
})(typeof window !== 'undefined' ? window : globalThis);
