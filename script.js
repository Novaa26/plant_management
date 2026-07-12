/* =========================================================
   TUMBUH — Smart Plant Management
   Vanilla JS — modular, no framework, no heavy libraries.
   Structure:
     1. Storage helper
     2. Static domain data (plant types, disease DB)
     3. AI logic (timeline, phase, recommendations, diagnosis)
     4. State + CRUD
     5. Rendering: dashboard, plants, detail, calendar,
        diagnosis, analytics, costs, journal, settings
     6. Charts (canvas, no library)
     7. Event wiring / router
   ========================================================= */

/* ---------------------------------------------------------
   1. STORAGE HELPER
   Tries localStorage; falls back to an in-memory object so
   the app still works in sandboxed / preview environments.
--------------------------------------------------------- */
const memoryStore = {};
const Storage = {
  get(key, fallback){
    try{
      const raw = localStorage.getItem(key);
      if(raw === null) return fallback;
      return JSON.parse(raw);
    }catch(e){
      return (key in memoryStore) ? memoryStore[key] : fallback;
    }
  },
  set(key, value){
    try{
      localStorage.setItem(key, JSON.stringify(value));
    }catch(e){
      memoryStore[key] = value;
    }
  }
};

/* ---------------------------------------------------------
   2. STATIC DOMAIN DATA
--------------------------------------------------------- */

const PLANT_TYPES = {
  "Cabai":   { icon:"🌶️", cycleDays: 90,  category:"buah", basePrice: 45000 },
  "Tomat":   { icon:"🍅", cycleDays: 80,  category:"buah", basePrice: 12000 },
  "Terong":  { icon:"🍆", cycleDays: 75,  category:"buah", basePrice: 9000  },
  "Timun":   { icon:"🥒", cycleDays: 55,  category:"buah", basePrice: 7000  },
  "Melon":   { icon:"🍈", cycleDays: 70,  category:"buah", basePrice: 15000 },
  "Bayam":   { icon:"🌿", cycleDays: 30,  category:"daun", basePrice: 6000  },
  "Kangkung":{ icon:"🥬", cycleDays: 28,  category:"daun", basePrice: 5000  },
  "Sawi":    { icon:"🥬", cycleDays: 35,  category:"daun", basePrice: 6500  },
  "Padi":    { icon:"🌾", cycleDays: 110, category:"palawija", basePrice: 6000 },
  "Jagung":  { icon:"🌽", cycleDays: 95,  category:"palawija", basePrice: 4500 },
};

// Canonical growth-phase template, expressed as % of total cycle.
// Applies across plant types; content is written to generalise well.
const PHASE_TEMPLATE = [
  { name:"Persemaian", from:0,   to:0.04,
    desc:"Benih mulai berkecambah dan mengeluarkan akar pertama.",
    target:"Perkecambahan merata di atas 80%",
    todo:["Jaga media tetap lembap, tidak becek","Letakkan di tempat teduh"],
    avoid:["Menyiram berlebihan","Terkena sinar matahari langsung penuh"],
    water:"Rendah – lembap konstan", nutrition:"Tidak perlu pupuk tambahan",
    light:"Teduh / 30–50%", risk:"Damping-off (busuk kecambah)"},
  { name:"Bibit", from:0.04, to:0.10,
    desc:"Tanaman muda membentuk daun sejati pertama.",
    target:"Tinggi bibit 5–10 cm, 2–4 daun sejati",
    todo:["Mulai aklimatisasi ke sinar matahari","Cek hama pada daun muda"],
    avoid:["Pemindahan bibit saat siang terik"],
    water:"Sedang, 1x sehari", nutrition:"Pupuk starter dosis rendah",
    light:"Sedang / 50–70%", risk:"Serangan kutu daun & ulat kecil"},
  { name:"Vegetatif", from:0.10, to:0.42,
    desc:"Fase pertumbuhan batang, daun, dan sistem akar secara aktif.",
    target:"Penambahan tinggi & jumlah daun tercepat",
    todo:["Pemupukan nitrogen bertahap","Penyiangan gulma di sekitar tanaman","Penggemburan tanah ringan"],
    avoid:["Kekurangan air saat pertumbuhan cepat","Pemangkasan berlebihan"],
    water:"Tinggi, 1–2x sehari", nutrition:"Tinggi Nitrogen (N)",
    light:"Penuh / 70–100%", risk:"Layu fusarium, busuk akar bila drainase buruk"},
  { name:"Pembungaan", from:0.42, to:0.58,
    desc:"Tanaman mulai membentuk kuncup dan bunga.",
    target:"Bunga muncul serempak di sebagian besar tanaman",
    todo:["Kurangi pupuk N, tambah Fosfor (P)","Jaga penyerbukan (hindari semprot saat bunga mekar)"],
    avoid:["Penyemprotan pestisida saat bunga mekar penuh","Stres air mendadak"],
    water:"Sedang-tinggi, teratur", nutrition:"Tinggi Fosfor (P) untuk pembungaan",
    light:"Penuh / 80–100%", risk:"Bunga rontok akibat suhu ekstrem atau kekurangan air"},
  { name:"Generatif", from:0.58, to:0.70,
    desc:"Bunga menjadi bakal buah / bakal biji, fase paling menentukan hasil panen.",
    target:"Fruit set (pembentukan buah) di atas 60% bunga",
    todo:["Pemupukan Kalium (K) untuk kualitas buah","Pengendalian hama penggerek buah"],
    avoid:["Perubahan pola air drastis","Kekurangan Kalium"],
    water:"Tinggi, konsisten", nutrition:"Tinggi Kalium (K)",
    light:"Penuh / 80–100%", risk:"Buah rontok, serangan lalat buah"},
  { name:"Pembuahan", from:0.70, to:0.85,
    desc:"Buah/biji membesar dan mulai terbentuk sempurna.",
    target:"Ukuran buah mencapai 70–90% ukuran panen",
    todo:["Topang batang bila diperlukan","Pantau serangan hama buah harian"],
    avoid:["Kelebihan Nitrogen (memicu daun, bukan buah)"],
    water:"Sedang, jaga kelembapan stabil", nutrition:"Kalium tinggi, Nitrogen rendah",
    light:"Penuh / 70–100%", risk:"Busuk buah, retak buah akibat air tidak stabil"},
  { name:"Pematangan", from:0.85, to:0.97,
    desc:"Buah/biji mencapai kematangan optimal, perubahan warna terlihat jelas.",
    target:"Warna & tekstur sesuai ciri panen varietas",
    todo:["Kurangi penyiraman menjelang panen","Rencanakan tenaga panen"],
    avoid:["Panen terlalu dini atau terlambat"],
    water:"Rendah, dikurangi bertahap", nutrition:"Dihentikan / sangat minim",
    light:"Penuh", risk:"Busuk pascamatang bila terlambat panen"},
  { name:"Panen", from:0.97, to:1.0,
    desc:"Tanaman siap dipanen sesuai kriteria kematangan.",
    target:"100% hasil terpanen tanpa kerusakan",
    todo:["Panen pagi atau sore hari","Sortir hasil panen berdasarkan kualitas"],
    avoid:["Menunda panen terlalu lama"],
    water:"Minimal", nutrition:"Tidak diperlukan",
    light:"-", risk:"Kehilangan hasil bila panen terlambat"},
];

const PHASE_AFTER_HARVEST = { name:"Pascapanen", from:1.0, to:1.15,
  desc:"Penanganan hasil panen: pembersihan lahan dan persiapan siklus tanam berikutnya.",
  target:"Lahan siap untuk siklus tanam baru",
  todo:["Bersihkan sisa tanaman","Olah kembali tanah / rotasi tanaman"],
  avoid:["Menanam jenis yang sama berturut-turut tanpa rotasi"],
  water:"-", nutrition:"Pupuk dasar untuk siklus berikutnya", light:"-", risk:"Penumpukan hama/penyakit bila tanpa rotasi"};

// Timeline template (day % of cycle, title) — generalised from the brief's example.
const TIMELINE_TEMPLATE = [
  { pct:0.000, title:"Tanam bibit" },
  { pct:0.011, title:"Penyiraman awal" },
  { pct:0.044, title:"Pengecekan daun pertama" },
  { pct:0.078, title:"Pemupukan pertama" },
  { pct:0.133, title:"Penyiangan gulma" },
  { pct:0.222, title:"Pengendalian hama tahap awal" },
  { pct:0.333, title:"Masuk fase vegetatif penuh" },
  { pct:0.50,  title:"Pemupukan lanjutan (fosfor)" },
  { pct:0.667, title:"Masuk fase generatif" },
  { pct:0.833, title:"Pembentukan buah / biji" },
  { pct:1.0,   title:"Panen" },
];

