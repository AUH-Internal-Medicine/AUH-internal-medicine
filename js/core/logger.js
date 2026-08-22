/**
 * Tiny logging facade.
 *
 * Rationale: the old code sprinkled `console.log` calls for Year-2 / adjustments
 * parsing that shipped to every visitor's console. Everything goes through here
 * now: warnings and errors are always shown (they mean the sheet or the network
 * misbehaved and someone should look), while chatty per-parse detail only shows
 * when debugging is enabled with `localStorage.setItem('auh_debug','1')`.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const con = global.console || { log() {}, warn() {}, error() {}, groupCollapsed() {}, groupEnd() {}, table() {} };

  function prefix(scope) {
    return scope ? `[${scope}]` : '[AUH]';
  }

  const logger = {
    /** Verbose detail — hidden unless AUH.config.debug is on. */
    debug(scope, ...args) {
      if (AUH.config && AUH.config.debug) con.log(prefix(scope), ...args);
    },
    /** Something worth knowing but harmless. */
    info(scope, ...args) {
      if (AUH.config && AUH.config.debug) con.log(prefix(scope), ...args);
    },
    /** The data or the network is not what we expected — always shown. */
    warn(scope, ...args) {
      con.warn(prefix(scope), ...args);
    },
    /** A failure that broke something — always shown. */
    error(scope, ...args) {
      con.error(prefix(scope), ...args);
    },
    /** Collapsed console group used by the data-health report. */
    group(title, fn) {
      if (!(AUH.config && AUH.config.debug)) return;
      if (con.groupCollapsed) con.groupCollapsed(title);
      try {
        fn();
      } finally {
        if (con.groupEnd) con.groupEnd();
      }
    },
    table(rows) {
      if (con.table) con.table(rows);
      else con.log(rows);
    }
  };

  AUH.log = logger;
})(typeof window !== 'undefined' ? window : globalThis);
