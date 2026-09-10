// ================================================================
// EcoRoute AI — Simulated Dataset  (data.js)
// Ward: Shivajinagar–Deccan area, Pune, Maharashtra, India
//
// ⚠  PROTOTYPE SIMULATION — All data below is synthetic and
//    deterministic. No real sensors, APIs, or municipal records
//    are used. See window.ECO.SIM_META for full assumptions.
// ================================================================

'use strict';

// ── Deterministic simulation reference time ──────────────────────
// Fixed at 09:00 IST on the demo date so results never vary.
const SIM_BASE = new Date('2026-09-10T09:00:00+05:30');

// ── Geographic bounds of the SVG viewport ────────────────────────
// SVG is 800 × 560 px; maps to a ~2.2 km × 1.7 km patch of
// Shivajinagar–Deccan, Pune (centre ≈ 18.5196°N, 73.8554°E).
const GEO = {
  lonMin: 73.8444, lonMax: 73.8666,   // west edge → east edge
  latMax: 18.5281, latMin: 18.5111,   // north edge → south edge
};

// ── SVG (x, y) → geographic (lat, lon) ──────────────────────────
function svgToGeo(x, y) {
  return {
    lat: parseFloat((GEO.latMax - (y / 560) * (GEO.latMax - GEO.latMin)).toFixed(5)),
    lon: parseFloat((GEO.lonMin + (x / 800) * (GEO.lonMax - GEO.lonMin)).toFixed(5)),
  };
}

// ── Derive ISO timestamp from "hours ago" offset ─────────────────
function lastCollectedAt(hoursAgo) {
  return new Date(SIM_BASE.getTime() - hoursAgo * 3_600_000).toISOString();
}

// ── Fill rate (% per hour) by area type ──────────────────────────
// Source: typical Pune municipal waste generation patterns (simulated).
const BASE_FILL_RATE = {
  Commercial:  4.0,   // high-footfall commercial streets
  Residential: 1.8,   // mixed residential colonies
  Industrial:  2.5,   // small-scale industrial clusters
  Park:        1.2,   // parks and open spaces
};

// ── Waste trend multipliers ───────────────────────────────────────
const TREND_MULT = { Rising: 1.55, Stable: 1.00, Falling: 0.55 };

// ── Waste density (kg per litre of bin volume) ────────────────────
// Mixed urban waste avg. (CPCB 2022, simulated): 0.25 kg / L.
const WASTE_DENSITY = 0.25;

// ────────────────────────────────────────────────────────────────
// DERIVATION FUNCTIONS
// ────────────────────────────────────────────────────────────────

function deriveOverflowHours(fill, loc, trend) {
  const rate = BASE_FILL_RATE[loc] * TREND_MULT[trend];
  return rate <= 0 ? 999 : parseFloat(((100 - fill) / rate).toFixed(1));
}

function deriveUrgency(fill, reports, ovHrs) {
  if (fill >= 80 || ovHrs < 3 || (fill >= 60 && reports >= 2)) return 'high';
  if (fill >= 50 || reports >= 1 || ovHrs < 8)                return 'medium';
  return 'low';
}

function deriveStatus(fill) {
  if (fill >= 80) return 'urgent';
  if (fill >= 50) return 'warning';
  return 'ok';
}

// Priority score: weighted composite, 0–100 (deterministic).
//   fill%     × 0.40  →  max 40 pts  (current fill pressure)
//   reports   × 7     →  max 35 pts  (citizen-reported urgency, capped at 5)
//   timeLeft  × 0.90  →  max ~21 pts (hours to overflow, inverted)
//   areaBonus          →  3–30 pts   (area-type risk weight per ref1 weighting)
//   Ref1 weights: Commercial Market +25, Hospital/Clinic +30, Residential +5, Park +3
function derivePriorityScore(fill, reports, ovHrs, loc) {
  // Commercial ≈ Market; Industrial ≈ high-footfall transit hub
  const AREA_BONUS = { Commercial: 25, Industrial: 20, Residential: 5, Park: 3 };
  return Math.min(100, Math.round(
    fill * 0.40 +
    Math.min(reports, 5) * 7 +
    Math.max(0, 24 - ovHrs) * 0.90 +
    (AREA_BONUS[loc] || 5)
  ));
}

// 4-hour fill forecast using current rate + trend.
function derivePredictedFill(fill, loc, trend) {
  const rate = BASE_FILL_RATE[loc] * TREND_MULT[trend];
  return Math.min(100, parseFloat((fill + rate * 4).toFixed(1)));
}