const DISEASE_DB = [
  { name:"Layu Fusarium", type:"Penyakit", danger:"high",
    cause:"Jamur Fusarium oxysporum yang menyerang jaringan pembuluh akar.",
    symptoms:["Daun menguning","Layu mendadak","Pertumbuhan lambat","Batang busuk"],
    prevention:"Rotasi tanaman, gunakan bibit tahan penyakit, perbaiki drainase.",
    treatment:"Cabut & musnahkan tanaman terinfeksi, aplikasikan fungisida berbahan aktif tembaga di area sekitar." },
  { name:"Busuk Akar", type:"Penyakit", danger:"high",
    cause:"Genangan air berlebih menyebabkan jamur Phytophthora / Pythium berkembang.",
    symptoms:["Batang busuk","Pertumbuhan lambat","Daun menguning","Layu mendadak"],
    prevention:"Perbaiki drainase, hindari penyiraman berlebihan, gunakan media porous.",
    treatment:"Kurangi penyiraman, aplikasikan fungisida sistemik, potong bagian akar yang busuk." },
  { name:"Bercak Daun Cercospora", type:"Penyakit", danger:"med",
    cause:"Jamur Cercospora sp. yang berkembang pada kelembapan tinggi.",
    symptoms:["Bercak coklat pada daun","Daun menguning","Daun berlubang"],
    prevention:"Jaga jarak tanam agar sirkulasi udara baik, hindari penyiraman ke daun.",
    treatment:"Buang daun terinfeksi, semprot fungisida berbahan aktif mankozeb." },
  { name:"Virus Keriting Daun (Gemini Virus)", type:"Penyakit", danger:"high",
    cause:"Virus yang ditularkan oleh kutu kebul (whitefly).",
    symptoms:["Daun keriting","Pertumbuhan lambat","Daun menguning","Buah rontok"],
    prevention:"Kendalikan populasi kutu kebul, gunakan mulsa plastik perak.",
    treatment:"Cabut & musnahkan tanaman terinfeksi berat, kendalikan vektor kutu kebul." },
  { name:"Antraknosa (Patek)", type:"Penyakit", danger:"high",
    cause:"Jamur Colletotrichum sp., berkembang pesat pada musim hujan.",
    symptoms:["Buah rontok","Bercak coklat pada daun","Batang busuk"],
    prevention:"Sanitasi kebun, hindari kelembapan berlebih, rotasi tanaman.",
    treatment:"Buang buah terinfeksi, semprot fungisida secara berkala terutama musim hujan." },
  { name:"Ulat Grayak (Spodoptera)", type:"Hama", danger:"high",
    cause:"Larva ngengat Spodoptera litura yang memakan daun secara berkelompok.",
    symptoms:["Daun berlubang","Pertumbuhan lambat"],
    prevention:"Pantau telur di bawah daun, gunakan perangkap feromon.",
    treatment:"Aplikasikan insektisida biologis (Bt) atau kimia sesuai anjuran dosis." },
  { name:"Kutu Daun (Aphid)", type:"Hama", danger:"med",
    cause:"Serangga kecil penghisap cairan daun muda, juga vektor virus.",
    symptoms:["Daun keriting","Pertumbuhan lambat","Daun menguning"],
    prevention:"Jaga kebersihan gulma di sekitar lahan, tanam tanaman pengusir hama (refugia).",
    treatment:"Semprot insektisida nabati (ekstrak daun mimba) atau insektisida kontak." },
  { name:"Thrips", type:"Hama", danger:"med",
    cause:"Serangga sangat kecil yang merusak permukaan daun dan bunga.",
    symptoms:["Daun keriting","Bercak coklat pada daun","Buah rontok"],
    prevention:"Gunakan perangkap likat biru/kuning, jaga kelembapan lahan.",
    treatment:"Rotasi insektisida untuk mencegah resistensi, semprot pagi/sore hari." },
  { name:"Tungau (Spider Mite)", type:"Hama", danger:"low",
    cause:"Tungau kecil yang berkembang pesat pada kondisi kering dan panas.",
    symptoms:["Daun menguning","Bercak coklat pada daun","Pertumbuhan lambat"],
    prevention:"Jaga kelembapan lahan, hindari kondisi terlalu kering berkepanjangan.",
    treatment:"Semprot akarisida atau air bertekanan untuk merontokkan tungau." },
  { name:"Lalat Buah", type:"Hama", danger:"high",
    cause:"Bactrocera sp. meletakkan telur di dalam buah muda hingga matang.",
    symptoms:["Buah rontok","Batang busuk"],
    prevention:"Pasang perangkap metil eugenol, bungkus buah muda.",
    treatment:"Kumpulkan & musnahkan buah jatuh/terinfeksi, pasang perangkap secara rutin." },
];

const ALL_SYMPTOMS = [...new Set(DISEASE_DB.flatMap(d => d.symptoms))];

// Rule-based fertiliser knowledge, referenced by AI recommendation engine.
const FERTILIZER_DB = {
  "N (Nitrogen / Urea)": { why:"Mendorong pertumbuhan daun & batang pada fase vegetatif.", dose:"100–150 kg/ha atau 5–8 g/tanaman", timing:"Setiap 2 minggu pada fase vegetatif", excess:"Daun rimbun tapi bunga/buah sedikit, rentan hama.", deficiency:"Daun menguning, pertumbuhan kerdil." },
  "P (Fosfor / SP-36)": { why:"Merangsang pembentukan akar, bunga, dan biji.", dose:"75–100 kg/ha atau 4–6 g/tanaman", timing:"Awal tanam & menjelang pembungaan", excess:"Menghambat penyerapan unsur mikro.", deficiency:"Bunga sedikit, akar tidak berkembang optimal." },
  "K (Kalium / KCl)": { why:"Meningkatkan kualitas & ketahanan buah terhadap penyakit.", dose:"75–120 kg/ha atau 4–7 g/tanaman", timing:"Fase generatif hingga pembuahan", excess:"Menghambat penyerapan Magnesium.", deficiency:"Buah kecil, mudah rontok, rasa kurang optimal." },
  "Pupuk Kandang / Kompos": { why:"Memperbaiki struktur tanah & menyuplai hara mikro secara perlahan.", dose:"1–2 kg per lubang tanam", timing:"Sebelum tanam & sebagai pupuk dasar", excess:"Jarang berdampak negatif bila matang sempurna.", deficiency:"Tanah cepat memadat, mikroba tanah rendah." },
  "Dolomit / Kapur Pertanian": { why:"Menaikkan pH tanah yang terlalu asam.", dose:"1–2 ton/ha sesuai hasil uji pH", timing:"2–3 minggu sebelum tanam", excess:"pH terlalu basa, unsur mikro terkunci.", deficiency:"Tanah tetap asam, akar sulit menyerap hara." },
};

/* ---------------------------------------------------------
   3. AI LOGIC — timeline, phase detection, recommendations
--------------------------------------------------------- */

function daysSince(dateStr){
  const planted = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - planted) / 86400000);
}

function getCycleDays(plant){
  return (PLANT_TYPES[plant.type] && PLANT_TYPES[plant.type].cycleDays) || 90;
}

function getCurrentPhase(plant){
  const age = daysSince(plant.plantedDate);
  const cycle = getCycleDays(plant);
  const pct = Math.max(0, age / cycle);
  if(pct >= 1.0) return PHASE_AFTER_HARVEST;
  const phase = PHASE_TEMPLATE.find(p => pct >= p.from && pct < p.to);
  return phase || PHASE_TEMPLATE[PHASE_TEMPLATE.length - 1];
}

function getProgressPct(plant){
  const age = daysSince(plant.plantedDate);
  const cycle = getCycleDays(plant);
  return Math.min(100, Math.max(0, Math.round((age / cycle) * 100)));
}

function generateTimeline(plant){
  const cycle = getCycleDays(plant);
  const age = daysSince(plant.plantedDate);
  return TIMELINE_TEMPLATE.map(t => {
    const day = Math.round(t.pct * cycle);
    return { day, title: t.title, done: age >= day, isToday: age === day };
  });
}

// Weather now comes from the real Weather Engine (WeatherService.state) instead of a mock.
function buildWeatherAIContext(plant, phase){
  phase = phase || getCurrentPhase(plant);
  return {
    phaseName: phase.name,
    progressPct: getProgressPct(plant),
    ph: plant.ph,
    soilType: plant.soil,
    plantType: plant.type,
    age: daysSince(plant.plantedDate),
    cycleDays: getCycleDays(plant),
    count: plant.count,
    area: plant.area,
    healthOverride: plant.healthOverride,
  };
}

function getPlantStatus(plant){
  const age = daysSince(plant.plantedDate);
  const cycle = getCycleDays(plant);
  const progress = getProgressPct(plant);
  if(plant.healthOverride === "sakit") return "sakit";
  if(progress >= 97 && progress < 115) return "siap";
  if(progress >= 115) return "pascapanen";
  return "sehat";
}

function weatherEngineAvailable(){
  return typeof WeatherAI !== "undefined" && typeof WeatherService !== "undefined";
}

function needsWaterToday(plant){
  if(!weatherEngineAvailable()) return true; // safe default: assume watering is needed
  const analysis = WeatherAI.analyze(buildWeatherAIContext(plant), WeatherService.state);
  return analysis.watering.shouldWaterToday;
}

function generateRecommendations(plant){
  const phase = getCurrentPhase(plant);
  const recs = [];

  if(plant.ph && plant.ph < 6){
    recs.push({ title:"Naikkan pH Tanah", body:`pH tanah saat ini ${plant.ph} tergolong asam. Aplikasikan dolomit 1–2 minggu sebelum pemupukan berikutnya.` });
  }

  if(weatherEngineAvailable()){
    const analysis = WeatherAI.analyze(buildWeatherAIContext(plant, phase), WeatherService.state);
    recs.push(...analysis.recommendations);
  } else {
    recs.push({ title:"Pertahankan Jadwal Penyiraman", body:"Modul cuaca tidak tersedia saat ini — gunakan jadwal penyiraman standar sesuai fase pertumbuhan." });
  }

  recs.push({ title:"Estimasi Panen", body: estimateHarvest(plant).text });
  return recs;
}

