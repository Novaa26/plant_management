/* =========================================================
   WEATHER SERVICE
   The single source of truth for weather data in the app.
   Responsibilities:
     - Try providers in order (Open-Meteo -> WeatherAPI ->
       OpenWeatherMap -> BMKG), automatically skipping any
       that aren't configured or that fail.
     - Fall back to the last cached snapshot if every provider
       fails, and to a clear "no data" state if there's no
       cache either — the site itself never throws/breaks.
     - Cache every successful fetch.
     - Auto-refresh every 5 minutes.
     - Publish state changes via subscribe() so UI/AI/notif
       modules can react without polling.
   ========================================================= */
(function (global) {
  const CACHE_KEY = "weather_snapshot";
  const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
  const SETTINGS_KEY = "spm_settings"; // same key the main app uses for AppState.settings

  function readAppSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  const WeatherService = {
    state: {
      status: "idle", // idle | loading | online | cached | offline
      provider: null,
      current: null,
      forecast: null,
      location: null,
      lastUpdated: null,
      error: null,
    },
    _listeners: [],
    _timer: null,

    subscribe(fn) {
      this._listeners.push(fn);
      return () => { this._listeners = this._listeners.filter((f) => f !== fn); };
    },

    _notify() {
      this._listeners.forEach((fn) => {
        try { fn(this.state); } catch (e) { console.error("WeatherService listener error", e); }
      });
    },

    /** Ordered fallback chain. Each entry is skipped (not "failed") if unconfigured. */
    async _tryProviders(lat, lon) {
      const settings = readAppSettings();
      const attempts = [
        { label: "Open-Meteo", run: () => global.WeatherProviders.openMeteo.fetchWeather(lat, lon) },
        {
          label: "WeatherAPI",
          run: () => settings.weatherApiKey
            ? global.WeatherProviders.weatherApi.fetchWeather(lat, lon, settings.weatherApiKey)
            : Promise.reject(new Error("dilewati — API key belum diatur")),
        },
        {
          label: "OpenWeatherMap",
          run: () => settings.owmApiKey
            ? global.WeatherProviders.openWeatherMap.fetchWeather(lat, lon, settings.owmApiKey)
            : Promise.reject(new Error("dilewati — API key belum diatur")),
        },
        {
          label: "BMKG",
          run: () => settings.bmkgAdm4
            ? global.WeatherProviders.bmkg.fetchWeather(lat, lon, settings.bmkgAdm4)
            : Promise.reject(new Error("dilewati — kode wilayah belum diatur")),
        },
      ];

      const failures = [];
      for (const attempt of attempts) {
        try {
          const data = await attempt.run();
          return data;
        } catch (e) {
          failures.push(`${attempt.label}: ${e.message}`);
        }
      }
      const err = new Error("Semua provider cuaca gagal — " + failures.join(" | "));
      err.failures = failures;
      throw err;
    },

    /** Fetch fresh data (or fall back to cache / offline state). Never throws. */
    async refresh() {
      this.state = { ...this.state, status: "loading" };
      this._notify();

      const loc = global.LocationService.resolveLocation();

      try {
        const data = await this._tryProviders(loc.lat, loc.lon);
        this.state = {
          status: "online",
          provider: data.provider,
          current: data.current,
          forecast: data.forecast,
          location: loc,
          lastUpdated: new Date(),
          error: null,
        };
        global.CacheService.set(CACHE_KEY, { current: data.current, forecast: data.forecast, provider: data.provider, location: loc });
      } catch (e) {
        const cached = global.CacheService.get(CACHE_KEY);
        if (cached) {
          this.state = {
            status: "cached",
            provider: cached.value.provider,
            current: cached.value.current,
            forecast: cached.value.forecast,
            location: cached.value.location || loc,
            lastUpdated: new Date(cached.savedAt),
            error: "Semua provider cuaca sedang tidak dapat diakses — menampilkan data tersimpan terakhir.",
          };
        } else {
          this.state = {
            status: "offline",
            provider: null, current: null, forecast: null,
            location: loc, lastUpdated: null,
            error: "Data cuaca belum dapat diperoleh. Periksa koneksi internet Anda.",
          };
        }
      }

      this._notify();
      return this.state;
    },

    /** Start the engine: first fetch + 5-minute auto-refresh loop. */
    init() {
      if (this._timer) return; // already running
      this.refresh();
      this._timer = setInterval(() => this.refresh(), REFRESH_INTERVAL_MS);
    },

    stop() {
      clearInterval(this._timer);
      this._timer = null;
    },

    /** Switch location (from geolocation or manual settings) and refresh immediately. */
    async useLocation(loc) {
      global.LocationService.setSavedLocation(loc);
      return this.refresh();
    },
  };

  global.WeatherService = WeatherService;
})(window);
