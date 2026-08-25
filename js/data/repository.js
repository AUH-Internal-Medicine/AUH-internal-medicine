/**
 * The data repository — the single seam between "where the data comes from" and
 * "what the app does with it".
 *
 *   loadAll()  → fetch every source in parallel, parse, return a dataset
 *   parseAll() → raw tables → dataset (also used for cached data)
 *   cache      → the raw tables are what gets cached, so a cached start renders
 *                exactly what a fresh start renders
 *
 * The views and the domain layer only ever see the dataset. Swapping Google
 * Sheets for a REST/DB backend means writing one more branch in `fetchAll()`
 * (and, if the backend already returns records, one more branch in `parseAll`),
 * and nothing else in the app changes. See docs/BACKEND-MIGRATION.md.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const log = AUH.log;

  /** Sources fetched on every load, mapped to their dataset key. */
  const SOURCES = [
    { schemaKey: 'residents', datasetKey: 'residents' },
    { schemaKey: 'oncall', datasetKey: 'oncall' },
    { schemaKey: 'oncallYear2', datasetKey: 'oncallYear2' },
    { schemaKey: 'oncallAdjustments', datasetKey: 'adjustments' },
    { schemaKey: 'evaluation', datasetKey: 'evaluation' },
    { schemaKey: 'links', datasetKey: 'links' },
    { schemaKey: 'qa', datasetKey: 'qa' },
    { schemaKey: 'lectures', datasetKey: 'lectures' },
    { schemaKey: 'holidays', datasetKey: 'holidays' },
    { schemaKey: 'oncallRules', datasetKey: 'rules' }
  ];

  /** Picks the client for a source: the backend when configured, else the sheets. */
  function clientFor() {
    const mode = AUH.config.dataSource || 'auto';
    const apiReady = AUH.data.api && AUH.data.api.isConfigured();
    if (mode === 'api') return { primary: AUH.data.api, fallback: null };
    if (mode === 'gviz') return { primary: AUH.data.gviz, fallback: null };
    // 'auto': backend first when configured, sheets as the safety net.
    return apiReady ? { primary: AUH.data.api, fallback: AUH.data.gviz } : { primary: AUH.data.gviz, fallback: null };
  }

  /**
   * Fetches every source in parallel.
   * @returns {{tables:Object, ok:string[], failed:string[], source:string}}
   *          A failed source is simply absent from `tables` — the caller keeps
   *          whatever it already had for it.
   */
  async function fetchAll() {
    const schema = AUH.data.schema;
    const { primary, fallback } = clientFor();

    const results = await Promise.all(
      SOURCES.map(async s => {
        const source = schema[s.schemaKey];
        let table = await primary.fetchSource(source);
        if (!table && fallback) table = await fallback.fetchSource(source);
        return table;
      })
    );

    const tables = {};
    const ok = [];
    const failed = [];
    SOURCES.forEach((s, i) => {
      if (results[i]) {
        tables[s.datasetKey] = results[i];
        ok.push(s.schemaKey);
      } else {
        failed.push(s.schemaKey);
      }
    });

    if (failed.length) log.warn('repository', `تعذر تحميل ${failed.length} مصدر: ${failed.join(', ')}`);

    return { tables, ok, failed, source: primary === AUH.data.api ? 'api' : 'gviz' };
  }

  /**
   * Raw tables → parsed dataset. Every key is always present (empty models when
   * a source failed), so nothing downstream needs null checks.
   */
  function parseAll(raw, previous) {
    const source = raw || {};
    const prev = previous || {};

    const residents = source.residents ? AUH.parse.residents(source.residents) : prev.residents || AUH.parse.emptyResidents();
    const oncall = source.oncall ? AUH.parse.oncall(source.oncall) : prev.oncall || AUH.parse.emptyOncall('oncall');
    const oncallYear2 = source.oncallYear2
      ? AUH.parse.oncallYear2(source.oncallYear2)
      : prev.oncallYear2 || AUH.parse.emptyOncall('oncallYear2');
    const adjustments = source.adjustments ? AUH.parse.oncallAdjustments(source.adjustments) : prev.adjustments || { entries: [] };
    const evaluation = source.evaluation ? AUH.parse.evaluation(source.evaluation) : prev.evaluation || AUH.parse.emptyEvaluation();
    const links = source.links ? AUH.parse.links(source.links) : prev.links || { list: [] };
    const qa = source.qa ? AUH.parse.qa(source.qa) : prev.qa || { list: [], categories: [] };
    const lectures = source.lectures ? AUH.parse.lectures(source.lectures) : prev.lectures || { list: [] };
    const holidays = source.holidays ? AUH.parse.holidays(source.holidays) : prev.holidays || AUH.parse.emptyHolidays();
    const rules = source.rules ? AUH.parse.oncallRules(source.rules) : prev.rules || { annualHolidays: new Set() };

    const dataset = {
      residents,
      oncall,
      oncallYear2,
      adjustments,
      evaluation,
      links,
      qa,
      lectures,
      holidays,
      rules,
      fetchedAt: Date.now()
    };

    dataset.issues = []
      .concat(residents.issues || [], oncall.issues || [], evaluation.issues || [], links.issues || [], qa.issues || [], lectures.issues || [], holidays.issues || [])
      .filter(Boolean);

    return dataset;
  }

  /* ------------------------------------------------------------------ cache */

  /**
   * Cheap content signature of the fetched tables. Used to answer "did the
   * Google Sheet actually change?" so a background refresh that brings back
   * identical data costs nothing and disturbs nobody.
   */
  function tablesSignature(tables) {
    let hash = 5381;
    for (const key of Object.keys(tables || {}).sort()) {
      const text = JSON.stringify(tables[key]);
      if (!text) continue;
      hash = ((hash * 33) ^ key.length) >>> 0;
      for (let i = 0; i < text.length; i++) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
    }
    return hash.toString(36);
  }

  /** True when a payload actually holds the data the site is built around. */
  function hasUsefulData(tables) {
    return !!(tables && Array.isArray(tables.residents) && tables.residents.length > 1);
  }

  function readCache() {
    try {
      const raw = AUH.storage.get(AUH.config.cacheKey);
      if (!raw) return null;
      const payload = JSON.parse(raw);
      if (!payload || !payload.timestamp) return null;
      if (Date.now() - payload.timestamp > AUH.config.cacheTtlMs) return null;
      // An empty payload would render an empty site instantly and hide the real
      // problem, so it is treated as no cache at all.
      return hasUsefulData(payload.sources) ? payload.sources : null;
    } catch (e) {
      return null;
    }
  }

  function writeCache(rawTables) {
    // Never persist emptiness: a failed load must not poison the next visit.
    if (!hasUsefulData(rawTables)) {
      log.debug('repository', 'تم تخطي حفظ النسخة المؤقتة (لا توجد بيانات كافية)');
      return;
    }
    const saved = AUH.storage.set(
      AUH.config.cacheKey,
      JSON.stringify({ timestamp: Date.now(), version: AUH.config.cacheVersion, sources: rawTables })
    );
    if (!saved) log.debug('repository', 'تعذر حفظ النسخة المؤقتة (التخزين غير متاح)');
  }

  /** Removes caches written by older versions/builds of the app. */
  function clearOldCaches() {
    AUH.storage
      .keys()
      .filter(k => k.startsWith('hc_v'))
      .forEach(k => AUH.storage.remove(k));
  }

  AUH.data.repository = { SOURCES, clientFor, fetchAll, parseAll, readCache, writeCache, clearOldCaches, hasUsefulData, tablesSignature };
})(typeof window !== 'undefined' ? window : globalThis);