function derivePriorityReason(bin) {
  const parts = [];
  if (bin.fillPercent >= 80)             parts.push(`${bin.fillPercent}% full`);
  if (bin.wasteTrend === 'Rising')       parts.push('rising waste trend');
  if (bin.citizenReportCount > 0)        parts.push(`${bin.citizenReportCount} citizen report${bin.citizenReportCount > 1 ? 's' : ''}`);
  if (bin.overflowHours < 3)            parts.push('overflow in < 3 h');
  if (bin.areaType === 'Commercial')     parts.push('high-footfall zone');
  return parts.length ? parts.join(' · ') : 'Within normal parameters';
}

// ================================================================
// DEPOT
// ================================================================
// Location: near Shivajinagar Railway Yard service road, Pune 411005
const DEPOT = {
  id:      'DEPOT-PMC-01',
  name:    'PMC Waste Management Depot',
  address: 'Near Shivajinagar Railway Yard, Pune 411005',
  x: 62, y: 505,
  ...svgToGeo(62, 505),   // lat ≈ 18.5128, lon ≈ 73.8461
};

// ================================================================
// TRUCKS
// ================================================================
// Two 3.5-tonne diesel collection trucks assigned to Ward 12.
// Alpha: fresh shift (0 kg load).
// Bravo: already completed 3 routine morning pickups (420 kg load).
const TRUCKS_SEED = [
  {
    id:            'PMC-TRK-01',
    name:          'Alpha',
    licensePlate:  'MH-12-AB-7421',
    capacityKg:    3500,
    currentLoadKg: 0,
    status:        'Standby',
    zone:          'Shivajinagar North',
    color:         '#58a6ff',
    assignedBins:  [],
  },
  {
    id:            'PMC-TRK-02',
    name:          'Bravo',
    licensePlate:  'MH-12-CD-8832',
    capacityKg:    3500,
    currentLoadKg: 420,
    status:        'Active',
    zone:          'Deccan–Karve Road',
    color:         '#d2a8ff',
    assignedBins:  [],
  },
];

