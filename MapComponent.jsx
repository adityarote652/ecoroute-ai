import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

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

const BASELINE_BINS = [
  { id: 1, name: 'Pune City Center',          pos: [18.5204, 73.8567], fillPct: 88, fill: '88% (≥80%)',   label: 'Critical',  icon: redIcon    },
  { id: 2, name: 'Karvenagar / Cummins',       pos: [18.4893, 73.8202], fillPct: 62, fill: '62% (50-79%)',  label: 'Warning',   icon: orangeIcon },
  { id: 3, name: 'Hinjewadi IT Park',          pos: [18.5913, 73.7389], fillPct: 35, fill: '35% (<50%)',    label: 'Normal',    icon: greenIcon  },
  { id: 4, name: 'Hadapsar',                   pos: [18.4966, 73.9416], fillPct: 92, fill: '92% (≥80%)',   label: 'Critical',  icon: redIcon    },
  { id: 5, name: 'Kothrud',                    pos: [18.5074, 73.8151], fillPct: 68, fill: '68% (50-79%)',  label: 'Warning',   icon: orangeIcon },
];

const SIMULATED_BINS = [
  { id: 1, name: 'Pune City Center',          pos: [18.5204, 73.8567], fillPct: 98, fill: '98% (≥80%)',   label: 'Critical',  icon: redIcon    },
  { id: 2, name: 'Karvenagar / Cummins',       pos: [18.4893, 73.8202], fillPct: 82, fill: '82% (≥80%)',   label: 'Critical',  icon: redIcon    },
  { id: 3, name: 'Hinjewadi IT Park',          pos: [18.5913, 73.7389], fillPct: 50, fill: '50% (50-79%)',  label: 'Warning',   icon: orangeIcon },
  { id: 4, name: 'Hadapsar',                   pos: [18.4966, 73.9416], fillPct: 100, fill: '100% (≥80%)', label: 'Critical',  icon: redIcon    },
  { id: 5, name: 'Kothrud',                    pos: [18.5074, 73.8151], fillPct: 88, fill: '88% (≥80%)',   label: 'Critical',  icon: redIcon    },
];

let _muniMapInstance = null;
let _citizenMapInstance = null;

// Ensure leaflet recalculates dimensions immediately to avoid gray tiles
function MapResizer({ onReady }) {
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
  return null;
}

export function PuneMap({ height = '400px', allowRoute = true, onMapReady }) {
  const [showRoute, setShowRoute] = useState(false);
  const [isSimulated, setIsSimulated] = useState(false);

  const binList = isSimulated ? SIMULATED_BINS : BASELINE_BINS;
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
    <MapContainer
      center={[18.5204, 73.8567]}
      zoom={11}
      style={{ height: height, minHeight: height, width: '100%' }}
    >
      <MapResizer onReady={onMapReady} />

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
