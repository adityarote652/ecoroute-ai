import 'leaflet/dist/leaflet.css';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, Polyline, Circle, useMap } from 'react-leaflet';

import L from 'leaflet';
import { fetchBinsFromDB } from './firebase.js';
import { appStore } from './AppContext.jsx';

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

if (typeof window !== 'undefined') {
  window.redIcon = redIcon;
  window.orangeIcon = orangeIcon;
  window.greenIcon = greenIcon;
}

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
export function MapResizer({ onReady, isLoading, isMuni = true }) {
  const map = useMap();

  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 500);
    return () => clearTimeout(timer);
  }, [map]);
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

  useEffect(() => {
    const handleResize = () => {
      setTimeout(() => {
        try { map.invalidateSize(); } catch (e) {}
      }, 50);
      setTimeout(() => {
        try { map.invalidateSize(); } catch (e) {}
      }, 250);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('view:switched', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('view:switched', handleResize);
    };
  }, [map]);

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

  // Filter by status (Critical / fillPct >= 80) and sort by fill percentage descending so newly Red (Critical) bins are at the very top
  const priorityBins = [...list]
    .filter((b) => (b.status === 'Critical' || b.label === 'Critical' || (b.fillPct || b.fillPercent || 0) >= 80 || (b.status && b.status.toLowerCase().includes('critical')) || b.urgency === 'high') && !b.collected)
    .sort((a, b) => {
      const aFill = (a.fillPct || a.fillPercent || 0);
      const bFill = (b.fillPct || b.fillPercent || 0);
      const aCrit = (a.status === 'Critical' || aFill >= 80) ? 1 : 0;
      const bCrit = (b.status === 'Critical' || bFill >= 80) ? 1 : 0;
      if (bCrit !== aCrit) return bCrit - aCrit;
      return bFill - aFill;
    });

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
  if (typeof window !== 'undefined' && typeof window.__reactSimulateTimeAdvance === 'function') {
    return window.__reactSimulateTimeAdvance();
  }
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

// ── Static Mock Heatmap Coordinates (20 points clustered around FC Road [18.5262, 73.8441]) ──
export const mockHeatmapPoints = [
  { id: 1,  pos: [18.5262, 73.8441], center: [18.5262, 73.8441], lat: 18.5262, lng: 73.8441 },
  { id: 2,  pos: [18.5275, 73.8432], center: [18.5275, 73.8432], lat: 18.5275, lng: 73.8432 },
  { id: 3,  pos: [18.5250, 73.8455], center: [18.5250, 73.8455], lat: 18.5250, lng: 73.8455 },
  { id: 4,  pos: [18.5281, 73.8460], center: [18.5281, 73.8460], lat: 18.5281, lng: 73.8460 },
  { id: 5,  pos: [18.5242, 73.8428], center: [18.5242, 73.8428], lat: 18.5242, lng: 73.8428 },
  { id: 6,  pos: [18.5269, 73.8452], center: [18.5269, 73.8452], lat: 18.5269, lng: 73.8452 },
  { id: 7,  pos: [18.5258, 73.8436], center: [18.5258, 73.8436], lat: 18.5258, lng: 73.8436 },
  { id: 8,  pos: [18.5288, 73.8425], center: [18.5288, 73.8425], lat: 18.5288, lng: 73.8425 },
  { id: 9,  pos: [18.5235, 73.8450], center: [18.5235, 73.8450], lat: 18.5235, lng: 73.8450 },
  { id: 10, pos: [18.5270, 73.8468], center: [18.5270, 73.8468], lat: 18.5270, lng: 73.8468 },
  { id: 11, pos: [18.5255, 73.8415], center: [18.5255, 73.8415], lat: 18.5255, lng: 73.8415 },
  { id: 12, pos: [18.5292, 73.8445], center: [18.5292, 73.8445], lat: 18.5292, lng: 73.8445 },
  { id: 13, pos: [18.5248, 73.8462], center: [18.5248, 73.8462], lat: 18.5248, lng: 73.8462 },
  { id: 14, pos: [18.5265, 73.8420], center: [18.5265, 73.8420], lat: 18.5265, lng: 73.8420 },
  { id: 15, pos: [18.5278, 73.8439], center: [18.5278, 73.8439], lat: 18.5278, lng: 73.8439 },
  { id: 16, pos: [18.5239, 73.8435], center: [18.5239, 73.8435], lat: 18.5239, lng: 73.8435 },
  { id: 17, pos: [18.5285, 73.8458], center: [18.5285, 73.8458], lat: 18.5285, lng: 73.8458 },
  { id: 18, pos: [18.5252, 73.8448], center: [18.5252, 73.8448], lat: 18.5252, lng: 73.8448 },
  { id: 19, pos: [18.5268, 73.8412], center: [18.5268, 73.8412], lat: 18.5268, lng: 73.8412 },
  { id: 20, pos: [18.5273, 73.8475], center: [18.5273, 73.8475], lat: 18.5273, lng: 73.8475 },
];
export const mockHeatmapArray = mockHeatmapPoints;

export function PuneMap({ height = '400px', allowRoute = true, onMapReady }) {
  // State Management: wardBins array stored in React state variable
  const [bins, setBins] = useState(wardBins);
  const [isLoading, setIsLoading] = useState(true);
  const [showRoute, setShowRoute] = useState(false);
  const [routePositions, setRoutePositions] = useState([]);
  const routePath = routePositions;
  const halfIndex = Math.ceil(routePath.length / 2);
  const truck1Path = routePath.slice(0, halfIndex + 1);
  const truck2Path = routePath.slice(halfIndex);
  const [isRoutingLoading, setIsRoutingLoading] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [portalTarget, setPortalTarget] = useState(() => (typeof document !== 'undefined' ? document.getElementById('heatmapToggleRoot') : null));
  const markerRefs = useRef({});

  useEffect(() => {
    const updateTarget = () => {
      if (typeof document !== 'undefined') {
        const el = document.getElementById('heatmapToggleRoot');
        if (el) setPortalTarget(el);
      }
    };
    updateTarget();
    const timer = setTimeout(updateTarget, 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.showHeatmap = showHeatmap;
      window.setShowHeatmap = setShowHeatmap;
      window.toggleHeatmap = () => setShowHeatmap((prev) => !prev);
    }
  }, [showHeatmap]);

  // Simulate Logic: attached to the "Simulate +6h Waste" button's onClick event
  const simulateTimeAdvance = useCallback(() => {
    setBins((currentBins) => {
      const source = (currentBins && currentBins.length) ? currentBins : wardBins;
      const updatedBins = source.map((bin) => {
        const currentFill = typeof bin.fillPct === 'number'
          ? bin.fillPct
          : (typeof bin.fillPercent === 'number' ? bin.fillPercent : (bin.baseFill || 50));

        // Random increase of 15% to 25% (simulating 6 hours of waste generation), capping at 100%
        const randomIncrease = Math.floor(Math.random() * (25 - 15 + 1)) + 15;
        const newFill = Math.min(100, currentFill + randomIncrease);

        // Dynamic Thresholds:
        // If the new fill level is >= 80%, change its status to "Critical" and update its map marker icon to redIcon.
        // If it is between 50%-79%, set it to "Warning" with orangeIcon.
        // If < 50%, "Normal" with greenIcon.
        let status = 'Normal';
        let icon = greenIcon;
        let urgency = 'low';

        if (newFill >= 80) {
          status = 'Critical';
          icon = redIcon;
          urgency = 'high';
        } else if (newFill >= 50) {
          status = 'Warning';
          icon = orangeIcon;
          urgency = 'medium';
        }

        return {
          ...bin,
          fillPct: newFill,
          fillPercent: newFill,
          status,
          label: status,
          icon,
          urgency,
          fill: `${newFill}% (${status})`,
          priorityScore: Math.min(100, newFill + (status === 'Critical' ? 10 : 5)),
        };
      });

      // Save updated array to window.wardBins and mutate exported wardBins in-place
      window.wardBins = updatedBins;
      updatedBins.forEach((ub, i) => {
        if (wardBins[i]) Object.assign(wardBins[i], ub);
      });

      // List Sorting: automatically re-sort Priority Collection List UI moving newly Red (Critical) bins to the very top
      renderPriorityListUI(updatedBins);

      // Update Municipal Dashboard header KPI counters
      const criticalCount = updatedBins.filter((b) => b.status === 'Critical' || b.fillPct >= 80).length;
      const warningCount = updatedBins.filter((b) => b.status === 'Warning' || (b.fillPct >= 50 && b.fillPct < 80)).length;
      const normalCount = updatedBins.filter((b) => b.status === 'Normal' || b.fillPct < 50).length;

      const muniHighBinsEl = document.getElementById('muniHighBins');
      const muniWarnBinsEl = document.getElementById('muniWarnBins');
      const muniLowBinsEl = document.getElementById('muniLowBins');

      if (muniHighBinsEl) muniHighBinsEl.textContent = `${criticalCount} Bins Require Collection`;
      if (muniWarnBinsEl) muniWarnBinsEl.textContent = `${warningCount} Bins`;
      if (muniLowBinsEl) muniLowBinsEl.textContent = `${normalCount} Bins`;

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
            return b;
          })
        }));
        window.appStore.syncDOM();
      }

      if (typeof window.showSimAlert === 'function') {
        window.showSimAlert(`⚡ +6h Waste Simulated: ${criticalCount} Critical Bins escalated to Red status.`);
      }

      return updatedBins;
    });
  }, []);

  // Expose setter and simulation methods for window / button onClick
  useEffect(() => {
    if (allowRoute) {
      window.updateMapBins = (newBins) => {
        setBins([...newBins]);
      };
      window.__reactSimulateTimeAdvance = simulateTimeAdvance;
      window.simulateTimeAdvance = simulateTimeAdvance;
      window.simulateAdvanceTime = simulateTimeAdvance;
      window.toggleMapSimulation = simulateTimeAdvance;

      const btn = document.getElementById('btnSimulateTimeAdvance');
      if (btn) {
        btn.onclick = simulateTimeAdvance;
      }
      return () => {
        if (btn && btn.onclick === simulateTimeAdvance) {
          btn.onclick = null;
        }
      };
    }
  }, [allowRoute, simulateTimeAdvance]);

  // Subscribe to Global Context so driver collections update Municipal Map in real time
  useEffect(() => {
    const store = appStore || (typeof window !== 'undefined' ? window.appStore : null);
    if (store && typeof store.subscribe === 'function') {
      const unsubscribe = store.subscribe(() => {
        const globalState = store.getState();
        if (globalState.bins && globalState.bins.length) {
          setBins([...globalState.bins]);
        }
      });
      return unsubscribe;
    }
  }, []);

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
            setBins(fetchedData);
          } else {
            setBins(wardBins);
          }
        }
      } catch (err) {
        console.error('Error fetching bin coordinates from DB, using unified wardBins:', err);
        if (isMounted) setBins(wardBins);
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
  const binList = (bins && bins.length ? bins : wardBins).map((b) => {
    const isCollected = b.collected === true || (b.status && b.status.toLowerCase().includes('normal') && (b.fillPct === 0 || b.fillPct < 50));
    const fillPct = isCollected ? 0 : (typeof b.fillPct === 'number'
      ? b.fillPct
      : (typeof b.fillPercent === 'number' ? b.fillPercent : (b.baseFill || 60)));
    const isCritical = !isCollected && fillPct >= 80;
    const isWarning = !isCollected && fillPct >= 50 && fillPct < 80;
    const label = isCollected ? 'Normal' : (isCritical ? 'Critical' : isWarning ? 'Warning' : 'Normal');
    const icon = isCollected ? greenIcon : (isCritical ? redIcon : isWarning ? orangeIcon : greenIcon);
    const fill = `${fillPct}% (${label})`;
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

    // Identify Critical uncollected bins to route
    const criticalBins = binList.filter((b) => !b.collected && (b.fillPct >= 80 || b.label === 'Critical' || (b.status && b.status.toLowerCase().includes('critical'))));

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

        // Sync the exact routePath and criticalBins directly to Global Context for DriverDashboard
        if (typeof window !== 'undefined' && window.appStore) {
          window.appStore.actions.setDispatchedRoute({
            routePath: result.coords,
            criticalBins: criticalBins.map(b => ({ ...b })),
            routeStats: {
              distanceKm: result.distanceKm,
              durationMin: result.durationMin
            }
          });
        }

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
    const handleReset = () => {
      resetTimeSimulation();
      setBins(wardBins.map(b => ({
        ...b,
        fillPct: b.baseFill || 50,
        fillPercent: b.baseFill || 50,
        status: (b.baseFill || 50) >= 80 ? 'Critical' : (b.baseFill || 50) >= 50 ? 'Warning' : 'Normal',
        icon: (b.baseFill || 50) >= 80 ? redIcon : (b.baseFill || 50) >= 50 ? orangeIcon : greenIcon,
        collected: false
      })));
      setShowRoute(false);
      setRoutePositions([]);
    };

    window.resetMapSimulation = handleReset;

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

  const heatmapToggleBtn = allowRoute ? (
    <button
      id="btnToggleHeatmap"
      type="button"
      onClick={() => setShowHeatmap((prev) => !prev)}
      className={`px-4 py-2.5 text-xs font-bold rounded-2xl shadow-md transition-all flex items-center gap-2 active:scale-95 cursor-pointer ${
        showHeatmap
          ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/30 ring-2 ring-rose-400'
          : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/30'
      }`}
      title="Toggle Predictive Waste Heatmap"
    >
      <i className={showHeatmap ? 'fa-solid fa-map' : 'fa-solid fa-fire'}></i>
      <span>{showHeatmap ? 'Show Standard Route' : 'Show Predictive Heatmap'}</span>
    </button>
  ) : null;

  return (
    <div className="relative w-full h-[600px] sm:h-[70vh] overflow-hidden rounded-2xl" style={{ height: height, minHeight: height }}>
      {/* Portal Heatmap Toggle Button next to "Generate Optimal Route" */}
      {portalTarget && heatmapToggleBtn && createPortal(heatmapToggleBtn, portalTarget)}
      {!portalTarget && allowRoute && (
        <div className="absolute top-3 right-3 z-[500]">
          {heatmapToggleBtn}
        </div>
      )}
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
        className="w-full h-[600px] sm:h-[70vh]"
        style={{ height: '100%', minHeight: height, width: '100%' }}
      >
        <MapResizer onReady={onMapReady} isLoading={isLoading} isMuni={allowRoute} />

        {/* Free OpenStreetMap tiles */}
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
          maxZoom={19}
        />

        {/* Predictive Heatmap Mode vs Standard Route & Bins */}
        {showHeatmap ? (
          mockHeatmapPoints.map((point, index) => (
            <Circle
              key={point.id || index}
              center={point.pos || point.center || [point.lat, point.lng]}
              radius={400}
              color="red"
              fillColor="#f03"
              fillOpacity={0.4}
              stroke={false}
              pathOptions={{
                color: 'red',
                fillColor: '#f03',
                fillOpacity: 0.4,
                stroke: false,
              }}
            />
          ))
        ) : (
          <>
            {/* Multi-Truck Dispatch Simulation: TR-01 Route (Blue) & TR-02 Route (Purple) */}
            {showRoute && routePath.length > 0 && (
              <>
                {/* Truck TR-01 Route Segment (Blue) */}
                <Polyline
                  positions={truck1Path}
                  color="#3b82f6"
                  dashArray="6, 6"
                  weight={5}
                  pathOptions={{
                    color: '#3b82f6',
                    dashArray: '6, 6',
                    weight: 5,
                  }}
                >
                  <Tooltip sticky>TR-01 Route</Tooltip>
                  <Popup>
                    <div style={{ fontFamily: 'Inter, sans-serif', padding: '2px' }}>
                      <strong style={{ color: '#3b82f6', fontSize: '13px' }}>TR-01 Route</strong>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>Assigned Fleet: Truck TR-01 (Capacity: 4.5T)</div>
                    </div>
                  </Popup>
                </Polyline>

                {/* Truck TR-02 Route Segment (Purple) */}
                <Polyline
                  positions={truck2Path}
                  color="#a855f7"
                  dashArray="6, 6"
                  weight={5}
                  pathOptions={{
                    color: '#a855f7',
                    dashArray: '6, 6',
                    weight: 5,
                  }}
                >
                  <Tooltip sticky>TR-02 Route</Tooltip>
                  <Popup>
                    <div style={{ fontFamily: 'Inter, sans-serif', padding: '2px' }}>
                      <strong style={{ color: '#a855f7', fontSize: '13px' }}>TR-02 Route</strong>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>Assigned Fleet: Truck TR-02 (Capacity: 3.2T)</div>
                    </div>
                  </Popup>
                </Polyline>
              </>
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
                key={`${bin.id}-${bin.fillPct}-${bin.status}-${bin.collected ? 'col' : 'pend'}`}
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
          </>
        )}
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
      root.render(<PuneMap height="600px" onMapReady={(m) => { _muniMapInstance = m; window.muniMap = m; }} />);
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
import { mountAllContextPanels, mountMunicipalComplaints, mountAdminBinTable, mountAdminTruckList, mountAdminAuditLog, mountAdminAddBinButton, mountAdminAddTruckButton } from './AppContext.jsx';

export function mountAllMaps() {
  mountMap();
  mountCitizenMap();
  mountCitizenWallet();
  mountMunicipalComplaints();
  mountAdminBinTable();
  mountAdminTruckList();
  mountAdminAuditLog();
  mountAdminAddBinButton();
  mountAdminAddTruckButton();
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
window.mountAdminAddBinButton = mountAdminAddBinButton;
window.mountAdminAddTruckButton = mountAdminAddTruckButton;
window.mountAllContextPanels = mountAllContextPanels;
window.mountAllMaps = mountAllMaps;
window.PuneMap = PuneMap;
window.EcoRouteMap = EcoRouteMap;
window.CitizenWallet = CitizenWallet;
export { CitizenWallet, mountCitizenWallet, mountAllContextPanels, mountMunicipalComplaints, mountAdminBinTable, mountAdminTruckList, mountAdminAuditLog, mountAdminAddBinButton, mountAdminAddTruckButton };

