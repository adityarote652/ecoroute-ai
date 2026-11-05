import React, { useState, useEffect } from 'react';
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
      box-shadow: 0 0 4px rgba(0,0,0,0.5);
    "></div>`,
    iconSize:    [16, 16],
    iconAnchor:  [8, 8],
    popupAnchor: [0, -10],
  });
}

const redIcon    = makeDivIcon('#ef4444');   // Critical  >= 80%
const orangeIcon = makeDivIcon('#f97316');   // Warning   50-79%
const greenIcon  = makeDivIcon('#22c55e');   // Normal    < 50%

let _muniMapInstance = null;
let _citizenMapInstance = null;

// Ensure leaflet recalculates dimensions immediately to avoid gray tiles
function MapResizer({ onReady, isLoading }) {
  const map = useMap();
  useEffect(() => {
    if (onReady) onReady(map);
    map.invalidateSize();
    const t1 = setTimeout(() => map.invalidateSize(), 100);
    const t2 = setTimeout(() => map.invalidateSize(), 400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [map, onReady]);

  useEffect(() => {
    if (!isLoading) {
      const t = setTimeout(() => map.invalidateSize(), 80);
      return () => clearTimeout(t);
    }
  }, [map, isLoading]);

  return null;
}

export function PuneMap({ height = '400px', allowRoute = true, onMapReady }) {
  const [binsData, setBinsData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showRoute, setShowRoute] = useState(false);
  const [isSimulated, setIsSimulated] = useState(false);

  // Map Data Fetching: wrap asynchronous DB fetching in a useEffect hook on page load
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
        } else {
          // Asynchronous database simulation fallback
          fetchedData = await new Promise((resolve) => {
            setTimeout(() => {
              resolve([
                { id: 1, name: 'Pune City Center',          pos: [18.5204, 73.8567], fillPct: 88 },
                { id: 2, name: 'Karvenagar / Cummins',       pos: [18.4893, 73.8202], fillPct: 62 },
                { id: 3, name: 'Hinjewadi IT Park',          pos: [18.5913, 73.7389], fillPct: 35 },
                { id: 4, name: 'Hadapsar',                   pos: [18.4966, 73.9416], fillPct: 92 },
                { id: 5, name: 'Kothrud',                    pos: [18.5074, 73.8151], fillPct: 68 },
              ]);
            }, 1500);
          });
        }

        if (isMounted) {
          setBinsData(fetchedData || []);
        }
      } catch (err) {
        console.error('Error fetching bin coordinates and fill levels from DB:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadBinsAsync();
    return () => { isMounted = false; };
  }, []);

  // Compute reactive bin list with status labels, icons, and fill text
  const binList = binsData.map((b) => {
    const fillPct = isSimulated
      ? Math.min(100, b.fillPct + (b.fillPct >= 90 ? 8 : 15))
      : b.fillPct;
    const isCritical = fillPct >= 80;
    const isWarning = fillPct >= 50 && fillPct < 80;
    const label = isCritical ? 'Critical' : isWarning ? 'Warning' : 'Normal';
    const icon = isCritical ? redIcon : isWarning ? orangeIcon : greenIcon;
    const fill = `${fillPct}% (${isCritical ? '≥80%' : isWarning ? '50-79%' : '<50%'})`;
    return {
      ...b,
      fillPct,
      label,
      icon,
      fill
    };
  });

  const redBins = binList.filter((b) => b.label === 'Critical');
  const routePositions = redBins.map((b) => b.pos);

  // Sync React state with optimization impact stats and high-urgency bin counter
  useEffect(() => {
    if (!allowRoute) return;

    const countEl = document.getElementById('mapRouteBinCount');
    const fixedDistEl = document.getElementById('optFixedDist');
    const selectDistEl = document.getElementById('optSelectDist');
    const distSavingsEl = document.getElementById('optDistSavings');
    const co2SavedEl = document.getElementById('optCO2Saved');
    const muniHighBins = document.getElementById('muniHighBins');

    if (muniHighBins) {
      muniHighBins.textContent = isSimulated ? '18 Bins Require Collection' : '15 Bins Require Collection';
    }

    if (showRoute) {
      if (countEl) countEl.textContent = redBins.length;
      if (fixedDistEl) fixedDistEl.textContent = '38.4 km';
      if (selectDistEl) selectDistEl.textContent = '18.2 km';
      if (distSavingsEl) distSavingsEl.textContent = '52.6%';
      if (co2SavedEl) co2SavedEl.textContent = '20.6 kg';
    } else {
      if (countEl) countEl.textContent = '0';
      if (fixedDistEl) fixedDistEl.textContent = '38.4 km';
      if (selectDistEl) selectDistEl.textContent = '--';
      if (distSavingsEl) distSavingsEl.textContent = '0.0%';
      if (co2SavedEl) co2SavedEl.textContent = '0.0 kg';
    }
  }, [showRoute, isSimulated, redBins.length, allowRoute]);

  // Handle external and DOM triggers
  useEffect(() => {
    if (!allowRoute) return;

    window.setMapShowRoute = (val) => setShowRoute(val);
    window.toggleMapSimulation = () => setIsSimulated((prev) => !prev);
    window.resetMapSimulation = () => {
      setIsSimulated(false);
      setShowRoute(false);
    };

    const handleShowRoute = () => setShowRoute(true);
    const handleClearRoute = () => setShowRoute(false);
    const handleToggleSim = () => setIsSimulated((prev) => !prev);
    const handleReset = () => {
      setIsSimulated(false);
      setShowRoute(false);
    };

    window.addEventListener('ecoroute:show', handleShowRoute);
    window.addEventListener('ecoroute:clear', handleClearRoute);
    window.addEventListener('ecoroute:advance-time', handleToggleSim);
    window.addEventListener('ecoroute:reset', handleReset);

    // Attach listeners directly to buttons in the DOM
    const genButtons = document.querySelectorAll('button[onclick*="generateEcoRoute"]');
    const clearButtons = document.querySelectorAll('button[onclick*="resetSimulation"]');
    const simButtons = document.querySelectorAll('button[onclick*="simulateAdvanceTime"]');

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
  }, [allowRoute]);

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
        <MapResizer onReady={onMapReady} isLoading={isLoading} />

        {/* Free OpenStreetMap tiles */}
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
          maxZoom={19}
        />

        {/* Blue dashed Polyline connecting Red bins when showRoute is true */}
        {showRoute && (
          <Polyline
            positions={routePositions}
            color="blue"
            dashArray="6, 6"
            weight={3}
            pathOptions={{
              color: 'blue',
              dashArray: '6, 6',
              weight: 3,
            }}
          />
        )}

        {/* HTML divIcon markers, color-coded by fill level with interactive React state */}
        {binList.map((bin) => (
          <Marker key={`${bin.id}-${bin.fillPct}`} position={bin.pos} icon={bin.icon}>
            <Popup>
              <div style={{ fontFamily: 'Inter, sans-serif', minWidth: '150px' }}>
                <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '4px' }}>
                  {bin.name}
                </div>
                <div style={{ fontSize: '12px', color: '#475569' }}>
                  Fill level: <strong>{bin.fill}</strong>
                </div>
                <div style={{ fontSize: '12px', color: '#475569' }}>
                  Status: <strong>{bin.label}</strong>
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
      root.render(<PuneMap height="400px" onMapReady={(m) => { _muniMapInstance = m; }} />);
      rootEl._reactRoot = root;
    } else if (_muniMapInstance) {
      setTimeout(() => _muniMapInstance.invalidateSize(), 50);
    }
  }
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

export function mountAllMaps() {
  mountMap();
  mountCitizenMap();
  mountCitizenWallet();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountAllMaps);
} else {
  mountAllMaps();
}

window.mountReactMap = mountMap;
window.mountCitizenMap = mountCitizenMap;
window.mountCitizenWallet = mountCitizenWallet;
window.mountAllMaps = mountAllMaps;
window.PuneMap = PuneMap;
window.EcoRouteMap = EcoRouteMap;
window.CitizenWallet = CitizenWallet;
export { CitizenWallet, mountCitizenWallet };
