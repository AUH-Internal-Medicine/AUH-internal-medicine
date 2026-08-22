/**
 * JSON backend client — the future data source, inert until configured.
 *
 * It implements the SAME contract as `gviz-client.js`:
 *     fetchSource(source) -> Promise<[headerRow, ...rows] | null>
 *
 * so switching the whole site over to a server is one setting:
 *
 *     AUH.config.apiBaseUrl = 'https://api.example.com';   // js/core/config.js
 *
 * With `dataSource: 'auto'` (the default) the app uses the API when a base URL
 * is set and silently falls back to Google Sheets if the API is unreachable —
 * so the site keeps working during the migration, and on the day the server
 * goes down.
 *
 * Expected endpoint: GET {apiBaseUrl}/tables/{sourceKey}
 * Expected body: either
 *   a) [["ت","الاسم الثلاثي", …], ["1","رزان …", …]]        ← rows, header first
 *   b) {"headers":[…], "rows":[[…], …]}                     ← same, wrapped
 * Anything else is rejected, so a stray HTML error page can never be mistaken
 * for data. See docs/BACKEND-MIGRATION.md.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const log = AUH.log;

  /** True when a backend has been configured at all. */
  function isConfigured() {
    return !!(AUH.config.apiBaseUrl && String(AUH.config.apiBaseUrl).trim());
  }

  function url(source) {
    const base = String(AUH.config.apiBaseUrl).replace(/\/+$/, '');
    return `${base}/tables/${encodeURIComponent(source.key)}?_=${Date.now()}`;
  }

  /** Accepts both supported body shapes and normalizes to `[headers, ...rows]`. */
  function normalize(payload) {
    if (Array.isArray(payload)) {
      return payload.every(Array.isArray) ? payload : null;
    }
    if (payload && Array.isArray(payload.rows)) {
      const headers = Array.isArray(payload.headers) ? payload.headers : [];
      return [headers, ...payload.rows];
    }
    return null;
  }

  async function fetchSource(source) {
    if (!isConfigured()) return null;
    try {
      const res = await fetch(url(source), {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        credentials: 'omit'
      });
      if (!res.ok) {
        log.warn('api', `${source.key}: HTTP ${res.status}`);
        return null;
      }
      const table = normalize(await res.json());
      if (!table) {
        log.warn('api', `${source.key}: شكل استجابة غير متوقع`);
        return null;
      }
      return table;
    } catch (e) {
      log.warn('api', `${source.key}: ${e && e.message}`);
      return null;
    }
  }

  AUH.data.api = { isConfigured, fetchSource, normalize, url };
})(typeof window !== 'undefined' ? window : globalThis);
