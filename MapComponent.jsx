import React from 'react';
import { createRoot } from 'react-dom/client';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

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

export function EcoRouteMap() {
  return (
    <MapContainer
      center={[18.5204, 73.8567]}
      zoom={11}
      style={{ height: '100%', width: '100%' }}
    >
      {/* Fix 1: Free OpenStreetMap tiles — no API key required */}
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
        maxZoom={19}
      />

      {/* Fix 2 & 3: HTML divIcon markers, color-coded by fill level */}
      {BINS.map(bin => (
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

export function mountMap() {
  const rootEl = document.getElementById('map-body');
  if (rootEl && !rootEl._reactRoot) {
    const root = createRoot(rootEl);
    root.render(<EcoRouteMap />);
    rootEl._reactRoot = root;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountMap);
} else {
  mountMap();
}

window.mountReactMap = mountMap;