function estimateHarvest(plant){
  const cycle = getCycleDays(plant);
  const plantedDate = new Date(plant.plantedDate);
  const harvestDate = new Date(plantedDate.getTime() + cycle * 86400000);
  const count = Number(plant.count) || 1;
  const typeInfo = PLANT_TYPES[plant.type] || { basePrice: 8000, category:"buah" };
  const perPlantKg = typeInfo.category === "daun" ? 0.15 : (typeInfo.category === "palawija" ? 0.6 : 0.4);
  const estWeight = Math.round(count * perPlantKg * 10) / 10;
  const successRate = plant.healthOverride === "sakit" ? 65 : 88;
  return {
    date: harvestDate.toISOString().slice(0,10),
    weightKg: estWeight,
    successRate,
    text: `Perkiraan panen ${harvestDate.toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}, estimasi bobot ±${estWeight} kg dengan tingkat keberhasilan ${successRate}%.`
  };
}

function diagnoseSymptoms(selectedSymptoms){
  if(selectedSymptoms.length === 0) return [];
  return DISEASE_DB.map(d => {
    const matched = d.symptoms.filter(s => selectedSymptoms.includes(s));
    // Weighted confidence: overlap relative to disease's own symptom set, boosted by coverage of user's selection.
    const overlapScore = matched.length ? Math.round(((matched.length / d.symptoms.length) * 0.6 + (matched.length / selectedSymptoms.length) * 0.4) * 100) : 0;
    return { ...d, matched, confidence: overlapScore };
  }).filter(d => d.matched.length > 0).sort((a,b) => b.confidence - a.confidence);
}

/* ---------------------------------------------------------
   4. STATE + CRUD
--------------------------------------------------------- */

const AppState = {
  plants: Storage.get("spm_plants", null),
  journal: Storage.get("spm_journal", null),
  costs: Storage.get("spm_costs", null),
  settings: Storage.get("spm_settings", null),
  ui: { selectedPlantId: null, plantFilter: "all", calMonth: new Date().getMonth(), calYear: new Date().getFullYear(), selectedSymptoms: [], detailTab: "info" },
};

function seedDataIfEmpty(){
  if(!AppState.plants || AppState.plants.length === 0){
    const today = new Date();
    const daysAgo = n => new Date(today.getTime() - n*86400000).toISOString().slice(0,10);
    AppState.plants = [
      { id: uid(), name:"Cabai Rawit Petak A", type:"Cabai", variety:"Cakra Hijau", location:"Petak A2", plantedDate: daysAgo(38), count:40, area:20, media:"Tanah", ph:6.2, soil:"Lempung", temp:28, humidity:72, healthOverride:null },
      { id: uid(), name:"Tomat Ceri Rumah Kaca", type:"Tomat", variety:"Cherry Sweet", location:"Rumah Kaca 1", plantedDate: daysAgo(70), count:25, area:12, media:"Polybag", ph:6.6, soil:"Lempung", temp:27, humidity:65, healthOverride:null },
      { id: uid(), name:"Bayam Hijau Belakang", type:"Bayam", variety:"Giti Hijau", location:"Petak C1", plantedDate: daysAgo(22), count:200, area:8, media:"Tanah", ph:6.8, soil:"Lempung", temp:29, humidity:70, healthOverride:null },
      { id: uid(), name:"Terong Ungu Sisi Utara", type:"Terong", variety:"Antaboga", location:"Petak B3", plantedDate: daysAgo(58), count:30, area:15, media:"Tanah", ph:5.6, soil:"Liat", temp:28, humidity:80, healthOverride:"sakit" },
      { id: uid(), name:"Jagung Manis Ladang", type:"Jagung", variety:"Bonanza F1", location:"Ladang Timur", plantedDate: daysAgo(85), count:150, area:100, media:"Tanah", ph:6.4, soil:"Lempung", temp:30, humidity:60, healthOverride:null },
    ];
    saveState("plants");
  }
  if(!AppState.journal){
    AppState.journal = [];
    saveState("journal");
  }
  if(!AppState.costs || AppState.costs.length === 0){
    const today = new Date();
    const daysAgo = n => new Date(today.getTime() - n*86400000).toISOString().slice(0,10);
    const firstPlantId = AppState.plants[0].id;
    AppState.costs = [
      { id: uid(), date: daysAgo(38), category:"Bibit", plantId:firstPlantId, note:"Benih cabai 1 sachet", amount:35000 },
      { id: uid(), date: daysAgo(30), category:"Pupuk", plantId:firstPlantId, note:"NPK 5kg", amount:75000 },
      { id: uid(), date: daysAgo(10), category:"Pestisida", plantId:firstPlantId, note:"Insektisida nabati", amount:42000 },
      { id: uid(), date: daysAgo(60), category:"Tenaga Kerja", plantId:"", note:"Upah olah lahan", amount:250000 },
    ];
    saveState("costs");
  }
  if(!AppState.settings){
    AppState.settings = { name:"Petani", location:"Jawa Tengah", dark:false, weatherApiKey:"", owmApiKey:"", bmkgAdm4:"" };
    saveState("settings");
  } else {
    // Normalize settings for users with data saved before the Weather Engine existed.
    let changed = false;
    ["weatherApiKey","owmApiKey","bmkgAdm4"].forEach(k => { if(AppState.settings[k] === undefined){ AppState.settings[k] = ""; changed = true; } });
    if(changed) saveState("settings");
  }
}

function uid(){ return 'id_' + Math.random().toString(36).slice(2,10) + Date.now().toString(36); }

function saveState(part){
  const map = { plants:"spm_plants", journal:"spm_journal", costs:"spm_costs", settings:"spm_settings" };
  Storage.set(map[part], AppState[part]);
}

function getPlant(id){ return AppState.plants.find(p => p.id === id); }

function addPlant(data){
  data.id = uid();
  data.healthOverride = null;
  AppState.plants.push(data);
  saveState("plants");
}

function deletePlant(id){
  AppState.plants = AppState.plants.filter(p => p.id !== id);
  saveState("plants");
}

function addJournalEntry(entry){
  entry.id = uid();
  entry.date = new Date().toISOString();
  AppState.journal.unshift(entry);
  saveState("journal");
}

function addCostEntry(entry){
  entry.id = uid();
  entry.amount = Number(entry.amount) || 0;
  AppState.costs.unshift(entry);
  saveState("costs");
}

function deleteCostEntry(id){
  AppState.costs = AppState.costs.filter(c => c.id !== id);
  saveState("costs");
}

function formatRupiah(n){
  return "Rp " + Math.round(n).toLocaleString('id-ID');
}

/* ---------------------------------------------------------
   5. RENDERING — DASHBOARD
--------------------------------------------------------- */

function renderGreeting(){
  const hour = new Date().getHours();
  const timeLabel = hour < 11 ? "Selamat Pagi" : hour < 15 ? "Selamat Siang" : hour < 18 ? "Selamat Sore" : "Selamat Malam";
  document.getElementById('greeting-time').textContent = timeLabel;
  document.getElementById('greeting-name').textContent = `Halo, ${AppState.settings.name} 👋`;
  const readyCount = AppState.plants.filter(p => getPlantStatus(p) === "siap").length;
  document.getElementById('greeting-line').textContent = readyCount > 0
    ? `${readyCount} tanaman Anda siap dipanen minggu ini.`
    : "Semua tanaman dalam masa pertumbuhan yang baik.";
  const now = new Date();
  document.getElementById('calendar-mini').innerHTML =
    `<div style="font-size:1.4rem;font-weight:700;">${now.getDate()}</div><div style="font-size:.7rem;">${now.toLocaleDateString('id-ID',{month:'short'})}</div>`;
}

function renderWeather(){
  if(typeof WeatherUI === "undefined" || typeof WeatherService === "undefined"){
    const desc = document.getElementById('weather-desc');
    if(desc) desc.textContent = "Modul cuaca tidak dapat dimuat.";
    return;
  }
  WeatherUI.renderAll(WeatherService.state);
}

function renderStats(){
  const plants = AppState.plants;
  document.getElementById('stat-total').textContent = plants.length;
  document.getElementById('stat-ready').textContent = plants.filter(p => getPlantStatus(p) === "siap").length;
  document.getElementById('stat-water').textContent = plants.filter(p => needsWaterToday(p)).length;
  document.getElementById('stat-sick').textContent = plants.filter(p => getPlantStatus(p) === "sakit").length;
}