// ================================================================
// BIN SEED DATA  (28 bins across the ward)
//
// Columns: id · name · svgX · svgY · fill% · capacityL · areaType
//          · wasteTrend · citizenReports · lastCollectedHoursAgo
//          · wasteType · dailyGenerationRate (kg/day)
//
// Waste types used:
//   Organic   – food, garden, wet organic waste
//   Dry       – paper, plastic, recyclables
//   Mixed     – unsegregated residential/commercial waste
//   Hazardous – chemicals, solvents, industrial residue
//
// Daily generation rates are simulated from area type and bin
// capacity; not sourced from real municipal records.
// ================================================================
const BINS_SEED = [
  // ── URGENT / RED  (fill ≥ 80 %) ─────────────────────────────
  { id:'B01', name:'Shivajinagar Market',       x:378, y:202, fill:94, cap:240, loc:'Commercial',  trend:'Rising',  reports:3, lastHrs:48, waste:'Organic',   daily:130 },
  { id:'B02', name:'Shivajinagar Rly Station',  x:520, y:158, fill:88, cap:360, loc:'Commercial',  trend:'Rising',  reports:2, lastHrs:36, waste:'Mixed',     daily:155 },
  { id:'B03', name:'Sangam Bridge Park',         x:198, y:132, fill:83, cap:120, loc:'Park',        trend:'Stable',  reports:1, lastHrs:60, waste:'Organic',   daily:14  },
  { id:'B04', name:'Mandai Market',              x:308, y:290, fill:91, cap:240, loc:'Commercial',  trend:'Rising',  reports:4, lastHrs:48, waste:'Mixed',     daily:145 },
  { id:'B05', name:'Senapati Bapat Road',        x:598, y:242, fill:85, cap:480, loc:'Commercial',  trend:'Rising',  reports:0, lastHrs:24, waste:'Dry',       daily:140 },
  { id:'B06', name:'FC Road Night Zone',         x:438, y:318, fill:97, cap:240, loc:'Commercial',  trend:'Rising',  reports:5, lastHrs:72, waste:'Organic',   daily:160 },
  // ── WARNING / YELLOW  (fill 50–79 %) ────────────────────────
  { id:'B07', name:'Prabhat Road Colony',        x:132, y:258, fill:72, cap:120, loc:'Residential', trend:'Stable',  reports:0, lastHrs:36, waste:'Organic',   daily:32  },
  { id:'B08', name:'Law College Road',           x:158, y:368, fill:65, cap:120, loc:'Residential', trend:'Rising',  reports:1, lastHrs:24, waste:'Organic',   daily:28  },
  { id:'B09', name:'Westend Mall',               x:90,  y:192, fill:78, cap:480, loc:'Commercial',  trend:'Stable',  reports:0, lastHrs:30, waste:'Dry',       daily:120 },
  { id:'B10', name:'Kothrud Industrial Zone',    x:678, y:180, fill:61, cap:360, loc:'Industrial',  trend:'Falling', reports:0, lastHrs:18, waste:'Hazardous', daily:88  },
  { id:'B11', name:'Sambhaji Park',              x:338, y:158, fill:54, cap:120, loc:'Park',        trend:'Stable',  reports:0, lastHrs:48, waste:'Organic',   daily:12  },
  { id:'B12', name:'Pune University Road',       x:478, y:392, fill:76, cap:240, loc:'Commercial',  trend:'Rising',  reports:2, lastHrs:24, waste:'Mixed',     daily:105 },
  { id:'B13', name:'Bhandarkar Road',            x:248, y:438, fill:59, cap:120, loc:'Residential', trend:'Stable',  reports:0, lastHrs:36, waste:'Organic',   daily:26  },
  { id:'B14', name:'Karve Road Industrial',      x:658, y:378, fill:70, cap:480, loc:'Industrial',  trend:'Rising',  reports:0, lastHrs:24, waste:'Mixed',     daily:115 },
  { id:'B15', name:'Karve Road Colony',          x:200, y:328, fill:68, cap:240, loc:'Residential', trend:'Stable',  reports:1, lastHrs:30, waste:'Dry',       daily:42  },
  { id:'B16', name:'Ganeshkhind Gate',           x:388, y:98,  fill:53, cap:240, loc:'Residential', trend:'Falling', reports:0, lastHrs:24, waste:'Organic',   daily:35  },
  { id:'B17', name:'Deccan Gymkhana Jn',         x:550, y:298, fill:74, cap:360, loc:'Commercial',  trend:'Rising',  reports:1, lastHrs:20, waste:'Mixed',     daily:110 },
  // ── OK / GREEN  (fill < 50 %) ────────────────────────────────
  { id:'B18', name:'Erandwane Colony',           x:128, y:458, fill:28, cap:120, loc:'Residential', trend:'Stable',  reports:0, lastHrs:12, waste:'Organic',   daily:22  },
  { id:'B19', name:'Kothrud Heights',            x:710, y:288, fill:15, cap:240, loc:'Residential', trend:'Falling', reports:0, lastHrs:12, waste:'Dry',       daily:30  },
  { id:'B20', name:'Swargate Square',            x:358, y:458, fill:42, cap:120, loc:'Residential', trend:'Stable',  reports:0, lastHrs:18, waste:'Organic',   daily:27  },
  { id:'B21', name:'Chatushringi Garden',        x:268, y:178, fill:35, cap:120, loc:'Park',        trend:'Falling', reports:0, lastHrs:8,  waste:'Organic',   daily:11  },
  { id:'B22', name:'PCMC Industrial Area',       x:700, y:428, fill:47, cap:480, loc:'Industrial',  trend:'Stable',  reports:0, lastHrs:14, waste:'Mixed',     daily:95  },
  { id:'B23', name:'Alka Chowk',                 x:80,  y:338, fill:22, cap:120, loc:'Residential', trend:'Stable',  reports:0, lastHrs:10, waste:'Organic',   daily:20  },
  { id:'B24', name:'Shivajinagar North Gate',    x:738, y:202, fill:19, cap:240, loc:'Industrial',  trend:'Falling', reports:0, lastHrs:8,  waste:'Hazardous', daily:75  },
  { id:'B25', name:'Aundh Colony',               x:558, y:438, fill:33, cap:120, loc:'Residential', trend:'Stable',  reports:0, lastHrs:16, waste:'Dry',       daily:25  },
  { id:'B26', name:'Mutha Riverbank South',      x:210, y:498, fill:44, cap:120, loc:'Park',        trend:'Stable',  reports:0, lastHrs:20, waste:'Organic',   daily:10  },
  { id:'B27', name:'Rajiv Gandhi IT Park',       x:618, y:328, fill:38, cap:240, loc:'Commercial',  trend:'Stable',  reports:0, lastHrs:12, waste:'Dry',       daily:82  },
  { id:'B28', name:'Pashan Hills Colony',        x:458, y:120, fill:25, cap:120, loc:'Residential', trend:'Falling', reports:0, lastHrs:6,  waste:'Organic',   daily:18  },
];

