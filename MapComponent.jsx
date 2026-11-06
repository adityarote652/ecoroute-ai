import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { fetchBinsFromDB } from './firebase.js';

// ── Inject attribution SVG sizing rule to avoid Tailwind stretching ────────
if (typeof document !== 'undefined') {
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .leaflet-control-attribution svg {
      width: 12px !important;
      height: 8px !important;
      display: inline-block !important;
    }
    .leaflet-popup-content-wrapper {
      border-radius: 16px !important;
      padding: 0 !important;
      overflow: hidden !important;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1) !important;
    }
    .leaflet-popup-content {
      margin: 12px 14px !important;
      line-height: 1.4 !important;
    }
  `;
  document.head.appendChild(styleEl);
}

// ── Helper: create a plain CSS circle divIcon (no external images) ─────────
function makeDivIcon(color) {
  return L.divIcon({
    className: '',   // suppress leaflet's default white box class
    html: `<div style="
      width: 16px;
      height: 16px;
      background-color: ${color};
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 0 5px rgba(0,0,0,0.5);
    "></div>`,
    iconSize:    [16, 16],
    iconAnchor:  [8, 8],
    popupAnchor: [0, -10],
  });
}

const redIcon    = makeDivIcon('#ef4444');   // Critical  >= 80%
const orangeIcon = makeDivIcon('#f97316');   // Warning   50-79%
const greenIcon  = makeDivIcon('#22c55e');   // Normal    < 50%

// ── Permanent Facilities (Start / End) ──────────────────────────────────────
export const TRUCK_DEPOT = {
  id: 'FACILITY-DEPOT',
  name: 'Truck Depot (Start)',
  pos: [18.5500, 73.8000],
  lat: 18.5500,
  lng: 73.8000,
  type: 'Start Depot',
  role: 'Central Municipal Vehicle Depot & Staging Yard',
  zone: 'Ward 12 Hub'
};

export const RECYCLING_PLANT = {
  id: 'FACILITY-PLANT',
  name: 'Municipal Recycling Plant (End)',
  pos: [18.4984, 73.9213],
  lat: 18.4984,
  lng: 73.9213,
  type: 'Recycling Plant',
  role: 'Ramtekdi Solid Waste Processing Center & MRF',
  zone: 'Hadapsar / Ramtekdi'
};

// ── Facility Icons: Distinct square icons with high contrast ─────────────────
function makeFacilityIcon(bgColor, borderColor, iconClass, textColor = '#ffffff') {
  return L.divIcon({
    className: '',
    html: `<div style="
      width: 30px;
      height: 30px;
      background-color: ${bgColor};
      border-radius: 8px;
      border: 2px solid ${borderColor};
      box-shadow: 0 4px 12px rgba(0,0,0,0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      color: ${textColor};
      font-size: 13px;
    ">
      <i class="${iconClass}"></i>
    </div>`,
    iconSize:    [30, 30],
    iconAnchor:  [15, 15],
    popupAnchor: [0, -16],
  });
}

export const depotIcon = makeFacilityIcon('#0f172a', '#38bdf8', 'fa-solid fa-warehouse', '#38bdf8');
export const plantIcon = makeFacilityIcon('#7e22ce', '#e9d5ff', 'fa-solid fa-recycle', '#ffffff');

let _muniMapInstance = null;
let _citizenMapInstance = null;