function ringSVG(pct, color, size=64){
  const r = size/2 - 6;
  const c = 2 * Math.PI * r;
  const offset = c - (pct/100) * c;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--sage-soft)" stroke-width="7"/>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="7"
      stroke-dasharray="${c}" stroke-dashoffset="${offset}" stroke-linecap="round"
      style="transition: stroke-dashoffset 1s ease;"/>
  </svg>`;
}

function renderProgressRings(){
  const plants = AppState.plants;
  const avg = arr => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : 0;
  const growth = avg(plants.map(p => getProgressPct(p)));
  const health = avg(plants.map(p => getPlantStatus(p) === "sakit" ? 45 : 92));
  const waterNeed = avg(plants.map(p => needsWaterToday(p) ? 70 : 25));
  const nutrition = avg(plants.map(p => p.ph >= 6 && p.ph <= 7 ? 85 : 55));
  const risk = avg(plants.map(p => getPlantStatus(p) === "sakit" ? 65 : 15));

  const rings = [
    { label:"Pertumbuhan", value: growth, color:"var(--moss)" },
    { label:"Kesehatan", value: health, color:"var(--sky)" },
    { label:"Keb. Air", value: waterNeed, color:"var(--sky)" },
    { label:"Nutrisi", value: nutrition, color:"var(--gold)" },
    { label:"Risiko", value: risk, color:"var(--rust)" },
  ];
  document.getElementById('dashboard-rings').innerHTML = rings.map(r => `
    <div class="ring">
      <div style="position:relative;">
        ${ringSVG(r.value, r.color)}
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
          <span class="ring-value">${r.value}%</span>
        </div>
      </div>
      <div class="ring-label">${r.label}</div>
    </div>
  `).join('');
}

function renderNotifications(){
  const items = [];

  if(weatherEngineAvailable() && typeof NotificationService !== "undefined"){
    const plantAnalyses = AppState.plants.map(p => ({
      plantName: p.name,
      analysis: WeatherAI.analyze(buildWeatherAIContext(p), WeatherService.state),
    }));
    items.push(...NotificationService.getWeatherNotifications(WeatherService.state, plantAnalyses));
  }

  AppState.plants.forEach(p => {
    const status = getPlantStatus(p);
    if(status === "sakit") items.push({ level:"urgent", text:`${p.name} menunjukkan gejala sakit — segera cek Diagnosa AI.` });
    if(status === "siap") items.push({ level:"warn", text:`${p.name} sudah memasuki masa panen.` });
    if(needsWaterToday(p) && status !== "sakit") items.push({ level:"info", text:`${p.name} perlu disiram hari ini.` });
  });
  if(items.length === 0) items.push({ level:"info", text:"Tidak ada notifikasi penting hari ini. Kebun dalam kondisi baik." });
  document.getElementById('notif-list').innerHTML = items.slice(0,6).map(i => `
    <div class="notif-item ${i.level==='urgent'?'urgent':i.level==='warn'?'warn':''}">
      <span class="notif-dot">${i.level==='urgent'?'⚠':i.level==='warn'?'◆':'ℹ'}</span>
      <span>${i.text}</span>
    </div>`).join('');
}

function renderAIInsights(){
  const plants = AppState.plants;
  const insights = [];
  plants.forEach(p => {
    const phase = getCurrentPhase(p);
    const recs = generateRecommendations(p);
    if(recs[0]) insights.push(`<b>${p.name}</b> — Fase ${phase.name}. ${recs[0].body}`);
  });
  document.getElementById('ai-insight-list').innerHTML = insights.slice(0,4).map(t => `<div class="insight-item">${t}</div>`).join('')
    || `<div class="insight-item">Tambahkan tanaman untuk mulai menerima wawasan AI harian.</div>`;
}

function renderDashboardPlantRows(){
  const rows = AppState.plants.slice(0,6).map(p => {
    const progress = getProgressPct(p);
    const status = getPlantStatus(p);
    const statusLabel = { sehat:"Sehat", sakit:"Sakit", siap:"Siap Panen", pascapanen:"Pascapanen" }[status];
    const statusClass = { sehat:"status-sehat", sakit:"status-sakit", siap:"status-siap", pascapanen:"status-sehat" }[status];
    const icon = (PLANT_TYPES[p.type] || {}).icon || "🌱";
    return `<div class="plant-row" data-plant-id="${p.id}">
      <div class="plant-thumb">${icon}</div>
      <div><div class="plant-row-name">${p.name}</div><div class="plant-row-sub">${p.type} · ${p.location}</div></div>
      <div><div class="progress-bar-track"><div class="progress-bar-fill" style="width:${progress}%"></div></div><div class="plant-row-sub">${progress}% menuju panen</div></div>
      <div class="plant-row-sub">${getCurrentPhase(p).name}</div>
      <div class="status-pill ${statusClass}">${statusLabel}</div>
    </div>`;
  }).join('');
  document.getElementById('dashboard-plant-rows').innerHTML = rows || `<p class="muted">Belum ada tanaman. Klik "+ Tambah Tanaman" untuk memulai.</p>`;
  document.querySelectorAll('#dashboard-plant-rows .plant-row').forEach(el => {
    el.addEventListener('click', () => openPlantDetail(el.dataset.plantId));
  });
}

function renderDashboard(){
  renderGreeting();
  renderWeather();
  renderStats();
  renderProgressRings();
  renderNotifications();
  renderAIInsights();
  renderDashboardPlantRows();
  drawGrowthChart('growth-chart');
}

/* ---------------------------------------------------------
   5b. RENDERING — PLANTS LIST
--------------------------------------------------------- */

function renderPlantsList(){
  const filter = AppState.ui.plantFilter;
  let plants = AppState.plants;
  if(filter === "ready") plants = plants.filter(p => getPlantStatus(p) === "siap");
  if(filter === "sick") plants = plants.filter(p => getPlantStatus(p) === "sakit");
  if(filter === "water") plants = plants.filter(p => needsWaterToday(p));

  const grid = document.getElementById('plant-grid');
  if(plants.length === 0){
    grid.innerHTML = `<p class="muted">Tidak ada tanaman pada filter ini.</p>`;
    return;
  }
  grid.innerHTML = plants.map(p => {
    const progress = getProgressPct(p);
    const status = getPlantStatus(p);
    const statusLabel = { sehat:"Sehat", sakit:"Sakit", siap:"Siap Panen", pascapanen:"Pascapanen" }[status];
    const statusClass = { sehat:"status-sehat", sakit:"status-sakit", siap:"status-siap", pascapanen:"status-sehat" }[status];
    const icon = (PLANT_TYPES[p.type] || {}).icon || "🌱";
    const phase = getCurrentPhase(p);
    return `<div class="plant-card glass" data-plant-id="${p.id}">
      <div class="plant-card-top">
        <div class="plant-card-ico">${icon}</div>
        <span class="status-pill ${statusClass}">${statusLabel}</span>
      </div>
      <h3>${p.name}</h3>
      <div class="plant-card-meta">${p.type} · ${p.variety || '—'} · ${p.location}</div>
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${progress}%"></div></div>
      <div class="plant-card-foot"><span>${phase.name}</span><span>${progress}%</span></div>
    </div>`;
  }).join('');
  document.querySelectorAll('#plant-grid .plant-card').forEach(el => {
    el.addEventListener('click', () => openPlantDetail(el.dataset.plantId));
  });
}

/* ---------------------------------------------------------
   5c. RENDERING — PLANT DETAIL
--------------------------------------------------------- */

function openPlantDetail(id){
  AppState.ui.selectedPlantId = id;
  AppState.ui.detailTab = "info";
  navigateTo("detail");
}

function renderPlantDetail(){
  const plant = getPlant(AppState.ui.selectedPlantId);
  const container = document.getElementById('detail-content');
  if(!plant){ container.innerHTML = `<p class="muted">Tanaman tidak ditemukan.</p>`; return; }

  const icon = (PLANT_TYPES[plant.type] || {}).icon || "🌱";
  const phase = getCurrentPhase(plant);
  const progress = getProgressPct(plant);
  const age = daysSince(plant.plantedDate);
  const harvest = estimateHarvest(plant);

  container.innerHTML = `
    <div class="detail-head">
      <div class="detail-ico">${icon}</div>
      <div>
        <h2>${plant.name}</h2>
        <p class="muted">${plant.type} · ${plant.variety || 'Tanpa varietas'} · ${plant.location} · Umur ${age} hari</p>
      </div>
    </div>

    <div class="phase-badge"><span>🌱</span><div>Fase saat ini: <b>${phase.name}</b> — ${progress}% menuju panen</div></div>

    <div class="detail-tabs" id="detail-tabs">
      <button class="detail-tab active" data-tab="info">Info Tanaman</button>
      <button class="detail-tab" data-tab="timeline">Timeline</button>
      <button class="detail-tab" data-tab="phase">Fase Pertumbuhan</button>
      <button class="detail-tab" data-tab="ai">Rekomendasi AI</button>
      <button class="detail-tab" data-tab="journal">Jurnal</button>
    </div>

    <div class="detail-panel active" data-panel="info">
      <div class="card glass">
        <p class="eyebrow">Data Tanaman</p>
        <div class="info-grid">
          <div class="info-item"><span>Tanggal Tanam</span><b>${new Date(plant.plantedDate).toLocaleDateString('id-ID')}</b></div>
          <div class="info-item"><span>Jumlah Tanaman</span><b>${plant.count}</b></div>
          <div class="info-item"><span>Luas Lahan</span><b>${plant.area} m²</b></div>
          <div class="info-item"><span>Media Tanam</span><b>${plant.media}</b></div>
          <div class="info-item"><span>pH Tanah</span><b>${plant.ph}</b></div>
          <div class="info-item"><span>Jenis Tanah</span><b>${plant.soil}</b></div>
          <div class="info-item"><span>Suhu</span><b>${plant.temp}°C</b></div>
          <div class="info-item"><span>Kelembapan</span><b>${plant.humidity}%</b></div>
        </div>
      </div>
      <div class="card glass" style="margin-top:16px;">
        <p class="eyebrow">Estimasi Panen</p>
        <div class="info-grid">
          <div class="info-item"><span>Tanggal Panen</span><b>${new Date(harvest.date).toLocaleDateString('id-ID')}</b></div>
          <div class="info-item"><span>Estimasi Bobot</span><b>${harvest.weightKg} kg</b></div>
          <div class="info-item"><span>Tingkat Keberhasilan</span><b>${harvest.successRate}%</b></div>
        </div>
      </div>
      <div style="margin-top:16px;">
        <button class="btn btn-danger" id="delete-plant-btn">Hapus Tanaman</button>
      </div>
    </div>

    <div class="detail-panel" data-panel="timeline">
      <div class="card glass">
        <p class="eyebrow">Timeline Otomatis</p>
        <div class="timeline">
          ${generateTimeline(plant).map(t => `
            <div class="tl-item ${t.done ? 'done':''} ${t.isToday ? 'today':''}">
              <div class="tl-day">Hari ke-${t.day}</div>
              <div class="tl-title">${t.title}</div>
            </div>`).join('')}
        </div>
      </div>
    </div>

    <div class="detail-panel" data-panel="phase">
      <div class="card glass">
        <p class="eyebrow">Detail Fase: ${phase.name}</p>
        <p>${phase.desc}</p>
        <div class="info-grid" style="margin-top:10px;">
          <div class="info-item"><span>Target</span><b style="font-family:var(--font-body);font-size:.85rem;">${phase.target}</b></div>
          <div class="info-item"><span>Kebutuhan Air</span><b style="font-family:var(--font-body);font-size:.85rem;">${phase.water}</b></div>
          <div class="info-item"><span>Kebutuhan Nutrisi</span><b style="font-family:var(--font-body);font-size:.85rem;">${phase.nutrition}</b></div>
          <div class="info-item"><span>Intensitas Cahaya</span><b style="font-family:var(--font-body);font-size:.85rem;">${phase.light}</b></div>
          <div class="info-item"><span>Risiko</span><b style="font-family:var(--font-body);font-size:.85rem;">${phase.risk}</b></div>
        </div>
        <div style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div><p class="eyebrow">Yang Harus Dilakukan</p><ul>${phase.todo.map(t=>`<li>${t}</li>`).join('')}</ul></div>
          <div><p class="eyebrow">Yang Harus Dihindari</p><ul>${phase.avoid.map(t=>`<li>${t}</li>`).join('')}</ul></div>
        </div>
      </div>
    </div>

    <div class="detail-panel" data-panel="ai">
      <div class="card glass">
        <p class="eyebrow">✦ Rekomendasi AI Untuk Tanaman Ini</p>
        <div class="rec-list">
          ${generateRecommendations(plant).map(r => `<div class="rec-item"><b>${r.title}</b>${r.body}</div>`).join('')}
        </div>
      </div>
    </div>

    <div class="detail-panel" data-panel="journal">
      <div class="card glass">
        <div class="row-between">
          <p class="eyebrow">Jurnal Tanaman Ini</p>
          <button class="btn btn-secondary" id="detail-add-journal-btn">+ Catatan</button>
        </div>
        <div id="detail-journal-list" class="journal-list"></div>
      </div>
    </div>
  `;

  // tabs
  container.querySelectorAll('.detail-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
      container.querySelectorAll('.detail-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      container.querySelector(`.detail-panel[data-panel="${tab.dataset.tab}"]`).classList.add('active');
    });
  });

  document.getElementById('delete-plant-btn').addEventListener('click', () => {
    if(confirm(`Hapus tanaman "${plant.name}"? Tindakan ini tidak dapat dibatalkan.`)){
      deletePlant(plant.id);
      showToast("Tanaman dihapus.");
      navigateTo("plants");
    }
  });

  const entries = AppState.journal.filter(j => j.plantId === plant.id);
  document.getElementById('detail-journal-list').innerHTML = entries.length
    ? entries.map(renderJournalEntryHTML).join('')
    : `<p class="muted">Belum ada catatan untuk tanaman ini.</p>`;
  document.getElementById('detail-add-journal-btn').addEventListener('click', () => openJournalModal(plant.id));
}

/* ---------------------------------------------------------
   5d. RENDERING — CALENDAR
--------------------------------------------------------- */

function getScheduleEvents(){
  // Derive calendar events from each plant's timeline, projected onto real dates.
  const events = [];
  AppState.plants.forEach(p => {
    const planted = new Date(p.plantedDate);
    generateTimeline(p).forEach(t => {
      const d = new Date(planted.getTime() + t.day * 86400000);
      events.push({ date: d, title: `${p.name}: ${t.title}`, plantId: p.id, isHarvest: t.title === "Panen" });
    });
  });
  return events;
}

function renderCalendar(){
  const { calMonth, calYear } = AppState.ui;
  const monthLabel = new Date(calYear, calMonth, 1).toLocaleDateString('id-ID', { month:'long', year:'numeric' });
  document.getElementById('cal-month-label').textContent = monthLabel;

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const events = getScheduleEvents();
  const today = new Date();

  const dows = ["Min","Sen","Sel","Rab","Kam","Jum","Sab"];
  let html = dows.map(d => `<div class="cal-dow">${d}</div>`).join('');
  for(let i=0;i<firstDay;i++) html += `<div class="cal-cell empty"></div>`;
  for(let day=1; day<=daysInMonth; day++){
    const cellDate = new Date(calYear, calMonth, day);
    const isToday = cellDate.toDateString() === today.toDateString();
    const dayEvents = events.filter(e => e.date.toDateString() === cellDate.toDateString());
    html += `<div class="cal-cell ${isToday ? 'today':''}">
      <div class="cal-daynum">${day}</div>
      ${dayEvents.slice(0,2).map(e => `<div class="cal-event ${e.isHarvest ? 'rust':''}">${e.title}</div>`).join('')}
      ${dayEvents.length > 2 ? `<div class="cal-event">+${dayEvents.length-2} lagi</div>` : ''}
    </div>`;
  }
  document.getElementById('calendar-grid').innerHTML = html;

  const upcoming = events.filter(e => e.date >= today).sort((a,b)=>a.date-b.date).slice(0,8);
  document.getElementById('agenda-list').innerHTML = upcoming.length ? upcoming.map(e => `
    <div class="notif-item ${e.isHarvest ? 'warn':''}">
      <span class="notif-dot">${e.isHarvest ? '◆':'▸'}</span>
      <span><b>${e.date.toLocaleDateString('id-ID',{day:'numeric',month:'short'})}</b> — ${e.title}</span>
    </div>`).join('') : `<p class="muted">Tidak ada agenda mendatang.</p>`;
}

/* ---------------------------------------------------------
   5e. RENDERING — DIAGNOSIS
--------------------------------------------------------- */

function renderDiagnosisSetup(){
  const grid = document.getElementById('symptom-grid');
  grid.innerHTML = ALL_SYMPTOMS.map(s => `<button type="button" class="symptom-chip" data-symptom="${s}">${s}</button>`).join('');
  grid.querySelectorAll('.symptom-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const s = chip.dataset.symptom;
      const idx = AppState.ui.selectedSymptoms.indexOf(s);
      if(idx === -1) AppState.ui.selectedSymptoms.push(s); else AppState.ui.selectedSymptoms.splice(idx,1);
      chip.classList.toggle('selected');
    });
  });

  const select = document.getElementById('diagnosis-plant-select');
  select.innerHTML = `<option value="">Tanaman umum (tanpa memilih spesifik)</option>` +
    AppState.plants.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

  renderPestDatabase();
}

function renderPestDatabase(){
  const grid = document.getElementById('pest-database-grid');
  const dangerClass = { low:"danger-low", med:"danger-med", high:"danger-high" };
  const dangerLabel = { low:"Risiko Rendah", med:"Risiko Sedang", high:"Risiko Tinggi" };
  grid.innerHTML = DISEASE_DB.map(d => `
    <div class="pest-card">
      <span class="pest-danger ${dangerClass[d.danger]}">${dangerLabel[d.danger]}</span>
      <h4>${d.name} <span class="muted" style="font-size:.7rem;">(${d.type})</span></h4>
      <p><b>Penyebab:</b> ${d.cause}</p>
      <p><b>Pencegahan:</b> ${d.prevention}</p>
    </div>`).join('');
}

function runDiagnosis(){
  const results = diagnoseSymptoms(AppState.ui.selectedSymptoms);
  const resultDiv = document.getElementById('diagnosis-result');
  if(AppState.ui.selectedSymptoms.length === 0){
    resultDiv.innerHTML = `<p class="muted">Pilih minimal satu gejala untuk menjalankan diagnosa.</p>`;
    return;
  }
  if(results.length === 0){
    resultDiv.innerHTML = `<p class="muted">Tidak ditemukan kecocokan pada database. Coba pilih gejala lain atau konsultasikan ke penyuluh pertanian setempat.</p>`;
    return;
  }
  resultDiv.innerHTML = results.slice(0,4).map(r => `
    <div class="diag-result-item">
      <div class="row-between"><b style="font-family:var(--font-display);">${r.name}</b><span class="diag-confidence">${r.confidence}%</span></div>
      <div class="confidence-track"><div class="confidence-fill" style="width:${r.confidence}%"></div></div>
      <p style="font-size:.82rem;margin:4px 0;"><b>Solusi:</b> ${r.treatment}</p>
      <p style="font-size:.82rem;margin:4px 0;"><b>Pencegahan:</b> ${r.prevention}</p>
      <p style="font-size:.78rem;margin:4px 0;color:var(--ink-soft);">Jadwal penanganan: mulai dalam 1–2 hari untuk mencegah penyebaran.</p>
    </div>`).join('');
}

/* ---------------------------------------------------------
   6. CANVAS CHARTS (no external library)
--------------------------------------------------------- */

function getCSSVar(name){
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function hexToRgba(hex, alpha){
  let h = hex.replace('#','');
  if(h.length === 3) h = h.split('').map(c=>c+c).join('');
  const r = parseInt(h.substring(0,2),16), g = parseInt(h.substring(2,4),16), b = parseInt(h.substring(4,6),16);
  if(Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return `rgba(63,97,72,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

function setupCanvas(canvas){
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width || canvas.parentElement.clientWidth || 400;
  const h = canvas.height || 180;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { ctx, w, h };
}

function drawLineChart(canvasId, labels, series, colorVar){
  const canvas = document.getElementById(canvasId);
  if(!canvas) return;
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0,0,w,h);
  const padding = { top:10, right:10, bottom:24, left:34 };
  const max = Math.max(...series, 1) * 1.15;
  const stepX = (w - padding.left - padding.right) / (labels.length - 1 || 1);
  const color = getCSSVar(colorVar) || '#3F6148';
  const ink = getCSSVar('--ink-soft') || '#666';

  // gridlines
  ctx.strokeStyle = 'rgba(120,140,110,0.18)';
  ctx.lineWidth = 1;
  for(let i=0;i<=3;i++){
    const y = padding.top + (h - padding.top - padding.bottom) * (i/3);
    ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(w - padding.right, y); ctx.stroke();
  }

  // area + line
  ctx.beginPath();
  series.forEach((v,i) => {
    const x = padding.left + i*stepX;
    const y = padding.top + (h - padding.top - padding.bottom) * (1 - v/max);
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.strokeStyle = color; ctx.lineWidth = 2.4; ctx.lineJoin='round'; ctx.stroke();

  const lastX = padding.left; const lastY = padding.top + (h-padding.top-padding.bottom)*(1-series[0]/max);
  ctx.lineTo(padding.left + (labels.length-1)*stepX, h - padding.bottom);
  ctx.lineTo(padding.left, h - padding.bottom);
  ctx.closePath();
  ctx.fillStyle = hexToRgba(color, 0.14);
  try{ ctx.fill(); }catch(e){}

  // points + x labels
  ctx.font = '10px "Space Mono", monospace';
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  series.forEach((v,i) => {
    const x = padding.left + i*stepX;
    const y = padding.top + (h - padding.top - padding.bottom) * (1 - v/max);
    ctx.beginPath(); ctx.arc(x,y,2.6,0,Math.PI*2); ctx.fillStyle=color; ctx.fill();
    if(i % Math.ceil(labels.length/6) === 0){
      ctx.fillStyle = ink;
      ctx.fillText(labels[i], x, h - 6);
    }
  });
}

function drawBarChart(canvasId, labels, series, colorVar){
  const canvas = document.getElementById(canvasId);
  if(!canvas) return;
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0,0,w,h);
  const padding = { top:10, right:10, bottom:28, left:34 };
  const max = Math.max(...series, 1) * 1.2;
  const color = getCSSVar(colorVar) || '#3F6148';
  const ink = getCSSVar('--ink-soft') || '#666';
  const bw = (w - padding.left - padding.right) / labels.length * 0.6;
  const gap = (w - padding.left - padding.right) / labels.length;

  ctx.strokeStyle = 'rgba(120,140,110,0.18)';
  for(let i=0;i<=3;i++){
    const y = padding.top + (h - padding.top - padding.bottom) * (i/3);
    ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(w - padding.right, y); ctx.stroke();
  }

  ctx.font = '10px "Space Mono", monospace';
  ctx.textAlign = 'center';
  series.forEach((v,i) => {
    const barH = (h - padding.top - padding.bottom) * (v/max);
    const x = padding.left + i*gap + (gap-bw)/2;
    const y = h - padding.bottom - barH;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x,y,bw,barH,[4,4,0,0]) : ctx.rect(x,y,bw,barH);
    ctx.fill();
    ctx.fillStyle = ink;
    ctx.fillText(labels[i], x + bw/2, h - 8);
  });
}

