import React from 'react';
import { createRoot } from 'react-dom/client';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix 1: Explicit custom icon with correct sizes — prevents the giant marker bug
const defaultIcon = new L.Icon({
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize:    [25, 41],
  iconAnchor:  [12, 41],
  popupAnchor: [1, -34],
  shadowSize:  [41, 41],
});

const Bins = [
  { id: 1, name: 'Pune Center',             pos: [18.5204, 73.8567], status: '>=80% — High Risk'     },
  { id: 2, name: 'Karvenagar / Cummins',    pos: [18.4893, 73.8202], status: '50-79% — Moderate'     },
  { id: 3, name: 'Hinjewadi IT Park',       pos: [18.5913, 73.7389], status: '<50% — Low Risk'       },
  { id: 4, name: 'Hadapsar',                pos: [18.4966, 73.9416], status: '>=80% — High Risk'     },
  { id: 5, name: 'Kothrud',                 pos: [18.5074, 73.8151], status: '50-79% — Moderate'     },
];

export function EcoRouteMap() {
  return (
    <MapContainer center={[18.5204, 73.8567]} zoom={11} style={{ height: '100%', width: '100%' }}>
      {/* Fix 2: CartoDB Voyager tiles load significantly faster than default OSM */}
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        maxZoom={20}
      />
      {Bins.map(bin => (
        <Marker key={bin.id} position={bin.pos} icon={defaultIcon}>
          <Popup>
            <strong style={{ fontSize: '13px' }}>{bin.name}</strong>
            <br />
            <span style={{ fontSize: '12px', color: '#475569' }}>Fill Status: {bin.status}</span>
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
