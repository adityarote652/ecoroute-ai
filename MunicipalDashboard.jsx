import 'leaflet/dist/leaflet.css';
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, Polyline, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  PuneMap,
  EcoRouteMap,
  wardBins,
  TRUCK_DEPOT,
  RECYCLING_PLANT,
  depotIcon,
  plantIcon,
  fetchOSRMTrip,
  renderPriorityListUI,
  simulateTimeAdvance,
  resetTimeSimulation,
  mockHeatmapPoints,
  mountMap
} from './MapComponent.jsx';

/**
 * Small custom component for force recalculating Leaflet map dimensions.
 * Uses Leaflet's useMap() hook and a 500ms setTimeout to force recalculation
 * after the DOM and layout have fully painted.
 */
export function MapResizer() {
  const map = useMap();

  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 500);
    return () => clearTimeout(timer);
  }, [map]);

  return null;
}

/**
 * MunicipalDashboard Component
 * Features explicit Tailwind sizing (h-[600px] / h-[70vh]), MapResizer child,
 * and high-contrast municipal fleet routing display with ward bins, TSP route, and heatmap.
 */
export function MunicipalDashboard({ height = '600px', allowRoute = true, onMapReady, ...props }) {
  return (
    <div className="w-full h-[600px] sm:h-[70vh] rounded-2xl overflow-hidden border border-slate-700/80 shadow-2xl relative bg-slate-900">
      <PuneMap height="100%" allowRoute={allowRoute} onMapReady={onMapReady} {...props} />
    </div>
  );
}

// Global Mount Helper
export function mountMunicipalDashboard() {
  mountMap();
}

if (typeof window !== 'undefined') {
  window.MunicipalDashboard = MunicipalDashboard;
  window.mountMunicipalDashboard = mountMunicipalDashboard;
}

export {
  PuneMap,
  EcoRouteMap,
  wardBins,
  TRUCK_DEPOT,
  RECYCLING_PLANT,
  depotIcon,
  plantIcon,
  fetchOSRMTrip,
  renderPriorityListUI,
  simulateTimeAdvance,
  resetTimeSimulation,
  mockHeatmapPoints,
  mountMap
};

export default MunicipalDashboard;
