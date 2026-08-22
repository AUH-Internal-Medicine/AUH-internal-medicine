/**
 * Safe localStorage wrapper.
 *
 * Storage throws in more situations than people expect: Safari private mode,
 * iOS "block all cookies", a full quota, or a page opened from `file://` with
 * storage disabled. A throw used to be enough to abort `init()` half-way and
 * leave the page rendered but empty, so every access goes through here and
 * degrades to an in-memory fallback instead of throwing.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const memory = new Map();
  let available = null;

  function probe() {
    if (available !== null) return available;
    try {
      const key = '__auh_probe__';
      global.localStorage.setItem(key, '1');
      global.localStorage.removeItem(key);
      available = true;
    } catch (e) {
      available = false;
    }
    return available;
  }

  const storage = {
    /** True when the browser actually lets us persist anything. */
    get isPersistent() {
      return probe();
    },

    get(key) {
      if (probe()) {
        try {
          return global.localStorage.getItem(key);
        } catch (e) {
          /* fall through to memory */
        }
      }
      return memory.has(key) ? memory.get(key) : null;
    },

    set(key, value) {
      memory.set(key, String(value));
      if (!probe()) return false;
      try {
        global.localStorage.setItem(key, String(value));
        return true;
      } catch (e) {
        return false;
      }
    },

    remove(key) {
      memory.delete(key);
      if (!probe()) return;
      try {
        global.localStorage.removeItem(key);
      } catch (e) {
        /* ignore */
      }
    },

    /** All keys currently stored (persistent store first, memory as fallback). */
    keys() {
      if (!probe()) return Array.from(memory.keys());
      try {
        const out = [];
        for (let i = 0; i < global.localStorage.length; i++) {
          const k = global.localStorage.key(i);
          if (k) out.push(k);
        }
        return out;
      } catch (e) {
        return Array.from(memory.keys());
      }
    }
  };

  AUH.storage = storage;
})(typeof window !== 'undefined' ? window : globalThis);