function drawGrowthChart(canvasId){
  const days = Array.from({length:10}, (_,i) => `H${i*3}`);
  const plants = AppState.plants;
  const series = days.map((_,i) => {
    const avg = plants.length ? plants.reduce((sum,p) => {
      const cycle = getCycleDays(p);
      const age = Math.max(0, daysSince(p.plantedDate) - (9-i)*3);
      return sum + Math.min(100, Math.round((age/cycle)*100));
    }, 0) / plants.length : 0;
    return Math.round(avg);
  });
  drawLineChart(canvasId, days, series, '--moss');
}

function renderAnalyticsCharts(){
  const plants = AppState.plants;
  drawGrowthChart('chart-growth');

  const waterLabels = ["M1","M2","M3","M4"];
  const waterSeries = waterLabels.map(() => Math.round(plants.length * (8 + Math.random()*6)));
  drawBarChart('chart-water', waterLabels, waterSeries, '--sky');

  const fertLabels = ["Jan","Feb","Mar","Apr","Mei"];
  const fertSeries = fertLabels.map(() => Math.round(plants.length * (0.6 + Math.random()*0.6) * 10)/10);
  drawBarChart('chart-fert', fertLabels, fertSeries, '--gold');

  const totalCost = AppState.costs.reduce((s,c)=>s+c.amount,0);
  const estRevenue = plants.reduce((s,p) => {
    const h = estimateHarvest(p);
    const price = (PLANT_TYPES[p.type]||{}).basePrice || 8000;
    return s + h.weightKg * price;
  }, 0);
  drawBarChart('chart-cost', ["Biaya","Estimasi Untung"], [totalCost, Math.max(0,estRevenue-totalCost)], '--rust');

  const phaseCount = {};
  plants.forEach(p => { const ph = getCurrentPhase(p).name; phaseCount[ph] = (phaseCount[ph]||0)+1; });
  const phaseLabels = Object.keys(phaseCount);
  drawBarChart('chart-phase', phaseLabels.length?phaseLabels:["-"], phaseLabels.length?phaseLabels.map(k=>phaseCount[k]):[0], '--moss');

  const byType = {};
  plants.forEach(p => { byType[p.type] = (byType[p.type]||0) + estimateHarvest(p).weightKg; });
  const typeLabels = Object.keys(byType);
  drawBarChart('chart-productivity', typeLabels.length?typeLabels:["-"], typeLabels.length?typeLabels.map(k=>Math.round(byType[k]*10)/10):[0], '--earth');
}

