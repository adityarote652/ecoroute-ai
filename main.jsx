import 'leaflet/dist/leaflet.css';
import './style.css';

// Ensure Leaflet assets and styles are globally loaded before any dashboard mounts
if (typeof window !== 'undefined') {
  window.__leafletStylesLoaded = true;
  console.info('[EcoRoute] Global Leaflet CSS and core application styling initialized.');
}
