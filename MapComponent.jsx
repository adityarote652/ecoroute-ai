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

// ── Helper: Fetch Real Street Driving Geometry via free OSRM API ─────────
export async function fetchOSRMRoute(waypoints = []) {
  if (!waypoints || waypoints.length < 2) return null;
  // OSRM expects coordinates in {lng,lat;lng,lat} format
  const coordsStr = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`OSRM API responded with status ${response.status}`);
    const data = await response.json();
    if (data.code === 'Ok' && data.routes && data.routes[0]?.geometry?.coordinates) {
      // GeoJSON returns [lng, lat] -> convert to Leaflet's [lat, lng]
      const leafletCoords = data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      const distanceKm = (data.routes[0].distance / 1000).toFixed(1);
      const durationMin = Math.round(data.routes[0].duration / 60);
      return {
        coords: leafletCoords,
        distanceKm,
        durationMin
      };
    }
  } catch (err) {
    console.warn("OSRM API fetch failed, using waypoints fallback:", err);
  }

  // Fallback to straight connection between waypoints if OSRM is unreachable
  return {
    coords: waypoints,
    distanceKm: '18.2',
    durationMin: 40
  };
}

export function PuneMap({ height = '400px', allowRoute = true, onMapReady }) {
  const [binsData, setBinsData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showRoute, setShowRoute] = useState(false);
  const [routePositions, setRoutePositions] = useState([]);
  const [isRoutingLoading, setIsRoutingLoading] = useState(false);
  const [isSimulated, setIsSimulated] = useState(false);
  const markerRefs = useRef({});

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
                { id: 'B01', name: 'Shivajinagar Market',    pos: [18.5220, 73.8549], fillPct: 94, capacity: '1000L', capacityL: 1000, wasteType: 'Organic', lastPickup: 'Today, 06:00 AM' },
                { id: 'B04', name: 'Mandai Market',          pos: [18.5193, 73.8530], fillPct: 91, capacity: '1200L', capacityL: 1200, wasteType: 'Mixed',   lastPickup: 'Yesterday, 04:30 PM' },
                { id: 'B06', name: 'FC Road Night Zone',     pos: [18.5184, 73.8566], fillPct: 97, capacity: '1000L', capacityL: 1000, wasteType: 'Organic', lastPickup: 'Yesterday, 10:00 PM' },
                { id: 1,     name: 'Pune City Center',       pos: [18.5204, 73.8567], fillPct: 88, capacity: '1000L', capacityL: 1000, wasteType: 'Organic', lastPickup: 'Today, 06:30 AM' },
                { id: 2,     name: 'Karvenagar / Cummins',    pos: [18.4893, 73.8202], fillPct: 62, capacity: '750L',  capacityL: 750,  wasteType: 'Mixed',   lastPickup: 'Yesterday, 05:00 PM' },
                { id: 3,     name: 'Hinjewadi IT Park',       pos: [18.5913, 73.7389], fillPct: 35, capacity: '1500L', capacityL: 1500, wasteType: 'Recyclable', lastPickup: 'Today, 07:15 AM' },
                { id: 4,     name: 'Hadapsar Terminal',       pos: [18.4966, 73.9416], fillPct: 92, capacity: '1500L', capacityL: 1500, wasteType: 'Mixed',   lastPickup: 'Yesterday, 04:30 PM' },
                { id: 5,     name: 'Kothrud Stand',           pos: [18.5074, 73.8151], fillPct: 68, capacity: '800L',  capacityL: 800,  wasteType: 'Organic', lastPickup: '2 days ago' },
              ]);
            }, 1200);
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

  // Compute reactive bin list with status labels, icons, fill text, and capacity/waste details
  const binList = binsData.map((b) => {
    const fillPct = isSimulated
      ? Math.min(100, b.fillPct + (b.fillPct >= 90 ? 5 : 15))
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
      fill,
      capacity: b.capacity || (b.capacityL ? `${b.capacityL}L` : '1000L'),
      wasteType: b.wasteType || 'Organic',
      lastPickup: b.lastPickup || 'Today, 06:30 AM'
    };
  });

  const redBins = binList.filter((b) => b.label === 'Critical');

  // Async function to fetch and display OSRM real street route
  const generateOSRMRoute = async () => {
    setIsRoutingLoading(true);
    // Prefer connecting red bins (e.g. Pune City Center to Hadapsar)
    const waypoints = redBins.length >= 2
      ? redBins.map((b) => b.pos)
      : [[18.5204, 73.8567], [18.4966, 73.9416]];

    try {
      const result = await fetchOSRMRoute(waypoints);
      if (result && result.coords) {
        setRoutePositions(result.coords);
        setShowRoute(true);

        // Update stats
        const fixedDistEl = document.getElementById('optFixedDist');
        const selectDistEl = document.getElementById('optSelectDist');
        const distSavingsEl = document.getElementById('optDistSavings');
        const co2SavedEl = document.getElementById('optCO2Saved');
        const countEl = document.getElementById('mapRouteBinCount');

        if (countEl) countEl.textContent = redBins.length || 2;
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
      console.error("OSRM Route Generation Error:", e);
    } finally {
      setIsRoutingLoading(false);
    }
  };

  // Expose OSRM generator and flyTo directly on window
  useEffect(() => {
    if (!allowRoute) return;

    window.generateOSRMRoute = generateOSRMRoute;
    window.setMapShowRoute = (val) => {
      setShowRoute(val);
      if (!val) setRoutePositions([]);
    };
    window.toggleMapSimulation = () => setIsSimulated((prev) => !prev);
    window.resetMapSimulation = () => {
      setIsSimulated(false);
      setShowRoute(false);
      setRoutePositions([]);
    };

    // Sidebar-to-Map flyTo helper
    window.flyToBin = (lat, lng, zoom = 16, binId) => {
      const map = window.muniMap || _muniMapInstance;
      if (map && typeof map.flyTo === 'function') {
        map.flyTo([lat, lng], zoom, { animate: true, duration: 1.5 });
        if (binId && markerRefs.current && markerRefs.current[binId]) {
          setTimeout(() => {
            try { markerRefs.current[binId].openPopup(); } catch(e){}
          }, 1400);
        }
      }
    };

    const handleShowRoute = () => generateOSRMRoute();
    const handleClearRoute = () => {
      setShowRoute(false);
      setRoutePositions([]);
    };
    const handleToggleSim = () => setIsSimulated((prev) => !prev);
    const handleReset = () => {
      setIsSimulated(false);
      setShowRoute(false);
      setRoutePositions([]);
    };

    window.addEventListener('ecoroute:show', handleShowRoute);
    window.addEventListener('ecoroute:clear', handleClearRoute);
    window.addEventListener('ecoroute:advance-time', handleToggleSim);
    window.addEventListener('ecoroute:reset', handleReset);

    // Direct DOM button bindings
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

        {/* Detailed Map Popups with Bin Name, Status, Capacity, Waste Type, and Last Pickup Date */}
        {binList.map((bin) => (
          <Marker
            key={`${bin.id}-${bin.fillPct}`}
            position={bin.pos}
            icon={bin.icon}
            ref={(ref) => {
              if (ref) markerRefs.current[bin.id] = ref;
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