// Ensure leaflet recalculates dimensions immediately to avoid gray tiles
function MapResizer({ onReady, isLoading, isMuni = true }) {
  const map = useMap();
  useEffect(() => {
    if (onReady) onReady(map);
    if (isMuni) {
      _muniMapInstance = map;
      window.muniMap = map;
    }
    map.invalidateSize();
    const t1 = setTimeout(() => map.invalidateSize(), 100);
    const t2 = setTimeout(() => map.invalidateSize(), 400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [map, onReady, isMuni]);

  useEffect(() => {
    if (!isLoading) {
      const t = setTimeout(() => map.invalidateSize(), 80);
      return () => clearTimeout(t);
    }
  }, [map, isLoading]);

  return null;
}

// ── Helper: Solve TSP & Fetch Real Street Geometry via OSRM Trip API ────────
// Endpoint: https://router.project-osrm.org/trip/v1/driving/${coordinates}?roundtrip=false&source=first&destination=last&overview=full&geometries=geojson
export async function fetchOSRMTrip(waypoints = []) {
  if (!waypoints || waypoints.length < 2) return null;
  // OSRM expects coordinates in {lng,lat;lng,lat} format
  const coordsStr = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const url = `https://router.project-osrm.org/trip/v1/driving/${coordsStr}?roundtrip=false&source=first&destination=last&overview=full&geometries=geojson`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`OSRM Trip API responded with status ${response.status}`);
    const data = await response.json();
    if (data.code === 'Ok' && data.trips && data.trips[0]?.geometry?.coordinates) {
      // GeoJSON returns [lng, lat] -> convert to Leaflet's [lat, lng]
      const leafletCoords = data.trips[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      const distanceKm = (data.trips[0].distance / 1000).toFixed(1);
      const durationMin = Math.round(data.trips[0].duration / 60);
      return {
        coords: leafletCoords,
        distanceKm,
        durationMin,
        waypoints: data.waypoints
      };
    }
  } catch (err) {
    console.warn("OSRM Trip API fetch failed, using waypoints fallback:", err);
  }

  // Fallback to straight connection between waypoints if OSRM is unreachable
  return {
    coords: waypoints,
    distanceKm: '22.8',
    durationMin: 48
  };
}

export const fetchOSRMRoute = fetchOSRMTrip;

// ── Unified Master Bins Array (wardBins) ───────────────────────────────────────
// Single unified dataset for Pune Ward 12 & Municipal Dashboard.
// Includes the 5 original map bins, plus accurate Pune coordinates for the
// missing bins currently shown in the sidebar:
//   - B06 - FC Road Night Zone [18.5262, 73.8441] (Critical / Red)
//   - B07 - Prabhat Road Colony [18.5135, 73.8315] (Critical / Red)
//   - B09 - Westend Mall [18.5623, 73.8078] (Critical / Red)
//   - B12 - Pune University Road [18.5367, 73.8242] (Critical / Red)
export const wardBins = [
  // ── 5 Original Map Bins ───────────────────────────────────────────────────
  {
    id: '1',
    code: 'B01',
    name: 'Pune City Center',
    pos: [18.5204, 73.8567],
    lat: 18.5204,
    lng: 73.8567,
    baseFill: 88,
    fillPct: 88,
    fillPercent: 88,
    status: 'Critical',
    urgency: 'high',
    capacity: '1000L',
    wasteType: 'Organic',
    areaType: 'Commercial',
    lastPickup: 'Today, 06:30 AM',
    collected: false,
    priorityScore: 92,
  },
  {
    id: '2',
    code: 'B02',
    name: 'Karvenagar / Cummins',
    pos: [18.4893, 73.8202],
    lat: 18.4893,
    lng: 73.8202,
    baseFill: 62,
    fillPct: 62,
    fillPercent: 62,
    status: 'Warning',
    urgency: 'medium',
    capacity: '750L',
    wasteType: 'Mixed',
    areaType: 'Residential',
    lastPickup: 'Yesterday, 05:00 PM',
    collected: false,
    priorityScore: 68,
  },
  {
    id: '3',
    code: 'B03',
    name: 'Hinjewadi IT Park',
    pos: [18.5913, 73.7389],
    lat: 18.5913,
    lng: 73.7389,
    baseFill: 35,
    fillPct: 35,
    fillPercent: 35,
    status: 'Normal',
    urgency: 'low',
    capacity: '1500L',
    wasteType: 'Recyclable',
    areaType: 'Commercial',
    lastPickup: 'Today, 07:15 AM',
    collected: false,
    priorityScore: 38,
  },
  {
    id: '4',
    code: 'B04',
    name: 'Hadapsar Terminal',
    pos: [18.4966, 73.9416],
    lat: 18.4966,
    lng: 73.9416,
    baseFill: 92,
    fillPct: 92,
    fillPercent: 92,
    status: 'Critical',
    urgency: 'high',
    capacity: '1500L',
    wasteType: 'Mixed',
    areaType: 'Industrial',
    lastPickup: 'Yesterday, 04:30 PM',
    collected: false,
    priorityScore: 95,
  },
  {
    id: '5',
    code: 'B05',
    name: 'Kothrud Stand',
    pos: [18.5074, 73.8151],
    lat: 18.5074,
    lng: 73.8151,
    baseFill: 68,
    fillPct: 68,
    fillPercent: 68,
    status: 'Warning',
    urgency: 'medium',
    capacity: '800L',
    wasteType: 'Organic',
    areaType: 'Transit',
    lastPickup: '2 days ago',
    collected: false,
    priorityScore: 72,
  },
  // ── Missing Bins with Accurate Pune Coordinates ───────────────────────────
  {
    id: 'B06',
    code: 'B06',
    name: 'FC Road Night Zone',
    pos: [18.5262, 73.8441],
    lat: 18.5262,
    lng: 73.8441,
    baseFill: 97,
    fillPct: 97,
    fillPercent: 97,
    status: 'Critical',
    urgency: 'high',
    capacity: '1000L',
    wasteType: 'Organic',
    areaType: 'Commercial',
    lastPickup: 'Yesterday, 10:00 PM',
    collected: false,
    priorityScore: 98,
  },
  {
    id: 'B07',
    code: 'B07',
    name: 'Prabhat Road Colony',
    pos: [18.5135, 73.8315],
    lat: 18.5135,
    lng: 73.8315,
    baseFill: 86,
    fillPct: 86,
    fillPercent: 86,
    status: 'Critical',
    urgency: 'high',
    capacity: '1200L',
    wasteType: 'Organic',
    areaType: 'Residential',
    lastPickup: 'Yesterday, 08:30 PM',
    collected: false,
    priorityScore: 89,
  },
  {
    id: 'B09',
    code: 'B09',
    name: 'Westend Mall',
    pos: [18.5623, 73.8078],
    lat: 18.5623,
    lng: 73.8078,
    baseFill: 91,
    fillPct: 91,
    fillPercent: 91,
    status: 'Critical',
    urgency: 'high',
    capacity: '1500L',
    wasteType: 'Dry',
    areaType: 'Commercial',
    lastPickup: 'Yesterday, 06:15 PM',
    collected: false,
    priorityScore: 93,
  },
  {
    id: 'B12',
    code: 'B12',
    name: 'Pune University Road',
    pos: [18.5367, 73.8242],
    lat: 18.5367,
    lng: 73.8242,
    baseFill: 84,
    fillPct: 84,
    fillPercent: 84,
    status: 'Critical',
    urgency: 'high',
    capacity: '1000L',
    wasteType: 'Mixed',
    areaType: 'Commercial',
    lastPickup: 'Yesterday, 09:00 PM',
    collected: false,
    priorityScore: 88,
  },
];

if (typeof window !== 'undefined') {
  window.wardBins = wardBins;
}

// ── Priority Collection List Dynamic Renderer ────────────────────────────────
// Dynamically renders UI cards directly from wardBins (filtered by status and sorted by fill%)
export function renderPriorityListUI(binsToRender) {
  const listEl = document.getElementById('muniPriorityList');
  if (!listEl) return;

  const list = binsToRender && binsToRender.length ? binsToRender : (window.wardBins || wardBins);

  // Filter by status (Critical / fillPct >= 80) and sort by fill percentage descending
  const priorityBins = list
    .filter((b) => (b.label === 'Critical' || b.fillPct >= 80 || (b.status && b.status.toLowerCase().includes('critical')) || b.urgency === 'high') && !b.collected)
    .sort((a, b) => (b.fillPct || b.fillPercent || 0) - (a.fillPct || a.fillPercent || 0));

  if (priorityBins.length === 0) {
    listEl.innerHTML = `<div class="text-xs text-slate-400 p-4 text-center">No bins currently above priority collection threshold (≥80%).</div>`;
    return;
  }

  listEl.innerHTML = priorityBins
    .map((bin, idx) => {
      const lat = bin.pos ? bin.pos[0] : (bin.lat || 18.5204);
      const lng = bin.pos ? bin.pos[1] : (bin.lng || 73.8567);
      const binId = bin.id || bin.code;
      const displayName = `${bin.code || bin.id} - ${bin.name}`;
      const subtitle = `${bin.areaType || 'Commercial'} • ${bin.wasteType || 'Organic'}`;
      const fill = bin.fillPct || bin.fillPercent || 80;
      const score = bin.priorityScore || Math.min(100, fill + 5);

      return `
        <div onclick="window.flyToBin(${lat}, ${lng}, 16, '${binId}')"
             title="Click to zoom map to ${bin.name} (${lat}, ${lng})"
             class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs cursor-pointer hover:border-emerald-500 dark:hover:border-emerald-500 hover:shadow-md transition-all active:scale-[0.98] group">
            <div class="flex items-center gap-3">
                <span class="w-6 h-6 rounded-lg bg-rose-500/20 text-rose-500 font-bold flex items-center justify-center font-mono text-[10px] group-hover:scale-110 transition-transform">
                  #${idx + 1}
                </span>
                <div>
                    <div class="font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors flex items-center gap-1.5">
                        <span>${displayName}</span>
                        <i class="fa-solid fa-location-crosshairs text-[10px] text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity"></i>
                    </div>
                    <div class="text-[10px] text-slate-400">${subtitle}</div>
                </div>
            </div>
            <div class="text-right">
                <span class="font-mono font-extrabold text-rose-500 text-sm">${fill}%</span>
                <div class="text-[9px] text-slate-400">Score: ${score}</div>
            </div>
        </div>
      `;
    })
    .join('');
}

if (typeof window !== 'undefined') {
  window.renderPriorityListUI = renderPriorityListUI;
  window.renderPriorityList = renderPriorityListUI;
}

// ── Prediction & Time Advance Simulation Engine ──────────────────────────────
// Iterates through wardBins, randomly increases each fill by 15% to 25% (simulating +6h waste generation),
// caps at 100%, dynamically updates status (>=80% Critical/Red, 50-79% Warning/Orange, <50% Normal/Green),
// updates the map markers immediately, and resorts the Priority Collection List.
export function simulateTimeAdvance() {
  const sourceBins = (window.wardBins && window.wardBins.length) ? window.wardBins : wardBins;

  const updatedBins = sourceBins.map((bin) => {
    const currentFill = typeof bin.fillPct === 'number'
      ? bin.fillPct
      : (typeof bin.fillPercent === 'number' ? bin.fillPercent : (bin.baseFill || 50));

    // Random increase of 15% to 25% (simulating 6 hours of waste generation)
    const randomIncrease = Math.floor(Math.random() * (25 - 15 + 1)) + 15;
    const newFill = Math.min(100, currentFill + randomIncrease);

    // Dynamic Status Update
    // if >= 80%: "Critical" and Red marker icon
    // if 50% - 79%: "Warning" and Orange marker icon
    // else (< 50%): "Normal" and Green marker icon
    const isCritical = newFill >= 80;
    const isWarning = newFill >= 50 && newFill < 80;

    const status = isCritical ? 'Critical' : isWarning ? 'Warning' : 'Normal';
    const label = status;
    const icon = isCritical ? redIcon : isWarning ? orangeIcon : greenIcon;
    const urgency = isCritical ? 'high' : isWarning ? 'medium' : 'low';
    const fill = `${newFill}% (${isCritical ? '≥80%' : isWarning ? '50-79%' : '<50%'})`;
    const priorityScore = Math.min(100, newFill + (isCritical ? 10 : 5));

    return {
      ...bin,
      fillPct: newFill,
      fillPercent: newFill,
      status,
      label,
      icon,
      urgency,
      fill,
      priorityScore,
    };
  });

  // Save updated array to window.wardBins and mutate exported wardBins in-place
  window.wardBins = updatedBins;
  updatedBins.forEach((ub, i) => {
    if (wardBins[i]) Object.assign(wardBins[i], ub);
  });

  // Update PuneMap React state so map markers immediately change colors
  if (typeof window.updateMapBins === 'function') {
    window.updateMapBins(updatedBins);
  }

  // Update Priority Collection List instantly bringing newly Red bins to the top
  renderPriorityListUI(updatedBins);

  // Sync into AppContext so Admin Registry reflects the updated statuses
  if (window.appStore) {
    window.appStore.setState((prev) => ({
      ...prev,
      isSimulated: true,
      bins: prev.bins.map((b) => {
        const matching = updatedBins.find((ub) => ub.code === b.code || ub.id === b.id || ub.name === b.name);
        if (matching) {
          return {
            ...b,
            fillPct: matching.fillPct,
            fillPercent: matching.fillPct,
            status: matching.status === 'Critical' ? 'Critical (≥80% Dispatch)' : matching.status === 'Warning' ? 'Warning (50-79%)' : 'Normal (<50%)',
          };
        }
        const inc = Math.floor(Math.random() * (25 - 15 + 1)) + 15;
        const newPct = Math.min(100, (b.fillPct || b.baseFill || 50) + inc);
        return {
          ...b,
          fillPct: newPct,
          fillPercent: newPct,
          status: newPct >= 80 ? 'Critical (≥80% Dispatch)' : newPct >= 50 ? 'Warning (50-79%)' : 'Normal (<50%)',
        };
      })
    }));
    window.appStore.syncDOM();
  }

  // Sync into legacy state.bins if active
  if (window.state && Array.isArray(window.state.bins)) {
    window.state.bins.forEach((b) => {
      const match = updatedBins.find((ub) => ub.code === b.code || ub.id === b.id || ub.name === b.name);
      if (match) {
        b.fillPercent = match.fillPct;
        b.fillPct = match.fillPct;
        b.status = match.status.toLowerCase();
        b.urgency = match.urgency;
      }
    });
  }

  // Update Municipal Dashboard header KPI counters
  const criticalCount = updatedBins.filter((b) => b.fillPct >= 80).length;
  const warningCount = updatedBins.filter((b) => b.fillPct >= 50 && b.fillPct < 80).length;
  const normalCount = updatedBins.filter((b) => b.fillPct < 50).length;

  const muniHighBinsEl = document.getElementById('muniHighBins');
  const muniWarnBinsEl = document.getElementById('muniWarnBins');
  const muniLowBinsEl = document.getElementById('muniLowBins');

  if (muniHighBinsEl) muniHighBinsEl.textContent = `${criticalCount} Bins Require Collection`;
  if (muniWarnBinsEl) muniWarnBinsEl.textContent = `${warningCount} Bins`;
  if (muniLowBinsEl) muniLowBinsEl.textContent = `${normalCount} Bins`;

  // Dispatch custom event for any other subscribers
  window.dispatchEvent(new CustomEvent('ecoroute:advance-time', { detail: updatedBins }));

  // Show Toast Alert
  const msg = `⏳ Simulated +6h Waste: Bins generated 15-25% more waste. ${criticalCount} bins are now Critical!`;
  if (typeof window.showSimAlert === 'function') {
    window.showSimAlert(msg);
  }

  return updatedBins;
}

export function resetTimeSimulation() {
  const resetBins = wardBins.map((bin) => {
    const baseFill = bin.baseFill || 60;
    const isCritical = baseFill >= 80;
    const isWarning = baseFill >= 50 && baseFill < 80;
    const status = isCritical ? 'Critical' : isWarning ? 'Warning' : 'Normal';
    const label = status;
    const icon = isCritical ? redIcon : isWarning ? orangeIcon : greenIcon;
    const urgency = isCritical ? 'high' : isWarning ? 'medium' : 'low';
    const fill = `${baseFill}% (${isCritical ? '≥80%' : isWarning ? '50-79%' : '<50%'})`;
    const priorityScore = Math.min(100, baseFill + (isCritical ? 10 : 5));

    return {
      ...bin,
      fillPct: baseFill,
      fillPercent: baseFill,
      status,
      label,
      icon,
      urgency,
      fill,
      priorityScore,
    };
  });

  window.wardBins = resetBins;
  resetBins.forEach((rb, i) => {
    if (wardBins[i]) Object.assign(wardBins[i], rb);
  });

  if (typeof window.updateMapBins === 'function') {
    window.updateMapBins(resetBins);
  }
  renderPriorityListUI(resetBins);

  const criticalCount = resetBins.filter((b) => b.fillPct >= 80).length;
  const warningCount = resetBins.filter((b) => b.fillPct >= 50 && b.fillPct < 80).length;
  const normalCount = resetBins.filter((b) => b.fillPct < 50).length;

  const muniHighBinsEl = document.getElementById('muniHighBins');
  const muniWarnBinsEl = document.getElementById('muniWarnBins');
  const muniLowBinsEl = document.getElementById('muniLowBins');

  if (muniHighBinsEl) muniHighBinsEl.textContent = `${criticalCount} Bins Require Collection`;
  if (muniWarnBinsEl) muniWarnBinsEl.textContent = `${warningCount} Bins`;
  if (muniLowBinsEl) muniLowBinsEl.textContent = `${normalCount} Bins`;

  if (window.appStore) window.appStore.actions.resetSimulation();
  if (typeof window.showSimAlert === 'function') {
    window.showSimAlert('🔄 Simulation reset to initial baseline fill levels.');
  }
}

if (typeof window !== 'undefined') {
  window.simulateTimeAdvance = simulateTimeAdvance;
  window.simulateAdvanceTime = simulateTimeAdvance;
  window.resetTimeSimulation = resetTimeSimulation;
}

export function PuneMap({ height = '400px', allowRoute = true, onMapReady }) {
  const [binsData, setBinsData] = useState(wardBins);
  const [isLoading, setIsLoading] = useState(true);
  const [showRoute, setShowRoute] = useState(false);
  const [routePositions, setRoutePositions] = useState([]);
  const [isRoutingLoading, setIsRoutingLoading] = useState(false);
  const markerRefs = useRef({});

  // Expose setter for external functions like simulateTimeAdvance
  useEffect(() => {
    if (allowRoute) {
      window.updateMapBins = (newBins) => {
        setBinsData([...newBins]);
      };
    }
  }, [allowRoute]);

  // Map Data Fetching: load unified wardBins (with async DB fetch or fallback)
  useEffect(() => {
    let isMounted = true;
    async function loadBinsAsync() {
      setIsLoading(true);
      try {
        let fetchedData = [];
        if (typeof fetchBinsFromDB === 'function') {
          fetchedData = await fetchBinsFromDB();
        } else if (typeof window !== 'undefined' && window.fetchBinsFromDB) {
          fetchedData = await window.fetchBinsFromDB();
        }

        if (isMounted) {
          if (fetchedData && fetchedData.length >= wardBins.length) {
            setBinsData(fetchedData);
          } else {
            setBinsData(wardBins);
          }
        }
      } catch (err) {
        console.error('Error fetching bin coordinates from DB, using unified wardBins:', err);
        if (isMounted) setBinsData(wardBins);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadBinsAsync();
    return () => { isMounted = false; };
  }, []);

  // Compute reactive bin list with status labels, icons, fill text, and capacity/waste details
  const binList = (binsData && binsData.length ? binsData : wardBins).map((b) => {
    const fillPct = typeof b.fillPct === 'number'
      ? b.fillPct
      : (typeof b.fillPercent === 'number' ? b.fillPercent : (b.baseFill || 60));
    const isCritical = fillPct >= 80;
    const isWarning = fillPct >= 50 && fillPct < 80;
    const label = isCritical ? 'Critical' : isWarning ? 'Warning' : 'Normal';
    const icon = isCritical ? redIcon : isWarning ? orangeIcon : greenIcon;
    const fill = `${fillPct}% (${isCritical ? '≥80%' : isWarning ? '50-79%' : '<50%'})`;
    return {
      ...b,
      fillPct,
      fillPercent: fillPct,
      status: label,
      label,
      icon,
      fill,
      capacity: b.capacity || (b.capacityL ? `${b.capacityL}L` : '1000L'),
      wasteType: b.wasteType || 'Organic',
      lastPickup: b.lastPickup || 'Today, 06:30 AM'
    };
  });

  // Keep Priority Collection List in sync whenever binList changes
  useEffect(() => {
    if (allowRoute) {
      renderPriorityListUI(binList);
    }
  }, [binList, allowRoute]);

  const redBins = binList.filter((b) => b.label === 'Critical');

  // Async function to solve TSP and display OSRM real street route
  // Starts at Truck Depot [18.5500, 73.8000], visits all Critical bins, ends at Recycling Plant [18.4984, 73.9213]
  const generateRealRoute = async () => {
    setIsRoutingLoading(true);

    // Identify Critical bins to collect
    const criticalBins = redBins.length > 0
      ? redBins
      : binList.filter((b) => b.fillPct >= 75 || b.urgency === 'high');

    const middleCoords = criticalBins.length > 0
      ? criticalBins.map((b) => b.pos)
      : [[18.5204, 73.8567], [18.5367, 73.8242], [18.5262, 73.8441]];

    // Always start with Truck Depot, include all Critical bins, and end with Municipal Recycling Plant
    const waypoints = [
      TRUCK_DEPOT.pos,
      ...middleCoords,
      RECYCLING_PLANT.pos
    ];

    try {
      const result = await fetchOSRMTrip(waypoints);
      if (result && result.coords) {
        setRoutePositions(result.coords);
        setShowRoute(true);

        // Update stats on Municipal Dashboard
        const fixedDistEl = document.getElementById('optFixedDist');
        const selectDistEl = document.getElementById('optSelectDist');
        const distSavingsEl = document.getElementById('optDistSavings');
        const co2SavedEl = document.getElementById('optCO2Saved');
        const countEl = document.getElementById('mapRouteBinCount');

        if (countEl) countEl.textContent = criticalBins.length || middleCoords.length;
        if (fixedDistEl) fixedDistEl.textContent = '38.4 km';
        if (selectDistEl) selectDistEl.textContent = `${result.distanceKm} km`;
        if (distSavingsEl) {
          const savings = Math.max(10, Math.round((1 - parseFloat(result.distanceKm) / 38.4) * 100));
          distSavingsEl.textContent = `${savings}%`;
        }
        if (co2SavedEl) {
          const co2 = ((38.4 - parseFloat(result.distanceKm)) * 1.02).toFixed(1);
          co2SavedEl.textContent = `${Math.max(5, co2)} kg`;
        }
        return result;
      }
    } catch (e) {
      console.error("OSRM TSP Route Generation Error:", e);
    } finally {
      setIsRoutingLoading(false);
    }
  };

  const generateOSRMRoute = generateRealRoute;

  // Expose TSP route generator and flyTo directly on window
  useEffect(() => {
    if (!allowRoute) return;

    window.generateRealRoute = generateRealRoute;
    window.generateOSRMRoute = generateRealRoute;
    window.setMapShowRoute = (val) => {
      setShowRoute(val);
      if (!val) setRoutePositions([]);
    };
    window.toggleMapSimulation = () => simulateTimeAdvance();
    window.resetMapSimulation = () => {
      resetTimeSimulation();
      setShowRoute(false);
      setRoutePositions([]);
    };

    // Sidebar-to-Map flyTo helper with automatic popup opening
    window.flyToBin = (lat, lng, zoom = 16, binId) => {
      const map = window.muniMap || _muniMapInstance;
      if (map && typeof map.flyTo === 'function') {
        map.flyTo([lat, lng], zoom, { animate: true, duration: 1.5 });
        if (binId && markerRefs.current) {
          setTimeout(() => {
            try {
              const marker = markerRefs.current[binId] ||
                             markerRefs.current[String(binId)] ||
                             markerRefs.current[String(binId).toLowerCase()] ||
                             markerRefs.current[String(binId).toUpperCase()];
              if (marker && typeof marker.openPopup === 'function') {
                marker.openPopup();
              }
            } catch(e) {
              console.warn("Could not open marker popup:", e);
            }
          }, 1200);
        }
      }
    };

    const handleShowRoute = () => generateRealRoute();
    const handleClearRoute = () => {
      setShowRoute(false);
      setRoutePositions([]);
    };
    const handleToggleSim = () => {
      simulateTimeAdvance();
    };
    const handleReset = () => {
      resetTimeSimulation();
      setShowRoute(false);
      setRoutePositions([]);
    };

    window.addEventListener('ecoroute:show', handleShowRoute);
    window.addEventListener('ecoroute:clear', handleClearRoute);
    window.addEventListener('ecoroute:advance-time', handleToggleSim);
    window.addEventListener('ecoroute:reset', handleReset);

    // Direct DOM button bindings
    const genButtons = document.querySelectorAll('button[onclick*="generateEcoRoute"], button[onclick*="handleGenerateRouteWithLoading"]');
    const clearButtons = document.querySelectorAll('button[onclick*="resetSimulation"]');
    const simButtons = document.querySelectorAll('button[onclick*="simulateTimeAdvance"], button[onclick*="simulateAdvanceTime"]');

    genButtons.forEach((btn) => btn.addEventListener('click', handleShowRoute));
    clearButtons.forEach((btn) => btn.addEventListener('click', handleReset));
    simButtons.forEach((btn) => btn.addEventListener('click', handleToggleSim));

    return () => {
      window.removeEventListener('ecoroute:show', handleShowRoute);
      window.removeEventListener('ecoroute:clear', handleClearRoute);
      window.removeEventListener('ecoroute:advance-time', handleToggleSim);
      window.removeEventListener('ecoroute:reset', handleReset);
      genButtons.forEach((btn) => btn.removeEventListener('click', handleShowRoute));
      clearButtons.forEach((btn) => btn.removeEventListener('click', handleReset));
      simButtons.forEach((btn) => btn.removeEventListener('click', handleToggleSim));
    };
  }, [allowRoute, redBins]);

  return (
    <div className="relative w-full overflow-hidden rounded-2xl" style={{ height: height, minHeight: height }}>
      {/* Skeleton loader / "Loading Map Data..." overlay */}
      {isLoading && (
        <div 
          className="absolute inset-0 z-[1000] bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center text-white transition-opacity duration-300 pointer-events-none"
          style={{ zIndex: 1000 }}
        >
          <div className="flex items-center gap-3 bg-slate-950/95 border border-slate-700/80 px-5 py-3.5 rounded-2xl shadow-2xl">
            <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <div className="flex flex-col text-left">
              <span className="font-bold text-sm tracking-wide text-slate-100">Loading Map Data...</span>
              <span className="text-[11px] text-slate-400">Fetching live coordinates &amp; fill levels</span>
            </div>
          </div>

          {/* Skeleton pulse bar */}
          <div className="w-64 max-w-[85%] mt-4 space-y-2">
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 animate-pulse w-full"></div>
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>Connecting to IoT Telemetry DB...</span>
              <span className="text-emerald-400 animate-pulse font-semibold">Syncing</span>
            </div>
          </div>
        </div>
      )}

      <MapContainer
        center={[18.5204, 73.8567]}
        zoom={11}
        style={{ height: '100%', minHeight: height, width: '100%' }}
      >
        <MapResizer onReady={onMapReady} isLoading={isLoading} isMuni={allowRoute} />

        {/* Free OpenStreetMap tiles */}
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
          maxZoom={19}
        />

        {/* OSRM Real Street Geometry Polyline */}
        {showRoute && routePositions.length > 0 && (
          <Polyline
            positions={routePositions}
            color="#2563eb"
            dashArray="6, 6"
            weight={4}
            pathOptions={{
              color: '#2563eb',
              dashArray: '6, 6',
              weight: 4,
            }}
          />
        )}

        {/* Permanent Facility 1: Truck Depot (Start) [18.5500, 73.8000] */}
        <Marker position={TRUCK_DEPOT.pos} icon={depotIcon}>
          <Popup className="eco-facility-popup">
            <div style={{ fontFamily: 'Inter, sans-serif', minWidth: '220px', padding: '2px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', gap: '8px' }}>
                <div style={{ fontWeight: 800, fontSize: '13px', color: '#0f172a' }}>
                  {TRUCK_DEPOT.name}
                </div>
                <span style={{
                  fontSize: '9px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  backgroundColor: '#0f172a',
                  color: '#38bdf8',
                  border: '1px solid #38bdf8'
                }}>
                  START DEPOT
                </span>
              </div>
              <div style={{ fontSize: '11px', background: '#f8fafc', padding: '8px 10px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div>
                  <span style={{ color: '#64748b', fontSize: '10px', fontWeight: 500, display: 'block' }}>Operational Facility</span>
                  <strong style={{ color: '#1e293b' }}>{TRUCK_DEPOT.role}</strong>
                </div>
                <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: '4px' }}>
                  <span style={{ color: '#64748b', fontSize: '10px', fontWeight: 500, display: 'block' }}>GPS Coordinates</span>
                  <code style={{ fontSize: '10px', color: '#0284c7' }}>18.5500° N, 73.8000° E</code>
                </div>
              </div>
            </div>
          </Popup>
        </Marker>

        {/* Permanent Facility 2: Municipal Recycling Plant (End) [18.4984, 73.9213] */}
        <Marker position={RECYCLING_PLANT.pos} icon={plantIcon}>
          <Popup className="eco-facility-popup">
            <div style={{ fontFamily: 'Inter, sans-serif', minWidth: '220px', padding: '2px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', gap: '8px' }}>
                <div style={{ fontWeight: 800, fontSize: '13px', color: '#0f172a' }}>
                  {RECYCLING_PLANT.name}
                </div>
                <span style={{
                  fontSize: '9px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  backgroundColor: '#581c87',
                  color: '#e9d5ff',
                  border: '1px solid #a855f7'
                }}>
                  END DESTINATION
                </span>
              </div>
              <div style={{ fontSize: '11px', background: '#faf5ff', padding: '8px 10px', borderRadius: '10px', border: '1px solid #f3e8ff', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div>
                  <span style={{ color: '#7e22ce', fontSize: '10px', fontWeight: 500, display: 'block' }}>Processing Facility</span>
                  <strong style={{ color: '#3b0764' }}>{RECYCLING_PLANT.role}</strong>
                </div>
                <div style={{ borderTop: '1px dashed #e9d5ff', paddingTop: '4px' }}>
                  <span style={{ color: '#7e22ce', fontSize: '10px', fontWeight: 500, display: 'block' }}>GPS Coordinates</span>
                  <code style={{ fontSize: '10px', color: '#7e22ce' }}>18.4984° N, 73.9213° E</code>
                </div>
              </div>
            </div>
          </Popup>
        </Marker>

        {/* Detailed Map Popups with Bin Name, Status, Capacity, Waste Type, and Last Pickup Date */}
        {binList.map((bin) => (
          <Marker
            key={`${bin.id}-${bin.fillPct}`}
            position={bin.pos}
            icon={bin.icon}
            ref={(ref) => {
              if (ref) {
                markerRefs.current[bin.id] = ref;
                markerRefs.current[String(bin.id)] = ref;
                if (bin.code) {
                  markerRefs.current[bin.code] = ref;
                  markerRefs.current[String(bin.code)] = ref;
                }
              }
            }}
          >
            <Popup className="eco-bin-popup">
              <div style={{ fontFamily: 'Inter, sans-serif', minWidth: '220px', padding: '2px' }}>
                
                {/* Header: Name and Status Badge */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', gap: '8px' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>
                    {bin.name}
                  </div>
                  <span style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    backgroundColor: bin.label === 'Critical' ? '#fee2e2' : bin.label === 'Warning' ? '#ffedd5' : '#dcfce7',
                    color: bin.label === 'Critical' ? '#b91c1c' : bin.label === 'Warning' ? '#c2410c' : '#15803d',
                    border: `1px solid ${bin.label === 'Critical' ? '#fca5a5' : bin.label === 'Warning' ? '#fdba74' : '#86efac'}`
                  }}>
                    {bin.label}
                  </span>
                </div>

                {/* Fill Meter Bar */}
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>
                    <span>Fill Level</span>
                    <strong style={{ color: bin.label === 'Critical' ? '#ef4444' : bin.label === 'Warning' ? '#f97316' : '#22c55e' }}>
                      {bin.fillPct}%
                    </strong>
                  </div>
                  <div style={{ width: '100%', height: '6px', backgroundColor: '#e2e8f0', borderRadius: '9999px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${bin.fillPct}%`,
                      height: '100%',
                      backgroundColor: bin.label === 'Critical' ? '#ef4444' : bin.label === 'Warning' ? '#f97316' : '#22c55e',
                      borderRadius: '9999px',
                      transition: 'width 0.3s'
                    }}></div>
                  </div>
                </div>

                {/* Detailed Specifications Card: Capacity, Waste Type, Last Pickup Date */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11px', background: '#f8fafc', padding: '8px 10px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '10px', fontWeight: 500 }}>Capacity</span>
                    <strong style={{ color: '#1e293b' }}>{bin.capacity}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '10px', fontWeight: 500 }}>Waste Type</span>
                    <strong style={{ color: '#1e293b' }}>{bin.wasteType}</strong>
                  </div>
                  <div style={{ gridColumn: 'span 2', marginTop: '2px', borderTop: '1px dashed #e2e8f0', paddingTop: '4px' }}>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '10px', fontWeight: 500 }}>Last Pickup Date</span>
                    <strong style={{ color: '#1e293b' }}>{bin.lastPickup}</strong>
                  </div>
                </div>

              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

export const EcoRouteMap = PuneMap;

export function mountMap() {
  const rootEl = document.getElementById('map-body');
  if (rootEl) {
    if (!rootEl._reactRoot) {
      const root = createRoot(rootEl);
      root.render(<PuneMap height="400px" onMapReady={(m) => { _muniMapInstance = m; window.muniMap = m; }} />);
      rootEl._reactRoot = root;
    } else if (_muniMapInstance) {
      window.muniMap = _muniMapInstance;
      setTimeout(() => _muniMapInstance.invalidateSize(), 50);
    }
  }
  renderPriorityListUI(wardBins);
}

export function mountCitizenMap() {
  const rootEl = document.getElementById('citizenMap');
  if (rootEl) {
    if (!rootEl._reactRoot) {
      const root = createRoot(rootEl);
      root.render(<PuneMap height="260px" allowRoute={false} onMapReady={(m) => { _citizenMapInstance = m; }} />);
      rootEl._reactRoot = root;
    } else if (_citizenMapInstance) {
      setTimeout(() => _citizenMapInstance.invalidateSize(), 50);
    }
  }
}

import { CitizenWallet, mountCitizenWallet } from './CitizenComponent.jsx';
import { mountAllContextPanels, mountMunicipalComplaints, mountAdminBinTable, mountAdminTruckList, mountAdminAuditLog } from './AppContext.jsx';

export function mountAllMaps() {
  mountMap();
  mountCitizenMap();
  mountCitizenWallet();
  mountMunicipalComplaints();
  mountAdminBinTable();
  mountAdminTruckList();
  mountAdminAuditLog();
  mountAllContextPanels();
  renderPriorityListUI(wardBins);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountAllMaps);
} else {
  mountAllMaps();
}

window.mountReactMap = mountMap;
window.mountCitizenMap = mountCitizenMap;
window.mountCitizenWallet = mountCitizenWallet;
window.mountMunicipalComplaints = mountMunicipalComplaints;
window.mountAdminBinTable = mountAdminBinTable;
window.mountAdminTruckList = mountAdminTruckList;
window.mountAdminAuditLog = mountAdminAuditLog;
window.mountAllContextPanels = mountAllContextPanels;
window.mountAllMaps = mountAllMaps;
window.PuneMap = PuneMap;
window.EcoRouteMap = EcoRouteMap;
window.CitizenWallet = CitizenWallet;
export { CitizenWallet, mountCitizenWallet, mountAllContextPanels, mountMunicipalComplaints, mountAdminBinTable, mountAdminTruckList, mountAdminAuditLog };

