/**
 * Arabic-aware text helpers — the backbone of every search and every
 * cross-sheet join in the app. Pure functions, no DOM, no app state.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;

  /**
   * Normalizes Arabic text for comparison:
   * lowercase, unify alef/hamza/ya/ta-marbuta forms, drop the "ال" prefix,
   * strip diacritics, collapse whitespace.
   *
   * Everything that compares two Arabic strings must go through this, otherwise
   * "أحمد" and "احمد" (or "الاسم" and "اسم") are treated as different people.
   */
  function normAr(t) {
    if (!t) return '';
    let r = String(t).toLowerCase().trim();
    r = r.replace(/[أإآا]/g, 'ا').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ى/g, 'ا').replace(/ة/g, 'ه');
    r = r.replace(/\bال/g, '').replace(/^ال/, '');
    r = r.replace(/[\u064B-\u0652]/g, '').replace(/\s+/g, ' ').trim();
    return r;
  }

  /** Alias kept for readability at call sites that prepare a search subject. */
  function prepSearch(t) {
    return normAr(t);
  }

  /**
   * AND-semantics search: every normalized word of the query must appear
   * somewhere in the normalized text.
   */
  function smartSearch(text, query) {
    if (!query) return true;
    const nt = prepSearch(text);
    const ns = prepSearch(query);
    const words = ns.split(/\s+/).filter(w => w.length > 0);
    if (!words.length) return true;
    return words.every(w => nt.includes(w));
  }

  /**
   * Strict-but-forgiving equality used for cross-sheet joins (a name in the
   * on-call sheet vs. a name in the roster): equal after normalization, also
   * ignoring dots and spaces.
   */
  function exactNameMatch(a, b) {
    if (!a || !b) return false;
    const n1 = String(a).trim();
    const n2 = String(b).trim();
    if (n1 === n2) return true;
    const nn1 = normAr(n1);
    const nn2 = normAr(n2);
    if (nn1 === nn2) return true;
    return nn1.replace(/[.\s]/g, '') === nn2.replace(/[.\s]/g, '');
  }

  /**
   * Every word of the shorter name appears in the longer one (after
   * normalization) — used only as a last-resort fallback when joining two
   * sheets that spell the same person slightly differently.
   */
  function tokenSetMatch(a, b) {
    const ta = normAr(a).split(/\s+/).filter(Boolean);
    const tb = normAr(b).split(/\s+/).filter(Boolean);
    if (!ta.length || !tb.length) return false;
    const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
    if (short.length < 2) return false;
    const set = new Set(long);
    return short.every(w => set.has(w));
  }

  /** Splits a multi-name cell ("أحمد\nسمير - لؤي") into individual names. */
  function splitNames(t) {
    if (!t) return [];
    const lines = String(t).split(/[\n\r]+/);
    const out = [];
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      for (let part of line.split(/[-–—,،;؛\/\\|]+/)) {
        part = part.trim();
        if (part) out.push(part);
      }
    }
    return out;
  }

  /** Converts Arabic-Indic digits (٠١٢…) to ASCII. */
  function toAsciiDigits(v) {
    return String(v || '')
      .replace(/[\u0660-\u0669]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x0660 + 0x30))
      .replace(/[\u06F0-\u06F9]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x06f0 + 0x30));
  }

  /** Parses a number out of a sheet cell (Arabic digits, "٫"/"," decimal marks). Returns 0 when not a number. */
  function safeNum(v) {
    const n = parseFloat(toAsciiDigits(v).replace(/٫/g, '.').replace(/,/g, '.'));
    return Number.isFinite(n) ? n : 0;
  }

  /** True when the cell contains nothing but a number (e.g. the praise count "3"). */
  function isNumeric(v) {
    const s = toAsciiDigits(v).trim().replace(/٫/g, '.').replace(/,/g, '.');
    return s !== '' && /^-?\d+(\.\d+)?$/.test(s);
  }

  /** HTML-escapes a value before it is interpolated into markup. */
  function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Escapes a value for use inside a single-quoted inline JS handler. */
  function escapeJsString(s) {
    return String(s === null || s === undefined ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  /** Display helper: "-" for blanks, integers plain, decimals trimmed to 2 places. */
  function formatNumber(v) {
    if (v === null || v === undefined || v === '') return '-';
    const n = safeNum(v);
    if (!Number.isFinite(n)) return '-';
    return Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(2)));
  }

  /** "7 ساعات ونصف" → 7.5, "18 ساعة" → 18. */
  function parseDurationHours(s) {
    if (!s) return 0;
    const t = toAsciiDigits(s);
    const m = t.match(/(\d+(?:\.\d+)?)/);
    let n = m ? parseFloat(m[1]) : 0;
    if (/نصف/.test(s)) n += 0.5;
    return n;
  }

  AUH.text = {
    normAr,
    prepSearch,
    smartSearch,
    exactNameMatch,
    tokenSetMatch,
    splitNames,
    toAsciiDigits,
    safeNum,
    isNumeric,
    escapeHtml,
    escapeJsString,
    formatNumber,
    parseDurationHours
  };
})(typeof window !== 'undefined' ? window : globalThis);