// ================================================================
// BUILD BINS ARRAY  (derive all computed fields from seed)
// ================================================================
const BINS = BINS_SEED.map(s => {
  // Use predictive accumulation formula
  const daysSince = s.lastHrs / 24;
  const dailyRateL = s.daily / WASTE_DENSITY;
  
  // We backwards-calculate a plausible prevWaste so the 
  // generated fill matches our carefully designed prototype scenario.
  const targetVol = (s.cap * s.fill) / 100;
  let prevWaste = targetVol - (dailyRateL * daysSince);
  if (prevWaste < 0) prevWaste = 0; // clamp
  
  // Ref1 predictive fill formula:
  const predictedVol = prevWaste + (dailyRateL * daysSince);
  const derivedFill = Math.min(Math.round((predictedVol / s.cap) * 100), 100);

  const ovHrs    = deriveOverflowHours(derivedFill, s.loc, s.trend);
  const urgency  = deriveUrgency(derivedFill, s.reports, ovHrs);
  const status   = deriveStatus(derivedFill);
  const geo      = svgToGeo(s.x, s.y);
  const pscore   = derivePriorityScore(derivedFill, s.reports, ovHrs, s.loc);
  const predFill = derivePredictedFill(derivedFill, s.loc, s.trend);

  const bin = {
    // ── Identity ─────────────────────────────────────────────
    id:   s.id,
    name: s.name,
    // ── Geography ────────────────────────────────────────────
    x: s.x, y: s.y,           // SVG map coordinates
    latitude:  geo.lat,        // WGS-84 latitude  (simulated)
    longitude: geo.lon,        // WGS-84 longitude (simulated)
    // ── Capacity & fill ──────────────────────────────────────
    capacityL:            s.cap,
    prevWasteL:           prevWaste,
    fillPercent:          derivedFill,   // computed via predictive formula
    predictedFillPercent: predFill,      // 4-hour ahead forecast (rule-based)
    weightKg:             parseFloat((s.cap * derivedFill / 100 * WASTE_DENSITY).toFixed(1)),
    // ── Waste characteristics ─────────────────────────────────
    wasteType:            s.waste,
    areaType:             s.loc,
    locationType:         s.loc,    // alias kept for existing render code
    wasteTrend:           s.trend,
    dailyGenerationRate:  s.daily,  // kg per day (simulated typical)
    // ── Collection history ────────────────────────────────────
    lastCollectedHoursAgo: s.lastHrs,
    daysSince:             daysSince,
    lastCollectionTime:    lastCollectedAt(s.lastHrs),  // ISO-8601
    // ── Citizen engagement ────────────────────────────────────
    citizenReportCount: s.reports,
    citizenReports:     s.reports,  // alias kept for existing render code
    // ── Computed risk & priority ──────────────────────────────
    overflowHours:  ovHrs,
    urgency,
    status,
    priorityScore:  pscore,       // 0–100 weighted composite
    priorityReason: '',           // set below after object is built
    // ── State flag ───────────────────────────────────────────
    collected: false,
  };

  bin.priorityReason = derivePriorityReason(bin);
  return bin;
});

// ================================================================
// SIMULATION CONFIG  (Phase 3 route optimisation constants)
// ================================================================
const SIMULATION_CONFIG = {
  collectionThresholdPct: 70,    // bins at/above this fill% are route candidates
  avgSpeedKmh:            25,    // modelled Pune peak-hour truck speed
  fuelLPer100km:          28,    // diesel CNG truck consumption (L/100 km)
  co2KgPerL:              2.68,  // IPCC 2021 diesel CO₂ emission factor
  fixedRouteDistanceKm:   87.4,  // municipality's current fixed daily route (simulated)
  mapScalePxPerKm:        14,    // 1 km ≈ 14 SVG px  (derived from GEO bounds)
  biogasFactor:           1.2,   // kWh per kg organic waste (rough estimate)
};

// ================================================================
// SIMULATION METADATA  (transparency + KPI card context)
// ================================================================
const SIM_META = {
  wardName:          'Shivajinagar–Deccan Ward',
  city:              'Pune, Maharashtra, India',
  referenceTime:     SIM_BASE.toISOString(),   // deterministic demo anchor
  binCount:          BINS.length,
  totalCapacityL:    BINS.reduce((s, b) => s + b.capacityL, 0),    // 6,600 L
  totalWasteKg:      parseFloat(BINS.reduce((s, b) => s + b.weightKg, 0).toFixed(1)),
  totalDailyGenKg:   BINS.reduce((s, b) => s + b.dailyGenerationRate, 0), // ~2,107 kg/day
  urgentCount:       BINS.filter(b => b.urgency === 'high').length,
  warningCount:      BINS.filter(b => b.urgency === 'medium').length,
  okCount:           BINS.filter(b => b.urgency === 'low').length,
  dataSource:        'Prototype simulation — synthetic deterministic data only',
};

// ================================================================
// EXPOSE ON window.ECO
// ================================================================
window.ECO = {
  DEPOT,
  TRUCKS: JSON.parse(JSON.stringify(TRUCKS_SEED)),  // mutable live copy
  BINS:   JSON.parse(JSON.stringify(BINS)),         // mutable live copy
  SIMULATION_CONFIG,
  SIM_META,
  // Helpers re-exported for Phase 4 post-mutation recalculation
  deriveOverflowHours,
  deriveUrgency,
  deriveStatus,
  derivePriorityScore,
  derivePredictedFill,
  derivePriorityReason,
  lastCollectedAt,
};
