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

const BINS = [
  { id: 1, name: 'Pune City Center',          pos: [18.5204, 73.8567], fill: '>=80%',   label: 'Critical',  icon: redIcon    },
  { id: 2, name: 'Karvenagar / Cummins',       pos: [18.4893, 73.8202], fill: '50-79%',  label: 'Warning',   icon: orangeIcon },
  { id: 3, name: 'Hinjewadi IT Park',          pos: [18.5913, 73.7389], fill: '<50%',    label: 'Normal',    icon: greenIcon  },
  { id: 4, name: 'Hadapsar',                   pos: [18.4966, 73.9416], fill: '>=80%',   label: 'Critical',  icon: redIcon    },
  { id: 5, name: 'Kothrud',                    pos: [18.5074, 73.8151], fill: '50-79%',  label: 'Warning',   icon: orangeIcon },
];

// Critical / Red bins route coordinates
const CRITICAL_ROUTE = [
  [18.5204, 73.8567], // Pune City Center
  [18.4966, 73.9416], // Hadapsar
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

  useEffect(() => {
    if (!allowRoute) return;

    window.setMapShowRoute = (val) => setShowRoute(val);

    const handleShowRoute = () => setShowRoute(true);
    const handleClearRoute = () => setShowRoute(false);

    window.addEventListener('ecoroute:show', handleShowRoute);
    window.addEventListener('ecoroute:clear', handleClearRoute);

    // Attach listeners directly to buttons in the DOM
    const genButtons = document.querySelectorAll('button[onclick*="generateEcoRoute"]');
    const clearButtons = document.querySelectorAll('button[onclick*="resetSimulation"]');

    genButtons.forEach((btn) => btn.addEventListener('click', handleShowRoute));
    clearButtons.forEach((btn) => btn.addEventListener('click', handleClearRoute));

    return () => {
      window.removeEventListener('ecoroute:show', handleShowRoute);
      window.removeEventListener('ecoroute:clear', handleClearRoute);
      genButtons.forEach((btn) => btn.removeEventListener('click', handleShowRoute));
      clearButtons.forEach((btn) => btn.removeEventListener('click', handleClearRoute));
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

      {/* Polyline connecting critical/red bins when route is active */}
      {showRoute && (
        <Polyline
          positions={CRITICAL_ROUTE}
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

      {/* HTML divIcon markers, color-coded by fill level */}
      {BINS.map((bin) => (
        <Marker key={bin.id} position={bin.pos} icon={bin.icon}>
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

export function mountAllMaps() {
  mountMap();
  mountCitizenMap();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountAllMaps);
} else {
  mountAllMaps();
}

window.mountReactMap = mountMap;
window.mountCitizenMap = mountCitizenMap;
window.mountAllMaps = mountAllMaps;
window.PuneMap = PuneMap;
window.EcoRouteMap = EcoRouteMap;
