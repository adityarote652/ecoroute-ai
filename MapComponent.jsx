import React from 'react';
import { createRoot } from 'react-dom/client';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix leaflet default icon issue with webpack/vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom colored icons
const createColorIcon = (color) => {
    return new L.DivIcon({
        className: 'custom-div-icon',
        html: <div style="background-color: \; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5);"></div>,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });
};

const redIcon = createColorIcon('#ef4444');
const orangeIcon = createColorIcon('#f97316');
const greenIcon = createColorIcon('#22c55e');

const Bins = [
  { id: 1, name: 'Pune Center', pos: [18.5204, 73.8567], status: '≥80% (Red)', icon: redIcon },
  { id: 2, name: 'Karvenagar / Cummins', pos: [18.4893, 73.8202], status: '50-79% (Orange)', icon: orangeIcon },
  { id: 3, name: 'Hinjewadi', pos: [18.5913, 73.7389], status: '<50% (Green)', icon: greenIcon },
  { id: 4, name: 'Hadapsar', pos: [18.4966, 73.9416], status: '≥80% (Red)', icon: redIcon },
  { id: 5, name: 'Kothrud', pos: [18.5074, 73.8151], status: '50-79% (Orange)', icon: orangeIcon },
];

export function EcoRouteMap() {
  return (
    <MapContainer center={[18.5204, 73.8567]} zoom={11} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap contributors'
      />
      {Bins.map(bin => (
        <Marker key={bin.id} position={bin.pos} icon={bin.icon}>
          <Popup>
            <strong>{bin.name}</strong><br/>Status: {bin.status}
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

// Automatically mount if available on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountMap);
} else {
    mountMap();
}

window.mountReactMap = mountMap;