/* ---------------------------------------------------------
   5f. RENDERING — COSTS
--------------------------------------------------------- */

function renderCosts(){
  const costs = AppState.costs;
  const plants = AppState.plants;
  const totalExpense = costs.reduce((s,c)=>s+c.amount,0);
  const modalCategories = ["Bibit","Peralatan"];
  const totalModal = costs.filter(c=>modalCategories.includes(c.category)).reduce((s,c)=>s+c.amount,0);
  const estWeightTotal = plants.reduce((s,p)=>s+estimateHarvest(p).weightKg,0) || 1;
  const hpp = totalExpense / estWeightTotal;
  const estRevenue = plants.reduce((s,p) => {
    const h = estimateHarvest(p);
    const price = (PLANT_TYPES[p.type]||{}).basePrice || 8000;
    return s + h.weightKg * price;
  }, 0);
  const roi = totalExpense > 0 ? Math.round(((estRevenue - totalExpense) / totalExpense) * 100) : 0;

  document.getElementById('cost-total-modal').textContent = formatRupiah(totalModal);
  document.getElementById('cost-total-expense').textContent = formatRupiah(totalExpense);
  document.getElementById('cost-hpp').textContent = formatRupiah(hpp) + "/kg";
  document.getElementById('cost-roi').textContent = roi + "%";

  const tbody = document.querySelector('#cost-table tbody');
  tbody.innerHTML = costs.length ? costs.map(c => {
    const plant = plants.find(p=>p.id===c.plantId);
    return `<tr>
      <td>${new Date(c.date).toLocaleDateString('id-ID')}</td>
      <td>${c.category}</td>
      <td>${plant ? plant.name : 'Umum'}</td>
      <td>${c.note || '-'}</td>
      <td>${formatRupiah(c.amount)}</td>
      <td><button class="row-delete" data-cost-id="${c.id}">✕</button></td>
    </tr>`;
  }).join('') : `<tr><td colspan="6" class="muted">Belum ada data biaya.</td></tr>`;

  tbody.querySelectorAll('.row-delete').forEach(btn => {
    btn.addEventListener('click', () => { deleteCostEntry(btn.dataset.costId); renderCosts(); showToast("Biaya dihapus."); });
  });
}

