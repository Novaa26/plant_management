/* =========================================================
   WEATHER FORECAST HELPERS
   Turns the normalized 7-day forecast array from any provider
   into display-ready cards, and answers the small set of
   "will it rain soon" style questions the AI module needs.
   ========================================================= */
(function (global) {
  const DOW = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

  function formatCard(day, index) {
    const d = new Date(day.date + "T00:00:00");
    return {
      dayLabel: index === 0 ? "Hari Ini" : DOW[d.getDay()],
      dateLabel: `${d.getDate()} ${MONTHS[d.getMonth()]}`,
      icon: day.icon,
      description: day.description,
      tempMin: day.tempMin,
      tempMax: day.tempMax,
      rainChance: day.rainChance,
      precipitationMm: day.precipitationMm,
      windSpeedKmh: day.windSpeedKmh,
      uvIndex: day.uvIndex,
    };
  }

  const WeatherForecast = {
    /** Raw normalized forecast[] -> array ready for card rendering. */
    toCards(forecast) {
      return (forecast || []).map(formatCard);
    },

    /** Highest rain probability across the next `days` forecast entries. */
    maxRainChance(forecast, days = 1) {
      const slice = (forecast || []).slice(0, days);
      if (!slice.length) return 0;
      return Math.max(...slice.map((d) => (typeof d.rainChance === "number" ? d.rainChance : 0)));
    },

    /** True if rain is likely (>=50%) today or tomorrow — used to delay watering. */
    willRainSoon(forecast) {
      return this.maxRainChance(forecast, 2) >= 50;
    },

    /** Total expected rainfall (mm) across the next `days` days. */
    totalRainMm(forecast, days = 7) {
      const slice = (forecast || []).slice(0, days);
      return Math.round(slice.reduce((sum, d) => sum + (d.precipitationMm || 0), 0) * 10) / 10;
    },

    /** Consecutive dry days (rainChance < 30%) from today onward, for drought-risk logic. */
    consecutiveDryDays(forecast) {
      let count = 0;
      for (const d of forecast || []) {
        if ((d.rainChance || 0) < 30) count++;
        else break;
      }
      return count;
    },
  };

  global.WeatherForecast = WeatherForecast;
})(window);
