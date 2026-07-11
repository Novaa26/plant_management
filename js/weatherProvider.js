/* =========================================================
   WEATHER PROVIDERS
   Each provider exposes: { name, requiresKey, fetchWeather(lat, lon, opts) }
   fetchWeather() always resolves to the SAME normalized shape:

   {
     provider: "Open-Meteo",
     fetchedAt: Date,
     current: {
       tempC, feelsLikeC, tempMaxC, tempMinC, humidity,
       precipitationMm, rainChance, windSpeedKmh, windDirDeg, windDirLabel,
       pressureHpa, uvIndex, cloudCoverPct, dewPointC,
       sunrise, sunset, soilTempC, soilMoisturePct,
       weatherCode, icon, description,
     },
     forecast: [
       { date, icon, description, tempMin, tempMax, rainChance,
         precipitationMm, windSpeedKmh, uvIndex }, ... up to 7 entries
     ]
   }

   Adding a new provider later = adding one more object here with
   the same fetchWeather() contract, then registering it in
   weatherService.js's provider chain.
   ========================================================= */
(function (global) {
  const KMH_PER_MS = 3.6;

  function windDirLabel(deg) {
    if (deg === null || deg === undefined || isNaN(deg)) return "-";
    const dirs = ["Utara", "Timur Laut", "Timur", "Tenggara", "Selatan", "Barat Daya", "Barat", "Barat Laut"];
    return dirs[Math.round(deg / 45) % 8];
  }

  // WMO weather codes (used by Open-Meteo) -> icon + Indonesian description.
  const WMO_CODE_MAP = {
    0: ["☀️", "Cerah"], 1: ["🌤️", "Cerah Berawan"], 2: ["⛅", "Berawan Sebagian"], 3: ["☁️", "Mendung"],
    45: ["🌫️", "Berkabut"], 48: ["🌫️", "Kabut Beku"],
    51: ["🌦️", "Gerimis Ringan"], 53: ["🌦️", "Gerimis"], 55: ["🌦️", "Gerimis Lebat"],
    56: ["🌦️", "Gerimis Beku"], 57: ["🌦️", "Gerimis Beku Lebat"],
    61: ["🌧️", "Hujan Ringan"], 63: ["🌧️", "Hujan"], 65: ["🌧️", "Hujan Lebat"],
    66: ["🌧️", "Hujan Beku"], 67: ["🌧️", "Hujan Beku Lebat"],
    71: ["🌨️", "Salju Ringan"], 73: ["🌨️", "Salju"], 75: ["🌨️", "Salju Lebat"], 77: ["🌨️", "Butiran Salju"],
    80: ["🌦️", "Hujan Lokal Ringan"], 81: ["🌧️", "Hujan Lokal"], 82: ["⛈️", "Hujan Lokal Lebat"],
    85: ["🌨️", "Salju Lokal Ringan"], 86: ["🌨️", "Salju Lokal Lebat"],
    95: ["⛈️", "Badai Petir"], 96: ["⛈️", "Badai Petir + Hujan Es"], 99: ["⛈️", "Badai Petir Lebat"],
  };
  function describeWmo(code) {
    return WMO_CODE_MAP[code] || ["🌡️", "Tidak diketahui"];
  }

  async function fetchJson(url, timeoutMs = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------------- Open-Meteo (default, no API key) ---------------- */
  const openMeteo = {
    name: "Open-Meteo",
    requiresKey: false,
    async fetchWeather(lat, lon) {
      const current = [
        "temperature_2m", "relative_humidity_2m", "apparent_temperature", "precipitation",
        "weather_code", "cloud_cover", "pressure_msl", "wind_speed_10m", "wind_direction_10m",
        "dew_point_2m", "uv_index", "soil_temperature_0cm", "soil_moisture_0_to_1cm",
      ].join(",");
      const hourly = ["precipitation_probability", "uv_index"].join(",");
      const daily = [
        "weather_code", "temperature_2m_max", "temperature_2m_min", "precipitation_sum",
        "precipitation_probability_max", "wind_speed_10m_max", "uv_index_max", "sunrise", "sunset",
      ].join(",");
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=${current}&hourly=${hourly}&daily=${daily}&timezone=auto&forecast_days=7`;
      const data = await fetchJson(url);
      if (!data.current) throw new Error("Open-Meteo: respons tidak lengkap");

      const [icon, description] = describeWmo(data.current.weather_code);
      // Nearest-hour rain chance, since `current` itself has no probability field.
      let rainChance = 0;
      if (data.hourly && data.hourly.time) {
        const idx = data.hourly.time.indexOf(data.current.time);
        if (idx !== -1 && data.hourly.precipitation_probability) rainChance = data.hourly.precipitation_probability[idx] ?? 0;
      }

      const current_ = {
        tempC: round1(data.current.temperature_2m),
        feelsLikeC: round1(data.current.apparent_temperature),
        tempMaxC: round1(data.daily?.temperature_2m_max?.[0]),
        tempMinC: round1(data.daily?.temperature_2m_min?.[0]),
        humidity: Math.round(data.current.relative_humidity_2m),
        precipitationMm: round1(data.current.precipitation),
        rainChance: Math.round(rainChance),
        windSpeedKmh: round1(data.current.wind_speed_10m),
        windDirDeg: data.current.wind_direction_10m,
        windDirLabel: windDirLabel(data.current.wind_direction_10m),
        pressureHpa: Math.round(data.current.pressure_msl),
        uvIndex: round1(data.daily?.uv_index_max?.[0] ?? null),
        cloudCoverPct: Math.round(data.current.cloud_cover),
        dewPointC: round1(data.current.dew_point_2m),
        sunrise: data.daily?.sunrise?.[0] || null,
        sunset: data.daily?.sunset?.[0] || null,
        soilTempC: round1(data.current.soil_temperature_0cm),
        soilMoisturePct: data.current.soil_moisture_0_to_1cm != null ? Math.round(data.current.soil_moisture_0_to_1cm * 100) : null,
        weatherCode: data.current.weather_code,
        icon, description,
      };

      const forecast = (data.daily?.time || []).slice(0, 7).map((date, i) => {
        const [ico, desc] = describeWmo(data.daily.weather_code[i]);
        return {
          date,
          icon: ico, description: desc,
          tempMin: round1(data.daily.temperature_2m_min[i]),
          tempMax: round1(data.daily.temperature_2m_max[i]),
          rainChance: Math.round(data.daily.precipitation_probability_max?.[i] ?? 0),
          precipitationMm: round1(data.daily.precipitation_sum?.[i]),
          windSpeedKmh: round1(data.daily.wind_speed_10m_max?.[i]),
          uvIndex: round1(data.daily.uv_index_max?.[i]),
        };
      });

      return { provider: "Open-Meteo", fetchedAt: new Date(), current: current_, forecast };
    },
  };

  /* ---------------- WeatherAPI.com (needs API key) ---------------- */
  const weatherApi = {
    name: "WeatherAPI",
    requiresKey: true,
    async fetchWeather(lat, lon, apiKey) {
      if (!apiKey) throw new Error("WeatherAPI: API key belum diatur di Pengaturan");
      const url = `https://api.weatherapi.com/v1/forecast.json?key=${encodeURIComponent(apiKey)}&q=${lat},${lon}&days=7&aqi=no&alerts=no`;
      const data = await fetchJson(url);
      if (!data.current) throw new Error("WeatherAPI: respons tidak lengkap");

      const c = data.current;
      const today = data.forecast?.forecastday?.[0]?.day;
      const current_ = {
        tempC: c.temp_c, feelsLikeC: c.feelslike_c,
        tempMaxC: today ? today.maxtemp_c : null, tempMinC: today ? today.mintemp_c : null,
        humidity: c.humidity, precipitationMm: c.precip_mm,
        rainChance: today ? today.daily_chance_of_rain : 0,
        windSpeedKmh: c.wind_kph, windDirDeg: c.wind_degree, windDirLabel: windDirLabel(c.wind_degree),
        pressureHpa: Math.round(c.pressure_mb), uvIndex: c.uv, cloudCoverPct: c.cloud,
        dewPointC: null,
        sunrise: data.forecast?.forecastday?.[0]?.astro?.sunrise || null,
        sunset: data.forecast?.forecastday?.[0]?.astro?.sunset || null,
        soilTempC: null, soilMoisturePct: null,
        weatherCode: c.condition?.code, icon: "🌤️", description: c.condition?.text || "-",
      };

      const forecast = (data.forecast?.forecastday || []).map((d) => ({
        date: d.date, icon: "🌤️", description: d.day.condition?.text || "-",
        tempMin: d.day.mintemp_c, tempMax: d.day.maxtemp_c,
        rainChance: d.day.daily_chance_of_rain, precipitationMm: d.day.totalprecip_mm,
        windSpeedKmh: d.day.maxwind_kph, uvIndex: d.day.uv,
      }));

      return { provider: "WeatherAPI", fetchedAt: new Date(), current: current_, forecast };
    },
  };

  /* ---------------- OpenWeatherMap (needs API key) ---------------- */
  const openWeatherMap = {
    name: "OpenWeatherMap",
    requiresKey: true,
    async fetchWeather(lat, lon, apiKey) {
      if (!apiKey) throw new Error("OpenWeatherMap: API key belum diatur di Pengaturan");
      const oneCallUrl = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&units=metric&exclude=minutely,hourly,alerts&appid=${encodeURIComponent(apiKey)}`;
      const data = await fetchJson(oneCallUrl);
      if (!data.current) throw new Error("OpenWeatherMap: respons tidak lengkap");

      const c = data.current;
      const today = data.daily?.[0];
      const current_ = {
        tempC: round1(c.temp), feelsLikeC: round1(c.feels_like),
        tempMaxC: today ? round1(today.temp.max) : null, tempMinC: today ? round1(today.temp.min) : null,
        humidity: c.humidity, precipitationMm: round1((c.rain && c.rain["1h"]) || 0),
        rainChance: today ? Math.round((today.pop || 0) * 100) : 0,
        windSpeedKmh: round1(c.wind_speed * KMH_PER_MS), windDirDeg: c.wind_deg, windDirLabel: windDirLabel(c.wind_deg),
        pressureHpa: c.pressure, uvIndex: round1(c.uvi), cloudCoverPct: c.clouds,
        dewPointC: round1(c.dew_point),
        sunrise: c.sunrise ? new Date(c.sunrise * 1000).toISOString() : null,
        sunset: c.sunset ? new Date(c.sunset * 1000).toISOString() : null,
        soilTempC: null, soilMoisturePct: null,
        weatherCode: c.weather?.[0]?.id, icon: "🌤️", description: c.weather?.[0]?.description || "-",
      };

      const forecast = (data.daily || []).slice(0, 7).map((d) => ({
        date: new Date(d.dt * 1000).toISOString().slice(0, 10),
        icon: "🌤️", description: d.weather?.[0]?.description || "-",
        tempMin: round1(d.temp.min), tempMax: round1(d.temp.max),
        rainChance: Math.round((d.pop || 0) * 100), precipitationMm: round1(d.rain || 0),
        windSpeedKmh: round1(d.wind_speed * KMH_PER_MS), uvIndex: round1(d.uvi),
      }));

      return { provider: "OpenWeatherMap", fetchedAt: new Date(), current: current_, forecast };
    },
  };

  /* ---------------- BMKG (Indonesia only, best-effort) ----------------
     BMKG's public API (api.bmkg.go.id) is keyed by an administrative
     region code ("kode wilayah adm4"), not by lat/lon, and doesn't
     publish a public lat/lon -> adm4 lookup. So this provider only
     activates when the user has entered their adm4 code in Settings;
     otherwise it's skipped automatically by weatherService and the
     chain simply moves on — this matches "BMKG khusus Indonesia jika
     tersedia" rather than treating it as a hard failure. */
  const bmkg = {
    name: "BMKG",
    requiresKey: false,
    indonesiaOnly: true,
    async fetchWeather(lat, lon, adm4Code) {
      if (!adm4Code) throw new Error("BMKG: kode wilayah (adm4) belum diatur di Pengaturan");
      const url = `https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=${encodeURIComponent(adm4Code)}`;
      const data = await fetchJson(url);
      const series = data?.data?.[0]?.cuaca?.flat?.() || [];
      if (!series.length) throw new Error("BMKG: data tidak tersedia untuk wilayah ini");

      const now = series[0];
      const current_ = {
        tempC: now.t, feelsLikeC: null, tempMaxC: null, tempMinC: null,
        humidity: now.hu, precipitationMm: null, rainChance: null,
        windSpeedKmh: now.ws, windDirDeg: null, windDirLabel: now.wd || "-",
        pressureHpa: null, uvIndex: now.vs_text ? null : null, cloudCoverPct: null,
        dewPointC: null, sunrise: null, sunset: null, soilTempC: null, soilMoisturePct: null,
        weatherCode: now.weather, icon: "🌤️", description: now.weather_desc || "-",
      };
      // BMKG returns 3-hourly data, not a clean 7-day daily series — group by date.
      const byDate = {};
      series.forEach((s) => {
        const d = (s.local_datetime || "").slice(0, 10);
        if (!d) return;
        byDate[d] = byDate[d] || [];
        byDate[d].push(s);
      });
      const forecast = Object.keys(byDate).slice(0, 7).map((date) => {
        const items = byDate[date];
        const temps = items.map((i) => i.t).filter((n) => typeof n === "number");
        return {
          date, icon: "🌤️", description: items[0].weather_desc || "-",
          tempMin: temps.length ? Math.min(...temps) : null,
          tempMax: temps.length ? Math.max(...temps) : null,
          rainChance: null, precipitationMm: null,
          windSpeedKmh: items[0].ws ?? null, uvIndex: null,
        };
      });

      return { provider: "BMKG", fetchedAt: new Date(), current: current_, forecast };
    },
  };

  function round1(n) {
    return typeof n === "number" ? Math.round(n * 10) / 10 : null;
  }

  global.WeatherProviders = { openMeteo, weatherApi, openWeatherMap, bmkg, windDirLabel };
})(window);