/* ---------------------------------------------------------
   5g. RENDERING — JOURNAL
--------------------------------------------------------- */

function renderJournalEntryHTML(j){
  const plant = getPlant(j.plantId);
  const condClass = j.condition === "Sakit" ? "status-sakit" : j.condition === "Perlu Perhatian" ? "status-siap" : "status-sehat";
  return `<div class="journal-entry">
    <div class="journal-entry-head">
      <span>${plant ? plant.name : 'Tanaman tidak diketahui'} · ${new Date(j.date).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric', hour:'2-digit', minute:'2-digit'})}</span>
      <span class="journal-condition ${condClass}">${j.condition}</span>
    </div>
    <p style="margin:0;font-size:.88rem;">${j.note || '<span class="muted">Tidak ada catatan tertulis.</span>'}</p>
  </div>`;
}

function renderJournal(){
  const list = document.getElementById('journal-list');
  list.innerHTML = AppState.journal.length
    ? AppState.journal.map(renderJournalEntryHTML).join('')
    : `<p class="muted">Belum ada catatan jurnal. Klik "+ Catatan Baru" untuk menambahkan.</p>`;
}

/* ---------------------------------------------------------
   5h. RENDERING — SETTINGS
--------------------------------------------------------- */

function renderSettings(){
  document.getElementById('setting-name').value = AppState.settings.name;
  document.getElementById('setting-location').value = AppState.settings.location;
  const toggle = document.getElementById('settings-dark-toggle');
  toggle.classList.toggle('active', AppState.settings.dark);

  const loc = LocationService.resolveLocation();
  document.getElementById('setting-loc-city').value = loc.city || "";
  document.getElementById('setting-loc-province').value = loc.province || "";
  document.getElementById('setting-loc-lat').value = loc.lat ?? "";
  document.getElementById('setting-loc-lon').value = loc.lon ?? "";
  document.getElementById('setting-weatherapi-key').value = AppState.settings.weatherApiKey || "";
  document.getElementById('setting-owm-key').value = AppState.settings.owmApiKey || "";
  document.getElementById('setting-bmkg-adm4').value = AppState.settings.bmkgAdm4 || "";
}

/* ---------------------------------------------------------
   5i. GLOBAL SEARCH
--------------------------------------------------------- */

function runGlobalSearch(query){
  const resultsBox = document.getElementById('search-results');
  const q = query.trim().toLowerCase();
  if(q.length < 1){ resultsBox.classList.add('hidden'); resultsBox.innerHTML=''; return; }

  const results = [];
  AppState.plants.forEach(p => {
    if(p.name.toLowerCase().includes(q) || p.type.toLowerCase().includes(q) || p.location.toLowerCase().includes(q)){
      results.push({ tag:"Tanaman", label:p.name, action:()=>openPlantDetail(p.id) });
    }
  });
  DISEASE_DB.forEach(d => {
    if(d.name.toLowerCase().includes(q)){
      results.push({ tag:d.type, label:d.name, action:()=>navigateTo('diagnosis') });
    }
  });
  Object.keys(FERTILIZER_DB).forEach(f => {
    if(f.toLowerCase().includes(q)){
      results.push({ tag:"Pupuk", label:f, action:()=>navigateTo('diagnosis') });
    }
  });

  if(results.length === 0){
    resultsBox.innerHTML = `<div class="sr-item muted">Tidak ada hasil untuk "${query}"</div>`;
  } else {
    resultsBox.innerHTML = results.slice(0,8).map((r,i) => `<div class="sr-item" data-idx="${i}"><span class="sr-tag">${r.tag}</span>${r.label}</div>`).join('');
    resultsBox.querySelectorAll('.sr-item').forEach((el,i) => {
      el.addEventListener('click', () => { results[i].action(); resultsBox.classList.add('hidden'); document.getElementById('global-search').value=''; });
    });
  }
  resultsBox.classList.remove('hidden');
}

/* ---------------------------------------------------------
   6b. EXPORT
--------------------------------------------------------- */

function exportJSON(){
  const data = { plants: AppState.plants, journal: AppState.journal, costs: AppState.costs, exportedAt: new Date().toISOString() };
  downloadFile(`tumbuh-data-${Date.now()}.json`, JSON.stringify(data, null, 2), 'application/json');
  showToast("Data berhasil diexport (JSON).");
}

function exportCSV(){
  const header = ["Nama","Jenis","Varietas","Lokasi","Tanggal Tanam","Jumlah","Fase","Progress(%)","Status"];
  const rows = AppState.plants.map(p => [
    p.name, p.type, p.variety, p.location, p.plantedDate, p.count,
    getCurrentPhase(p).name, getProgressPct(p), getPlantStatus(p)
  ]);
  const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  downloadFile(`tumbuh-tanaman-${Date.now()}.csv`, csv, 'text/csv');
  showToast("Data berhasil diexport (CSV).");
}

