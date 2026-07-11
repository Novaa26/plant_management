/* =========================================================
   WEATHER UI
   Pure DOM rendering for the weather engine. Doesn't fetch or
   compute anything itself — just paints whatever WeatherService
   (and WeatherForecast for the 7-day strip) currently holds.
   ========================================================= */
(function (global) {
  function el(id) { return document.getElementById(id); }
  function setText(id, text) { const n = el(id); if (n) n.textContent = text; }

  function formatClock(isoString) {
    if (!isoString) return "-";
    const d = new Date(isoString);
    if (isNaN(d)) return "-";
    return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  }

  function formatUpdatedAt(date) {
    if (!date) return "Belum pernah diperbarui";
    return "Diperbarui " + new Date(date).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  }

  const STATUS_META = {
    idle: { dot: "status-idle", label: "Memuat…" },
    loading: { dot: "status-idle", label: "Memperbarui…" },
    online: { dot: "status-online", label: "Terhubung" },
    cached: { dot: "status-warn", label: "Data Tersimpan" },
    offline: { dot: "status-offline", label: "Tidak Terhubung" },
  };

  const WeatherUI = {
    /** Render the current-conditions card + status badge + location line. */
    renderCurrent(state) {
      const statusBadge = el("weather-status");
      if (statusBadge) {
        const meta = STATUS_META[state.status] || STATUS_META.idle;
        statusBadge.innerHTML = `<span class="status-dot ${meta.dot}"></span>${meta.label}${state.provider ? " · " + state.provider : ""}`;
      }
      setText("weather-updated", formatUpdatedAt(state.lastUpdated));

      const loc = state.location || {};
      setText("weather-city", loc.city || "-");
      setText("weather-province", loc.province || "");
      setText("weather-country", loc.country || "");

      const c = state.current;
      if (!c) {
        setText("weather-ico", "❔");
        setText("weather-temp", "--°C");
        setText("weather-desc", state.error || "Data cuaca belum tersedia");
        ["w-tempmax", "w-tempmin", "w-humidity", "w-rain", "w-rainchance", "w-wind", "w-winddir",
          "w-pressure", "w-uv", "w-cloud", "w-sunrise", "w-sunset", "w-dewpoint", "w-soiltemp", "w-soilmoist"]
          .forEach((id) => setText(id, "-"));
        return;
      }

      setText("weather-ico", c.icon);
      setText("weather-temp", `${c.tempC}°C`);
      setText("weather-desc", c.description);
      setText("weather-hum", `${c.humidity}%`);
      setText("weather-rain", `${c.rainChance ?? 0}%`);
      setText("weather-wind", `${c.windSpeedKmh} km/j`);

      setText("w-tempmax", c.tempMaxC != null ? `${c.tempMaxC}°C` : "-");
      setText("w-tempmin", c.tempMinC != null ? `${c.tempMinC}°C` : "-");
      setText("w-humidity", `${c.humidity}%`);
      setText("w-rain", c.precipitationMm != null ? `${c.precipitationMm} mm` : "-");
      setText("w-rainchance", `${c.rainChance ?? 0}%`);
      setText("w-wind", `${c.windSpeedKmh} km/j`);
      setText("w-winddir", c.windDirLabel || "-");
      setText("w-pressure", c.pressureHpa != null ? `${c.pressureHpa} hPa` : "-");
      setText("w-uv", c.uvIndex != null ? c.uvIndex : "-");
      setText("w-cloud", c.cloudCoverPct != null ? `${c.cloudCoverPct}%` : "-");
      setText("w-sunrise", formatClock(c.sunrise));
      setText("w-sunset", formatClock(c.sunset));
      setText("w-dewpoint", c.dewPointC != null ? `${c.dewPointC}°C` : "-");
      setText("w-soiltemp", c.soilTempC != null ? `${c.soilTempC}°C` : "Tidak tersedia");
      setText("w-soilmoist", c.soilMoisturePct != null ? `${c.soilMoisturePct}%` : "Tidak tersedia");
    },

    /** Render the horizontal-scroll 7-day forecast strip. */
    renderForecast(state) {
      const track = el("forecast-strip");
      if (!track) return;
      if (!state.forecast || !state.forecast.length) {
        track.innerHTML = `<p class="muted">Prakiraan 7 hari belum tersedia.</p>`;
        return;
      }
      const cards = global.WeatherForecast.toCards(state.forecast);
      track.innerHTML = cards.map((d) => `
        <div class="forecast-card">
          <div class="forecast-day">${d.dayLabel}</div>
          <div class="forecast-date">${d.dateLabel}</div>
          <div class="forecast-ico">${d.icon}</div>
          <div class="forecast-desc">${d.description}</div>
          <div class="forecast-temps"><b>${d.tempMax}°</b><span>${d.tempMin}°</span></div>
          <div class="forecast-mini">💧 ${d.rainChance ?? 0}%</div>
          <div class="forecast-mini">🌬️ ${d.windSpeedKmh ?? "-"} km/j</div>
          <div class="forecast-mini">☀ UV ${d.uvIndex ?? "-"}</div>
        </div>`).join("");
    },

    renderAll(state) {
      this.renderCurrent(state);
      this.renderForecast(state);
    },
  };

  global.WeatherUI = WeatherUI;
})(window);
