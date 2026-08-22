/**
 * Transport layer — the ONLY place that knows the data comes from Google Sheets.
 *
 * Both endpoints are normalized to the same in-memory shape:
 *     [ headerRow, ...dataRows ]   // every row an array of strings
 * so parsers never care whether a tab was fetched as CSV, as gviz JSON, or via
 * the JSONP fallback.
 *
 * Two transports, because one is not enough:
 *
 *   fetch  — the normal path. Google echoes the page's Origin back in
 *            `Access-Control-Allow-Origin`, so this works from any http(s)
 *            origin (localhost, GitHub Pages, a future server).
 *   JSONP  — a plain <script> tag with `tqx=out:json;responseHandler:CB`.
 *            Script tags are not subject to CORS, so this keeps working when
 *            the page is opened directly from disk (file://), where the Origin
 *            is `null` and Google returns no CORS header at all — which is
 *            exactly the case where fetch silently returns nothing.
 *
 * When the app moves to a real backend, `api-client.js` provides the same
 * `fetchSource(source)` contract — see docs/BACKEND-MIGRATION.md.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const log = AUH.log;

  const BASE = 'https://docs.google.com/spreadsheets/d';
  let jsonpSeq = 0;

  function endpoint(spreadsheetId, gid, format, extra) {
    const out = format === 'json' ? 'json' : 'csv';
    const tqx = extra && extra.responseHandler ? `out:${out};responseHandler:${extra.responseHandler}` : `out:${out}`;
    return `${BASE}/${spreadsheetId}/gviz/tq?tqx=${encodeURIComponent(tqx).replace(/%3A/g, ':').replace(/%3B/g, ';')}&gid=${gid}&_=${Date.now()}`;
  }

  /* --------------------------------------------------------------- CSV parsing */

  /** Splits one CSV line, honouring quotes and doubled quotes. */
  function parseCSVLine(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes) {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          inQuotes = true;
        }
      } else if (ch === ',' && !inQuotes) {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current);
    return fields;
  }

  /**
   * Quote-aware CSV parser that also handles multi-line quoted cells (on-call
   * cells hold several names separated by newlines). Stops after 10 consecutive
   * blank rows so a sheet with 1000 empty trailing rows costs nothing.
   */
  function parseCSV(text) {
    const result = [];
    const lines = String(text || '').split(/\r?\n/);
    let currentRow = [];
    let currentField = '';
    let inQuotes = false;
    let emptyStreak = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (inQuotes) {
        const qi = line.indexOf('"');
        if (qi !== -1) {
          currentField += '\n' + line.substring(0, qi);
          inQuotes = false;
          currentRow.push(currentField);
          currentField = '';

          const rest = line.substring(qi + 1);
          if (rest.startsWith(',')) {
            for (const f of parseCSVLine(rest.substring(1))) currentRow.push(f);
          }

          if (currentRow.some(c => c !== '')) {
            result.push(currentRow);
            emptyStreak = 0;
          } else if (++emptyStreak >= 10) {
            break;
          }
          currentRow = [];
        } else {
          currentField += '\n' + line;
        }
        continue;
      }

      const fields = parseCSVLine(line);
      if (fields.some(c => c !== '')) {
        result.push(fields);
        emptyStreak = 0;
      } else if (++emptyStreak >= 10) {
        break;
      }
    }

    if (currentRow.length && currentRow.some(c => c !== '')) result.push(currentRow);
    return result;
  }

  /* -------------------------------------------------------------- gviz JSON */

  /**
   * One gviz cell → string.
   * - dates become ISO `YYYY-MM-DD` (the formatted value is locale-dependent and
   *   `28/06` vs `06/28` cannot be told apart afterwards)
   * - numbers use the FORMATTED value, so a phone number typed as a number keeps
   *   its leading zero
   */
  function cellValue(cell) {
    if (!cell) return '';
    const v = cell.v;
    const f = cell.f;
    if (typeof v === 'string' && /^Date\(/.test(v)) return AUH.dates.parseGvizDate(v) || v;
    if (v === null || v === undefined) return f === null || f === undefined ? '' : String(f);
    if (typeof v === 'number' && f !== null && f !== undefined) return String(f);
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return String(v);
  }

  /**
   * gviz JSON payload → `[headers, ...rows]`.
   *
   * gviz decides on its own whether the first sheet row is a header. When it
   * decides it is not (all column labels come back empty — this happens with the
   * Year-2 on-call sheet), the real header row is sitting at the top of `rows`,
   * so it is promoted here. Without this the JSONP path would lose every
   * category name while the CSV path kept them.
   */
  function flattenGvizTable(json) {
    if (!json || !json.table) return null;
    const cols = json.table.cols || [];
    const rows = json.table.rows || [];

    const labels = cols.map(c => (c && c.label ? String(c.label) : ''));
    const body = [];
    for (const row of rows) {
      const values = (row && row.c ? row.c : []).map(cellValue);
      if (values.some(v => v !== '')) body.push(values);
    }

    if (labels.every(l => !l) && body.length) return body;
    return [labels, ...body];
  }

  /* ------------------------------------------------------------- transports */

  function withTimeout(promise, ms, onTimeout) {
    return new Promise(resolve => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        if (onTimeout) onTimeout();
        resolve(null);
      }, ms);
      promise.then(value => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      });
    });
  }

  /** Fetches a tab as CSV. Returns null on any failure. */
  async function fetchCSV(spreadsheetId, gid, label) {
    try {
      const res = await fetch(endpoint(spreadsheetId, gid, 'csv'), { cache: 'no-store' });
      if (!res.ok) {
        log.warn('fetch', `${label || gid}: HTTP ${res.status}`);
        return null;
      }
      const text = new TextDecoder('utf-8').decode(await res.arrayBuffer());
      if (text.includes('<!DOCTYPE') || text.includes('<html')) {
        log.warn('fetch', `${label || gid}: تم إرجاع صفحة HTML بدل البيانات — تأكد أن الشيت مشارَك للقراءة العامة`);
        return null;
      }
      return parseCSV(text);
    } catch (e) {
      log.debug('fetch', `${label || gid}: ${e && e.message}`);
      return null;
    }
  }

  /** Fetches a tab as gviz JSON. Returns null on any failure. */
  async function fetchJSON(spreadsheetId, gid, label) {
    try {
      const res = await fetch(endpoint(spreadsheetId, gid, 'json'), { cache: 'no-store' });
      if (!res.ok) {
        log.warn('fetch', `${label || gid}: HTTP ${res.status}`);
        return null;
      }
      const raw = await res.text();
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}') + 1;
      if (start === -1 || end === 0) return null;
      return flattenGvizTable(JSON.parse(raw.substring(start, end)));
    } catch (e) {
      log.debug('fetch', `${label || gid}: ${e && e.message}`);
      return null;
    }
  }

  /**
   * Fetches a tab with a <script> tag (JSONP). Not subject to CORS, so this is
   * the path that works from file:// and behind proxies that strip CORS headers.
   */
  function fetchJSONP(spreadsheetId, gid, label) {
    if (!global.document) return Promise.resolve(null);

    const callback = `__auhGviz${Date.now().toString(36)}_${jsonpSeq++}`;
    const script = document.createElement('script');
    let cleanup = () => {};

    const request = new Promise(resolve => {
      cleanup = () => {
        try {
          delete global[callback];
        } catch (e) {
          global[callback] = undefined;
        }
        if (script.parentNode) script.parentNode.removeChild(script);
      };

      global[callback] = payload => {
        let table = null;
        try {
          table = flattenGvizTable(payload);
        } catch (e) {
          table = null;
        }
        cleanup();
        resolve(table);
      };

      script.src = endpoint(spreadsheetId, gid, 'json', { responseHandler: callback });
      script.async = true;
      script.onerror = () => {
        log.warn('fetch', `${label || gid}: تعذر تحميل البيانات عبر JSONP`);
        cleanup();
        resolve(null);
      };
      document.head.appendChild(script);
    });

    return withTimeout(request, AUH.config.requestTimeoutMs, () => {
      log.warn('fetch', `${label || gid}: انتهت مهلة الطلب`);
      cleanup();
    });
  }

  /** True when the page cannot use CORS at all (opened straight from disk). */
  function isFileProtocol() {
    return !!(global.location && global.location.protocol === 'file:');
  }

  /**
   * Fetches one schema source, choosing the transport that can actually work
   * here and falling back to the other one if it returns nothing.
   */
  async function fetchSource(source) {
    const spreadsheetId = AUH.config.spreadsheets[source.spreadsheet];
    if (!spreadsheetId) {
      log.error('fetch', `لا يوجد معرّف جدول للمصدر "${source.key}" (${source.spreadsheet})`);
      return null;
    }

    const mode = AUH.config.sheetsTransport || 'auto';
    const preferJsonp = mode === 'jsonp' || (mode === 'auto' && isFileProtocol());

    if (preferJsonp) {
      const viaJsonp = await fetchJSONP(spreadsheetId, source.gid, source.key);
      if (viaJsonp || mode === 'jsonp') return viaJsonp;
    }

    const viaFetch =
      source.format === 'json'
        ? await fetchJSON(spreadsheetId, source.gid, source.key)
        : await fetchCSV(spreadsheetId, source.gid, source.key);
    if (viaFetch || mode === 'fetch') return viaFetch;

    // fetch was blocked (CORS/offline/proxy) — try the script-tag path once.
    if (!preferJsonp) {
      log.debug('fetch', `${source.key}: تعذر الجلب المباشر، محاولة عبر JSONP`);
      return fetchJSONP(spreadsheetId, source.gid, source.key);
    }
    return null;
  }

  AUH.data.gviz = {
    parseCSV,
    parseCSVLine,
    flattenGvizTable,
    cellValue,
    fetchCSV,
    fetchJSON,
    fetchJSONP,
    fetchSource,
    endpoint,
    isFileProtocol
  };
})(typeof window !== 'undefined' ? window : globalThis);