function downloadFile(filename, content, mime){
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---------------------------------------------------------
   7. TOAST
--------------------------------------------------------- */

function showToast(msg){
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/* ---------------------------------------------------------
   8. ROUTER
--------------------------------------------------------- */

const VIEW_META = {
  dashboard: { title:"Dashboard", subtitle:"Ringkasan kebun Anda hari ini" },
  plants: { title:"Tanaman Saya", subtitle:"Kelola seluruh tanaman dari satu tempat" },
  detail: { title:"Detail Tanaman", subtitle:"Timeline, fase, dan rekomendasi AI" },
  calendar: { title:"Kalender Tani", subtitle:"Jadwal penyiraman, pemupukan, dan panen" },
  diagnosis: { title:"Diagnosa AI", subtitle:"Deteksi penyakit & hama dari gejala yang terlihat" },
  analytics: { title:"Analitik", subtitle:"Data pertumbuhan, biaya, dan produktivitas kebun" },
  costs: { title:"Biaya & Hasil", subtitle:"Kelola modal, pengeluaran, dan estimasi keuntungan" },
  journal: { title:"Jurnal Harian", subtitle:"Catatan pengamatan harian untuk setiap tanaman" },
  settings: { title:"Pengaturan", subtitle:"Profil, tampilan, dan pengelolaan data" },
};

function navigateTo(view){
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
  document.getElementById('view-title').textContent = VIEW_META[view].title;
  document.getElementById('view-subtitle').textContent = VIEW_META[view].subtitle;
  document.getElementById('sidebar').classList.remove('open');

  renderView(view);
  window.scrollTo({ top:0, behavior:'smooth' });
}

function renderView(view){
  switch(view){
    case 'dashboard': renderDashboard(); break;
    case 'plants': renderPlantsList(); break;
    case 'detail': renderPlantDetail(); break;
    case 'calendar': renderCalendar(); break;
    case 'diagnosis': renderDiagnosisSetup(); break;
    case 'analytics': renderAnalyticsCharts(); break;
    case 'costs': renderCosts(); break;
    case 'journal': renderJournal(); break;
    case 'settings': renderSettings(); break;
  }
}

/* ---------------------------------------------------------
   9. MODALS
--------------------------------------------------------- */

function openPlantModal(){
  const select = document.getElementById('plant-type-select');
  select.innerHTML = Object.keys(PLANT_TYPES).map(t => `<option value="${t}">${t}</option>`).join('');
  document.getElementById('plant-form').reset();
  document.getElementById('plant-form').querySelector('[name="plantedDate"]').value = new Date().toISOString().slice(0,10);
  document.getElementById('plant-modal-overlay').classList.remove('hidden');
}
function closePlantModal(){ document.getElementById('plant-modal-overlay').classList.add('hidden'); }

function openJournalModal(preselectPlantId){
  const select = document.getElementById('journal-plant-select');
  select.innerHTML = AppState.plants.map(p => `<option value="${p.id}" ${p.id===preselectPlantId?'selected':''}>${p.name}</option>`).join('');
  document.getElementById('journal-form').reset();
  document.getElementById('journal-modal-overlay').classList.remove('hidden');
}
function closeJournalModal(){ document.getElementById('journal-modal-overlay').classList.add('hidden'); }

function openCostModal(){
  const select = document.getElementById('cost-plant-select');
  select.innerHTML = `<option value="">Umum</option>` + AppState.plants.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  document.getElementById('cost-form').reset();
  document.getElementById('cost-form').querySelector('[name="date"]').value = new Date().toISOString().slice(0,10);
  document.getElementById('cost-modal-overlay').classList.remove('hidden');
}
function closeCostModal(){ document.getElementById('cost-modal-overlay').classList.add('hidden'); }

/* ---------------------------------------------------------
   10. THEME
--------------------------------------------------------- */

function applyTheme(dark){
  document.documentElement.classList.toggle('dark', dark);
  AppState.settings.dark = dark;
  saveState('settings');
}

/* ---------------------------------------------------------
   11. INIT + EVENT WIRING
--------------------------------------------------------- */

function init(){
  // boot loader fade-out — first thing, unconditionally, so the app never
  // gets stuck on the loading screen even if something below throws.
  setTimeout(() => document.getElementById('boot-loader').classList.add('done'), 500);

  seedDataIfEmpty();
  applyTheme(AppState.settings.dark);

  // ---- Weather Engine: start fetching + auto-refresh every 5 minutes ----
  // Wrapped defensively: if any weather-engine file failed to load (bad path,
  // blocked request, etc.) the rest of the app must keep working normally.
  try{
    WeatherService.subscribe(() => {
      // Re-render whatever is weather-dependent on the currently active view,
      // plus the dashboard's own weather widgets, without a page refresh.
      const activeView = document.querySelector('.view.active');
      const activeId = activeView ? activeView.id.replace('view-', '') : '';
      renderWeather();
      if(activeId === 'dashboard') renderDashboard();
      if(activeId === 'plants') renderPlantsList();
      if(activeId === 'detail') renderPlantDetail();
      if(activeId === 'calendar') renderCalendar();
    });
    WeatherService.init();
  }catch(e){
    console.error("Weather Engine gagal dimulai:", e);
  }

  // nav
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.view));
  });
  document.querySelectorAll('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.goto));
  });

  // mobile menu
  document.getElementById('mobile-menu-btn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
  document.getElementById('mobile-search-btn').addEventListener('click', () => {
    document.getElementById('global-search').focus();
  });
  document.addEventListener("DOMContentLoaded", () => {

    const menuBtn = document.getElementById("mobile-menu-btn");
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("mobile-overlay");

    if (!menuBtn || !sidebar) return;

    menuBtn.addEventListener("click", () => {
        sidebar.classList.toggle("open");

        if (overlay) {
            overlay.classList.toggle("show");
        }
    });

    if (overlay) {
        overlay.addEventListener("click", () => {
            sidebar.classList.remove("open");
            overlay.classList.remove("show");
        });
    }

});
  // theme toggles
  document.getElementById('theme-toggle').addEventListener('click', () => applyTheme(!AppState.settings.dark));
  document.getElementById('settings-dark-toggle').addEventListener('click', () => {
    applyTheme(!AppState.settings.dark);
    renderSettings();
  });

  // search
  const searchInput = document.getElementById('global-search');
  searchInput.addEventListener('input', (e) => runGlobalSearch(e.target.value));
  document.addEventListener('click', (e) => {
    if(!e.target.closest('.search-wrap')) document.getElementById('search-results').classList.add('hidden');
  });

  // add plant
  document.getElementById('add-plant-btn').addEventListener('click', openPlantModal);
  document.getElementById('close-plant-modal').addEventListener('click', closePlantModal);
  document.getElementById('cancel-plant-modal').addEventListener('click', closePlantModal);
  document.getElementById('plant-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    addPlant({
      name: fd.get('name'), type: fd.get('type'), variety: fd.get('variety'),
      location: fd.get('location'), plantedDate: fd.get('plantedDate'),
      count: Number(fd.get('count'))||1, area: Number(fd.get('area'))||0,
      media: fd.get('media'), ph: Number(fd.get('ph'))||6.5, soil: fd.get('soil'),
      temp: Number(fd.get('temp'))||27, humidity: Number(fd.get('humidity'))||70,
    });
    closePlantModal();
    showToast("Tanaman berhasil ditambahkan.");
    navigateTo('plants');
  });

  // plant filters
  document.getElementById('plant-filters').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if(!chip) return;
    document.querySelectorAll('#plant-filters .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    AppState.ui.plantFilter = chip.dataset.filter;
    renderPlantsList();
  });

  // calendar nav
  document.getElementById('cal-prev').addEventListener('click', () => {
    AppState.ui.calMonth--; if(AppState.ui.calMonth < 0){ AppState.ui.calMonth = 11; AppState.ui.calYear--; }
    renderCalendar();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    AppState.ui.calMonth++; if(AppState.ui.calMonth > 11){ AppState.ui.calMonth = 0; AppState.ui.calYear++; }
    renderCalendar();
  });

  // diagnosis
  document.getElementById('run-diagnosis-btn').addEventListener('click', runDiagnosis);

  // journal
  document.getElementById('add-journal-btn').addEventListener('click', () => openJournalModal(AppState.plants[0] ? AppState.plants[0].id : null));
  document.getElementById('close-journal-modal').addEventListener('click', closeJournalModal);
  document.getElementById('cancel-journal-modal').addEventListener('click', closeJournalModal);
  document.getElementById('journal-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    addJournalEntry({ plantId: fd.get('plantId'), condition: fd.get('condition'), note: fd.get('note') });
    closeJournalModal();
    showToast("Catatan jurnal disimpan.");
    renderJournal();
    if(document.getElementById('view-detail').classList.contains('active')) renderPlantDetail();
  });

  // costs
  document.getElementById('add-cost-btn').addEventListener('click', openCostModal);
  document.getElementById('close-cost-modal').addEventListener('click', closeCostModal);
  document.getElementById('cancel-cost-modal').addEventListener('click', closeCostModal);
  document.getElementById('cost-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    addCostEntry({ date: fd.get('date') || new Date().toISOString().slice(0,10), category: fd.get('category'), plantId: fd.get('plantId'), note: fd.get('note'), amount: fd.get('amount') });
    closeCostModal();
    showToast("Biaya ditambahkan.");
    renderCosts();
  });

  // settings
  document.getElementById('setting-name').addEventListener('change', (e) => { AppState.settings.name = e.target.value; saveState('settings'); });
  document.getElementById('setting-location').addEventListener('change', (e) => { AppState.settings.location = e.target.value; saveState('settings'); });
  document.getElementById('export-json-btn').addEventListener('click', exportJSON);
  document.getElementById('export-csv-btn').addEventListener('click', exportCSV);
  document.getElementById('reset-data-btn').addEventListener('click', () => {
    if(confirm("Reset seluruh data ke kondisi awal? Tindakan ini tidak dapat dibatalkan.")){
      AppState.plants = []; AppState.journal = []; AppState.costs = [];
      saveState('plants'); saveState('journal'); saveState('costs');
      seedDataIfEmpty();
      showToast("Data telah direset.");
      navigateTo('dashboard');
    }
  });

  // ---- Weather Engine: location + provider controls ----
  async function handleUseLocation(btn){
    const originalLabel = btn.textContent;
    btn.disabled = true; btn.textContent = "Mencari lokasi…";
    try{
      const loc = await LocationService.useMyLocation();
      await WeatherService.useLocation(loc);
      showToast(`Lokasi diperbarui ke ${loc.city}${loc.province ? ', ' + loc.province : ''}.`);
      renderSettings();
    }catch(e){
      showToast(e.message || "Gagal mengambil lokasi. Periksa izin lokasi peramban Anda.");
    }finally{
      btn.disabled = false; btn.textContent = originalLabel;
    }
  }
  async function handleRefreshLocation(btn){
    const originalLabel = btn.textContent;
    btn.disabled = true; btn.textContent = "Memperbarui…";
    try{
      const current = LocationService.resolveLocation();
      const loc = await LocationService.refreshLocationNames(current.lat, current.lon);
      await WeatherService.useLocation(loc);
      showToast("Lokasi & data cuaca diperbarui.");
      renderSettings();
    }catch(e){
      showToast("Gagal memperbarui lokasi.");
    }finally{
      btn.disabled = false; btn.textContent = originalLabel;
    }
  }
  document.getElementById('btn-use-location').addEventListener('click', (e) => handleUseLocation(e.currentTarget));
  document.getElementById('btn-refresh-location').addEventListener('click', (e) => handleRefreshLocation(e.currentTarget));
  document.getElementById('settings-use-location-btn').addEventListener('click', (e) => handleUseLocation(e.currentTarget));
  document.getElementById('settings-refresh-location-btn').addEventListener('click', (e) => handleRefreshLocation(e.currentTarget));

  document.getElementById('settings-save-location-btn').addEventListener('click', () => {
    const city = document.getElementById('setting-loc-city').value.trim();
    const province = document.getElementById('setting-loc-province').value.trim();
    const lat = document.getElementById('setting-loc-lat').value;
    const lon = document.getElementById('setting-loc-lon').value;
    if(lat === "" || lon === "" || isNaN(Number(lat)) || isNaN(Number(lon))){
      showToast("Latitude & longitude harus diisi dengan angka yang valid.");
      return;
    }
    const loc = LocationService.setManualLocation({ lat, lon, city: city || "Lokasi Kebun", province, country:"Indonesia" });
    WeatherService.useLocation(loc);
    showToast("Lokasi manual disimpan, memuat data cuaca…");
  });

  document.getElementById('settings-save-providers-btn').addEventListener('click', () => {
    AppState.settings.weatherApiKey = document.getElementById('setting-weatherapi-key').value.trim();
    AppState.settings.owmApiKey = document.getElementById('setting-owm-key').value.trim();
    AppState.settings.bmkgAdm4 = document.getElementById('setting-bmkg-adm4').value.trim();
    saveState('settings');
    showToast("Pengaturan provider disimpan.");
    WeatherService.refresh();
  });

  // resize -> redraw charts
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const active = document.querySelector('.view.active').id.replace('view-','');
      if(active === 'dashboard') drawGrowthChart('growth-chart');
      if(active === 'analytics') renderAnalyticsCharts();
    }, 200);
  });

  navigateTo('dashboard');
}

document.addEventListener('DOMContentLoaded', init);