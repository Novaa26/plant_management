/* =========================================================
   CACHE SERVICE
   Thin wrapper around localStorage with timestamps, used so
   the Weather Engine can fall back to "last known good data"
   when every provider is unreachable. Falls back to an
   in-memory object if localStorage isn't available (same
   pattern as the main app's Storage helper).
   ========================================================= */
(function (global) {
  const PREFIX = "tumbuh_cache:";
  const memory = {};

  function safeParse(raw, fallback) {
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }

  const CacheService = {
    /** Store a value with the current timestamp. */
    set(key, value) {
      const record = { value, savedAt: Date.now() };
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(record));
      } catch (e) {
        memory[key] = record;
      }
      return record;
    },

    /** Retrieve { value, savedAt } or null if missing/corrupt. */
    get(key) {
      try {
        const raw = localStorage.getItem(PREFIX + key);
        if (raw === null) return memory[key] || null;
        return safeParse(raw, null);
      } catch (e) {
        return memory[key] || null;
      }
    },

    /** True if the cached entry is older than maxAgeMs (or missing). */
    isStale(key, maxAgeMs) {
      const record = this.get(key);
      if (!record) return true;
      return Date.now() - record.savedAt > maxAgeMs;
    },

    remove(key) {
      try { localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ }
      delete memory[key];
    },
  };

  global.CacheService = CacheService;
})(window);
