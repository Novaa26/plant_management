/* =========================================================
   WEATHER AI
   Pure functions: (plant growth-phase context) + (live weather
   state) -> agriculture recommendations. No DOM, no storage —
   easy to unit test and easy to re-run every time weather data
   changes (every 5 min, or right after "Perbarui Lokasi").

   `context` is built by script.js from its own plant helpers,
   so this module doesn't need to know about AppState at all:
     {
       phaseName, progressPct, ph, soilType, plantType,
       age, cycleDays, count, area, healthOverride, recentJournalCount
     }
   `weatherState` is WeatherService.state (current + forecast).
   ========================================================= */
(function (global) {
  const RISK = { LOW: "low", MEDIUM: "medium", HIGH: "high" };
  const RISK_LABEL = { low: "Rendah", medium: "Sedang", high: "Tinggi" };

  function hasWeather(weatherState) {
    return weatherState && weatherState.current;
  }

  function assessWatering(context, weatherState) {
    if (!hasWeather(weatherState)) {
      return { shouldWaterToday: true, volumeText: "Data cuaca tidak tersedia — gunakan jadwal penyiraman standar.", reason: "no-data" };
    }
    const { current, forecast } = weatherState;
    const rainSoon = global.WeatherForecast.willRainSoon(forecast);
    const dryDays = global.WeatherForecast.consecutiveDryDays(forecast);
    const lateStage = context.phaseName === "Pematangan" || context.phaseName === "Panen";

    const areaFactor = Math.max(1, Number(context.area) || 1);
    const baseLiters = Math.round(areaFactor * 2.5); // rough rule-of-thumb per m² per session

    if (lateStage) {
      return {
        shouldWaterToday: current.rainChance < 40,
        volumeText: `Kurangi ke ±${Math.round(baseLiters * 0.4)} liter — fase ${context.phaseName} butuh air minimal.`,
        reason: "late-stage",
      };
    }
    if (rainSoon) {
      return {
        shouldWaterToday: false,
        volumeText: `Tunda penyiraman — peluang hujan ${current.rainChance}% dan diprediksi turun dalam 1–2 hari ke depan.`,
        reason: "rain-incoming",
      };
    }
    if (dryDays >= 3 || current.humidity < 50) {
      return {
        shouldWaterToday: true,
        volumeText: `Naikkan volume ke ±${Math.round(baseLiters * 1.4)} liter — ${dryDays} hari kering berturut-turut, kelembapan udara ${current.humidity}%.`,
        reason: "dry-spell",
      };
    }
    return {
      shouldWaterToday: true,
      volumeText: `Pertahankan ±${baseLiters} liter sesuai jadwal — kondisi cuaca normal.`,
      reason: "normal",
    };
  }

  function assessFertilizing(context, weatherState) {
    const phaseFertilizer = {
      "Vegetatif": "N (Nitrogen / Urea)",
      "Pembungaan": "P (Fosfor / SP-36)",
      "Generatif": "K (Kalium / KCl)",
      "Pembuahan": "K (Kalium / KCl)",
    }[context.phaseName];

    if (!phaseFertilizer) {
      return { recommended: false, type: null, reason: `Fase ${context.phaseName} belum memerlukan pemupukan rutin.` };
    }
    const rainingHard = hasWeather(weatherState) && weatherState.current.rainChance >= 70;
    if (rainingHard) {
      return {
        recommended: false, type: phaseFertilizer,
        reason: `Tunda pemupukan ${phaseFertilizer} — peluang hujan lebat ${weatherState.current.rainChance}% dapat menghanyutkan pupuk sebelum terserap.`,
      };
    }
    return {
      recommended: true, type: phaseFertilizer,
      reason: `Waktu baik untuk aplikasi ${phaseFertilizer} sesuai kebutuhan fase ${context.phaseName}.`,
    };
  }

  function assessRisks(context, weatherState) {
    if (!hasWeather(weatherState)) {
      return {
        drought: { level: RISK.LOW, text: "Data cuaca tidak tersedia." },
        fungus: { level: RISK.LOW, text: "Data cuaca tidak tersedia." },
        pest: { level: RISK.LOW, text: "Data cuaca tidak tersedia." },
        rootRot: { level: RISK.LOW, text: "Data cuaca tidak tersedia." },
      };
    }
    const { current, forecast } = weatherState;
    const dryDays = global.WeatherForecast.consecutiveDryDays(forecast);
    const totalRain7d = global.WeatherForecast.totalRainMm(forecast, 7);
    const poorDrainage = context.soilType === "Liat";

    const drought = dryDays >= 4 && current.humidity < 55
      ? { level: RISK.HIGH, text: `${dryDays} hari tanpa hujan berarti dan kelembapan rendah (${current.humidity}%) — risiko kekeringan tinggi.` }
      : dryDays >= 2
      ? { level: RISK.MEDIUM, text: `${dryDays} hari cenderung kering — pantau kelembapan media tanam.` }
      : { level: RISK.LOW, text: "Curah hujan mencukupi, risiko kekeringan rendah." };

    const fungus = current.humidity >= 80 && current.rainChance >= 50
      ? { level: RISK.HIGH, text: `Kelembapan ${current.humidity}% dengan peluang hujan ${current.rainChance}% sangat mendukung pertumbuhan jamur.` }
      : current.humidity >= 70
      ? { level: RISK.MEDIUM, text: `Kelembapan cukup tinggi (${current.humidity}%) — periksa daun bagian bawah secara berkala.` }
      : { level: RISK.LOW, text: "Kelembapan udara dalam batas aman terhadap jamur." };

    const pest = current.humidity >= 75 && current.tempC >= 26
      ? { level: RISK.HIGH, text: `Kombinasi suhu hangat (${current.tempC}°C) dan kelembapan tinggi (${current.humidity}%) meningkatkan risiko kutu daun & thrips.` }
      : { level: RISK.LOW, text: "Kondisi saat ini kurang mendukung ledakan populasi hama." };

    const rootRot = totalRain7d >= 80 && poorDrainage
      ? { level: RISK.HIGH, text: `Curah hujan 7 hari diperkirakan ${totalRain7d} mm pada media tanah liat berdrainase buruk — risiko busuk akar tinggi.` }
      : totalRain7d >= 80
      ? { level: RISK.MEDIUM, text: `Curah hujan 7 hari diperkirakan tinggi (${totalRain7d} mm) — pastikan drainase lancar.` }
      : { level: RISK.LOW, text: "Curah hujan diperkirakan tidak berlebihan." };

    return { drought, fungus, pest, rootRot };
  }

  function buildPreventiveActions(risks) {
    const actions = [];
    if (risks.drought.level !== RISK.LOW) actions.push("Tambahkan mulsa untuk menahan kelembapan tanah dan kurangi penguapan.");
    if (risks.fungus.level !== RISK.LOW) actions.push("Perbaiki sirkulasi udara antar tanaman dan hindari penyiraman ke daun.");
    if (risks.pest.level !== RISK.LOW) actions.push("Pasang perangkap kuning atau semprot insektisida nabati secara preventif.");
    if (risks.rootRot.level !== RISK.LOW) actions.push("Perbaiki saluran drainase dan hindari genangan air di sekitar akar.");
    return actions;
  }

  /** Merged, human-readable recommendation list — same {title, body} shape script.js already uses. */
  function buildRecommendations(context, watering, fertilizing, risks) {
    const recs = [];
    recs.push({
      title: watering.shouldWaterToday ? "Penyiraman Hari Ini" : "Tunda Penyiraman",
      body: watering.volumeText,
    });
    recs.push({
      title: fertilizing.recommended ? `Pemupukan: ${fertilizing.type}` : "Tunda Pemupukan",
      body: fertilizing.reason,
    });
    Object.entries(risks).forEach(([key, r]) => {
      if (r.level === RISK.HIGH) {
        const labels = { drought: "Risiko Kekeringan", fungus: "Risiko Jamur", pest: "Risiko Hama", rootRot: "Risiko Busuk Akar" };
        recs.push({ title: `⚠ ${labels[key]} Tinggi`, body: r.text });
      }
    });
    return recs;
  }

  const WeatherAI = {
    RISK, RISK_LABEL,

    /** The single entry point: full analysis for one plant given current weather state. */
    analyze(context, weatherState) {
      const watering = assessWatering(context, weatherState);
      const fertilizing = assessFertilizing(context, weatherState);
      const risks = assessRisks(context, weatherState);
      const preventive = buildPreventiveActions(risks);
      const recommendations = buildRecommendations(context, watering, fertilizing, risks);
      return { watering, fertilizing, risks, preventive, recommendations };
    },
  };

  global.WeatherAI = WeatherAI;
})(window);
