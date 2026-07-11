/* =========================================================
   NOTIFICATION SERVICE
   Weather-driven notifications only (plant-driven ones stay
   in script.js/renderNotifications, which merges both lists).
   ========================================================= */
(function (global) {
  const NotificationService = {
    /**
     * @param weatherState WeatherService.state
     * @param plantAnalyses  [{ plantName, analysis }] — output of WeatherAI.analyze() per plant
     */
    getWeatherNotifications(weatherState, plantAnalyses) {
      const items = [];

      if (weatherState.status === "offline") {
        items.push({ level: "urgent", text: weatherState.error || "Data cuaca belum dapat diperoleh." });
        return items;
      }
      if (weatherState.status === "cached") {
        items.push({ level: "warn", text: "Menampilkan data cuaca tersimpan terakhir — koneksi ke provider cuaca sedang terganggu." });
      }

      const current = weatherState.current;
      if (current) {
        if (current.rainChance >= 70) {
          items.push({ level: "warn", text: `Peluang hujan lebat ${current.rainChance}% hari ini — pertimbangkan menunda penyiraman & pemupukan.` });
        }
        if (current.uvIndex !== null && current.uvIndex >= 8) {
          items.push({ level: "warn", text: `Indeks UV tinggi (${current.uvIndex}) — hindari aktivitas lapangan pada siang hari.` });
        }
        if (current.windSpeedKmh >= 30) {
          items.push({ level: "warn", text: `Angin cukup kencang (${current.windSpeedKmh} km/j) — periksa penopang tanaman tinggi.` });
        }
      }

      (plantAnalyses || []).forEach(({ plantName, analysis }) => {
        Object.entries(analysis.risks).forEach(([key, r]) => {
          if (r.level === "high") {
            const labels = { drought: "risiko kekeringan", fungus: "risiko jamur", pest: "risiko hama", rootRot: "risiko busuk akar" };
            items.push({ level: "urgent", text: `${plantName}: ${labels[key]} tinggi — ${r.text}` });
          }
        });
      });

      return items;
    },
  };

  global.NotificationService = NotificationService;
})(window);
