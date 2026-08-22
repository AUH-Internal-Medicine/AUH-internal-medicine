/**
 * AUH — root namespace.
 *
 * The app is a no-build static site: every file below is a classic <script>
 * loaded in dependency order from index.html. To keep that manageable, each file
 * attaches exactly one branch to this single global object instead of leaking
 * dozens of bare globals.
 *
 * Layer order (a layer may only use the ones above it):
 *
 *   core/     — configuration + pure helpers (no DOM, no data knowledge)
 *   data/     — the Google-Sheet contract: schema, header resolution, transport, parsers
 *   domain/   — business rules computed from parsed data (schedules, statistics, evaluation)
 *   views/    — DOM rendering, mixed into HospitalApp.prototype
 *   app.js    — the HospitalApp orchestrator + bootstrap
 *
 * Only the handful of functions referenced from inline HTML `onclick=""`
 * attributes are exposed as bare globals (see core/ui-kit.js) — everything else
 * lives here.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH || (global.AUH = {});

  AUH.version = '2.0.0';
  AUH.core = AUH.core || {};
  AUH.data = AUH.data || {};
  AUH.parse = AUH.parse || {};
  AUH.domain = AUH.domain || {};
  AUH.views = AUH.views || {};
})(typeof window !== 'undefined' ? window : globalThis);
