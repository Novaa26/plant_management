/* =========================================================
   LOCATION SERVICE
   Wraps the browser Geolocation API + free reverse-geocoding
   so the Weather Engine can resolve "lat/lon" into a readable
   city/province/country, and remembers the user's choice.
   ========================================================= */
(function (global) {
  const SAVED_KEY = "tumbuh_location";

  // Fallback location if geolocation is denied/unavailable and the
  // user hasn't set anything in Settings yet — central Java, matching
  // the app's own seed data ("Jawa Tengah").
  const DEFAULT_LOCATION = {
    lat: -6.9932,
    lon: 110.4203,
    city: "Semarang",
    province: "Jawa Tengah",
    country: "Indonesia",
    source: "default",
  };

  function readSaved() {
    try {
      const raw = localStorage.getItem(SAVED_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeSaved(loc) {
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(loc)); } catch (e) { /* ignore */ }
  }

  /** Ask the browser for the current GPS position. */
  function getCurrentPosition(timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      if (!("geolocation" in navigator)) {
        reject(new Error("Perangkat/peramban ini tidak mendukung Geolocation."));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        (err) => {
          const messages = {
            1: "Izin lokasi ditolak.",
            2: "Posisi tidak dapat ditentukan.",
            3: "Permintaan lokasi kehabisan waktu.",
          };
          reject(new Error(messages[err.code] || "Gagal mengambil lokasi."));
        },
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 }
      );
    });
  }

  /**
   * Reverse-geocode lat/lon into city/province/country using BigDataCloud's
   * free, key-less reverse geocoding endpoint. Degrades gracefully:
   * on failure we still return usable coordinates, just without names.
   */
  async function reverseGeocode(lat, lon) {
    try {
      const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=id`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Reverse geocoding gagal (" + res.status + ")");
      const data = await res.json();
      return {
        city: data.city || data.locality || data.principalSubdivision || "Lokasi Anda",
        province: data.principalSubdivision || "",
        country: data.countryName || "Indonesia",
      };
    } catch (e) {
      return { city: "Lokasi Anda", province: "", country: "" };
    }
  }

  const LocationService = {
    DEFAULT_LOCATION,

    getSavedLocation() {
      return readSaved();
    },

    setSavedLocation(loc) {
      writeSaved(loc);
      return loc;
    },

    /** Saved location, else default — never null. */
    resolveLocation() {
      return readSaved() || DEFAULT_LOCATION;
    },

    /**
     * Full "use my location" flow: GPS -> reverse geocode -> persist.
     * Throws if permission is denied or GPS is unavailable, so callers
     * can show a toast and keep using the previous location.
     */
    async useMyLocation() {
      const { lat, lon } = await getCurrentPosition();
      const names = await reverseGeocode(lat, lon);
      const loc = { lat, lon, ...names, source: "gps", updatedAt: Date.now() };
      writeSaved(loc);
      return loc;
    },

    /** Re-run reverse geocoding for an existing lat/lon (e.g. "Perbarui Lokasi"). */
    async refreshLocationNames(lat, lon) {
      const names = await reverseGeocode(lat, lon);
      const loc = { lat, lon, ...names, source: "gps", updatedAt: Date.now() };
      writeSaved(loc);
      return loc;
    },

    /** Manual location entry from Settings (city/province typed by hand + coords). */
    setManualLocation({ lat, lon, city, province, country }) {
      const loc = { lat: Number(lat), lon: Number(lon), city, province, country: country || "Indonesia", source: "manual", updatedAt: Date.now() };
      writeSaved(loc);
      return loc;
    },
  };

  global.LocationService = LocationService;
})(window);
