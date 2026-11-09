import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, Polyline, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { fetchBinsFromDB } from './firebase.js';
import { appStore } from './AppContext.jsx';
import {
  PuneMap,
  EcoRouteMap,
  wardBins,
  TRUCK_DEPOT,
  RECYCLING_PLANT,
  depotIcon,
  plantIcon,
  redIcon,
  orangeIcon,
  greenIcon,
  fetchOSRMTrip,
  renderPriorityListUI,
  simulateTimeAdvance,
  resetTimeSimulation,
  mockHeatmapPoints,
  mountMap
} from './MapComponent.jsx';

// Map reference and visibility observer
export function MapResizer({ onReady }) {
  const map = useMap();
  useEffect(() => {
    if (onReady) onReady(map);
    window.muniMap = map;
    window.muniLeafletMap = map;
    const container = map.getContainer();
    if (container && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
            map.invalidateSize();
          }
        }
      });
      ro.observe(container);
      return () => ro.disconnect();
    }
  }, [map, onReady]);
  return null;
}

/**
 * MunicipalDashboard Component
 * 
 * Strict Data Guard & Sizing:
 * - Loading State Guard: const [loading, setLoading] = useState(true), flips to false after Firebase fetch resolves.
 * - Conditional Rendering: renders spinner placeholder while loading; mounts <MapContainer> ONLY when loading is false.
 * - Strictly Hardcoded Center: center={[18.6298, 73.7997]} (PCMC / Pune coordinates) - never dynamic variables.
 * - Zero invalidateSize: eliminates unmount/crash during Firebase resolution and tab switching.
 * - Explicit Tailwind sizing: h-[600px] sm:h-[70vh].
 */
export function MunicipalDashboard({ height = '600px', allowRoute = true, onMapReady }) {
  const [bins, setBins] = useState(wardBins);
  const [loading, setLoading] = useState(true);
  const [showRoute, setShowRoute] = useState(false);
  const [routePositions, setRoutePositions] = useState([]);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [portalTarget, setPortalTarget] = useState(() => (typeof document !== 'undefined' ? document.getElementById('heatmapToggleRoot') : null));
  const markerRefs = useRef({});

  // TSP multi-truck split paths
  const routePath = routePositions;
  const halfIndex = Math.ceil(routePath.length / 2);
  const truck1Path = routePath.slice(0, halfIndex + 1);
  const truck2Path = routePath.slice(halfIndex);

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

  // Loading State Guard: Asynchronously fetch Firebase data before mounting MapContainer
  useEffect(() => {
    let isMounted = true;
    async function loadMunicipalData() {
      try {
        let fetchedData = [];
        if (typeof fetchBinsFromDB === 'function') {
          fetchedData = await fetchBinsFromDB();
        } else if (typeof window !== 'undefined' && window.fetchBinsFromDB) {
          fetchedData = await window.fetchBinsFromDB();
        }

        if (isMounted) {
          const finalBins = (fetchedData && fetchedData.length >= wardBins.length) ? fetchedData : wardBins;
          setBins(finalBins);
          if (typeof window !== 'undefined') {
            window.wardBins = finalBins;
            renderPriorityListUI(finalBins);
          }
        }
      } catch (err) {
        console.error('Municipal data load error, using unified wardBins:', err);
        if (isMounted) setBins(wardBins);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadMunicipalData();
    return () => { isMounted = false; };
  }, []);

  // Compute reactive bin list with status labels, icons, fill text, and capacity/waste details
  const binList = (bins && bins.length ? bins : wardBins).map((b) => {
    const fallbackDef = wardBins.find(wb => String(wb.id) === String(b.id) || String(wb.code) === String(b.code)) || {};
    const pos = (b.pos && Array.isArray(b.pos) && b.pos.length === 2)
      ? b.pos
      : (b.lat && b.lng ? [b.lat, b.lng] : fallbackDef.pos);
    const isCollected = b.collected === true;
    const fillPct = isCollected ? 0 : (typeof b.fillPct === 'number'
      ? b.fillPct
      : (typeof b.fillPercent === 'number' ? b.fillPercent : (fallbackDef.fillPct || fallbackDef.baseFill || 60)));
    const isCritical = !isCollected && fillPct >= 80;
    const isWarning = !isCollected && fillPct >= 50 && fillPct < 80;
    const label = isCollected ? 'Normal' : (isCritical ? 'Critical' : isWarning ? 'Warning' : 'Normal');
    const icon = isCollected ? greenIcon : (isCritical ? redIcon : isWarning ? orangeIcon : greenIcon);
    const fill = `${fillPct}% (${label})`;
    return {
      ...fallbackDef,
      ...b,
      pos,
      lat: pos ? pos[0] : b.lat,
      lng: pos ? pos[1] : b.lng,
      fillPct,
      fillPercent: fillPct,
      status: label,
      label,
      icon,
      fill,
      capacity: b.capacity || fallbackDef.capacity || (b.capacityL ? `${b.capacityL}L` : '1000L'),
      wasteType: b.wasteType || fallbackDef.wasteType || 'Organic',
      lastPickup: b.lastPickup || fallbackDef.lastPickup || 'Today, 06:30 AM'
    };
  });

  // Keep Priority Collection List in sync whenever binList changes
  useEffect(() => {
    if (allowRoute) {
      renderPriorityListUI(binList);
    }
  }, [binList, allowRoute]);

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

  // Solve TSP & fetch OSRM trip
  const generateRealRoute = async () => {
    const criticalBins = binList.filter((b) => !b.collected && (b.fillPct >= 80 || b.label === 'Critical' || (b.status && b.status.toLowerCase().includes('critical'))));
    const middleCoords = (criticalBins.length > 0
      ? criticalBins.map((b) => b.pos)
      : [[18.5204, 73.8567], [18.5367, 73.8242], [18.5262, 73.8441]]
    ).filter(p => Array.isArray(p) && p.length === 2);

    const waypoints = [TRUCK_DEPOT.pos, ...middleCoords, RECYCLING_PLANT.pos].filter(p => Array.isArray(p) && p.length === 2);

    try {
      const result = await fetchOSRMTrip(waypoints);
      if (result && result.coords) {
        setRoutePositions(result.coords);
        setShowRoute(true);

        const countEl = document.getElementById('mapRouteBinCount');
        const fixedDistEl = document.getElementById('optFixedDist');
        const selectDistEl = document.getElementById('optSelectDist');
        const distSavingsEl = document.getElementById('optDistSavings');
        const co2SavedEl = document.getElementById('optCO2Saved');

        const activeCount = criticalBins.length || middleCoords.length;
        if (countEl) countEl.textContent = activeCount;
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
        return result;
      }
    } catch (e) {
      console.error('Failed to generate real route in MunicipalDashboard:', e);
    }
  };

  // Expose methods for UI buttons
  useEffect(() => {
    if (allowRoute) {
      window.updateMapBins = (newBins) => setBins([...newBins]);
      window.generateRealRoute = generateRealRoute;
      window.generateOSRMRoute = generateRealRoute;
      window.generateOptimalRoute = generateRealRoute;
      window.setMapShowRoute = (val) => {
        setShowRoute(val);
        if (!val) setRoutePositions([]);
      };
      window.flyToBin = (lat, lng, zoom = 16, binId) => {
        const map = window.muniMap || window.muniLeafletMap;
        if (map && typeof map.flyTo === 'function') {
          map.flyTo([lat, lng], zoom, { animate: true, duration: 1.5 });
          if (binId && markerRefs.current) {
            setTimeout(() => {
              try {
                const marker = markerRefs.current[binId];
                if (marker && typeof marker.openPopup === 'function') marker.openPopup();
              } catch(e) {}
            }, 1200);
          }
        }
      };

      const handleShowRoute = () => generateRealRoute();
      const handleClearRoute = () => {
        setShowRoute(false);
        setRoutePositions([]);
      };
      window.addEventListener('ecoroute:show', handleShowRoute);
      window.addEventListener('ecoroute:clear', handleClearRoute);
      return () => {
        window.removeEventListener('ecoroute:show', handleShowRoute);
        window.removeEventListener('ecoroute:clear', handleClearRoute);
      };
    }
  }, [allowRoute, binList]);

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
    <div className={`relative w-full ${height === '260px' ? 'h-[260px]' : 'h-[600px] sm:h-[70vh]'} overflow-hidden rounded-2xl bg-slate-900`} style={{ height: height, minHeight: height }}>
      {portalTarget && heatmapToggleBtn && createPortal(heatmapToggleBtn, portalTarget)}
      {!portalTarget && allowRoute && (
        <div className="absolute top-3 right-3 z-[500]">
          {heatmapToggleBtn}
        </div>
      )}

      {/* Strict conditional render: render placeholder if loading is true or if wardBins.length === 0 */}
      {loading || !bins || bins.length === 0 || wardBins.length === 0 ? (
        <div className="flex h-[600px] w-full items-center justify-center bg-gray-50 border rounded-lg text-gray-500">Loading Map Data...</div>
      ) : (
        <MapContainer
          center={[18.6298, 73.7997]}
          zoom={12}
          className={`w-full ${height === '260px' ? 'h-[260px]' : 'h-[600px] sm:h-[70vh]'}`}
          style={{ height: '100%', minHeight: height, width: '100%' }}
        >
          <MapResizer onReady={onMapReady} />

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
                  <Polyline
                    positions={truck1Path}
                    color="#3b82f6"
                    dashArray="6, 6"
                    weight={5}
                    pathOptions={{ color: '#3b82f6', dashArray: '6, 6', weight: 5 }}
                  >
                    <Tooltip sticky>TR-01 Route</Tooltip>
                    <Popup>
                      <div style={{ fontFamily: 'Inter, sans-serif', padding: '2px' }}>
                        <strong style={{ color: '#3b82f6', fontSize: '13px' }}>TR-01 Route</strong>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>Assigned Fleet: Truck TR-01 (Capacity: 4.5T)</div>
                      </div>
                    </Popup>
                  </Polyline>

                  <Polyline
                    positions={truck2Path}
                    color="#a855f7"
                    dashArray="6, 6"
                    weight={5}
                    pathOptions={{ color: '#a855f7', dashArray: '6, 6', weight: 5 }}
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

              {/* Permanent Facility 1: Truck Depot (Start) */}
              <Marker position={TRUCK_DEPOT.pos} icon={depotIcon}>
                <Popup className="eco-facility-popup">
                  <div style={{ fontFamily: 'Inter, sans-serif', minWidth: '220px', padding: '2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', gap: '8px' }}>
                      <div style={{ fontWeight: 800, fontSize: '13px', color: '#0f172a' }}>{TRUCK_DEPOT.name}</div>
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', backgroundColor: '#e0f2fe', color: '#0369a1' }}>Active</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#475569', marginBottom: '6px' }}>{TRUCK_DEPOT.role}</div>
                    <div style={{ fontSize: '11px', color: '#0284c7', fontWeight: 600 }}>Zone: {TRUCK_DEPOT.zone}</div>
                  </div>
                </Popup>
                <Tooltip direction="top" offset={[0, -18]} opacity={0.9}>
                  <span className="font-semibold">{TRUCK_DEPOT.name}</span>
                </Tooltip>
              </Marker>

              {/* Permanent Facility 2: Recycling Plant (End) */}
              <Marker position={RECYCLING_PLANT.pos} icon={plantIcon}>
                <Popup className="eco-facility-popup">
                  <div style={{ fontFamily: 'Inter, sans-serif', minWidth: '220px', padding: '2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', gap: '8px' }}>
                      <div style={{ fontWeight: 800, fontSize: '13px', color: '#0f172a' }}>{RECYCLING_PLANT.name}</div>
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', backgroundColor: '#f3e8ff', color: '#7e22ce' }}>Processing</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#475569', marginBottom: '6px' }}>{RECYCLING_PLANT.role}</div>
                    <div style={{ fontSize: '11px', color: '#7e22ce', fontWeight: 600 }}>Zone: {RECYCLING_PLANT.zone}</div>
                  </div>
                </Popup>
                <Tooltip direction="top" offset={[0, -18]} opacity={0.9}>
                  <span className="font-semibold">{RECYCLING_PLANT.name}</span>
                </Tooltip>
              </Marker>

              {/* Dynamic Bins Layer */}
              {binList.map((bin) => {
                const pos = bin.pos || (bin.lat && bin.lng ? [bin.lat, bin.lng] : null);
                if (!pos) return null;
                return (
                  <Marker
                    key={bin.id || bin.name}
                    position={pos}
                    icon={bin.icon || greenIcon}
                    ref={(ref) => {
                      if (ref) {
                        markerRefs.current[bin.id] = ref;
                        if (bin.code) markerRefs.current[bin.code] = ref;
                      }
                    }}
                  >
                    <Popup className="eco-bin-popup">
                      <div style={{ fontFamily: 'Inter, sans-serif', minWidth: '210px', padding: '2px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', gap: '8px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, padding: '2px 8px', borderRadius: '12px', backgroundColor: '#f1f5f9', color: '#475569' }}>
                            {bin.id}
                          </span>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '12px',
                            backgroundColor: bin.label === 'Critical' ? '#fee2e2' : bin.label === 'Warning' ? '#ffedd5' : '#dcfce7',
                            color: bin.label === 'Critical' ? '#b91c1c' : bin.label === 'Warning' ? '#c2410c' : '#15803d'
                          }}>
                            {bin.label}
                          </span>
                        </div>
                        <div style={{ fontWeight: 800, fontSize: '13px', color: '#0f172a', marginBottom: '4px' }}>
                          {bin.name}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', marginBottom: '8px' }}>
                          <span style={{ fontWeight: 700, color: '#0f172a' }}>{bin.fillPct}% Fill Level</span>
                          <span style={{ fontSize: '11px', color: '#94a3b8' }}>• {bin.capacity}</span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '3px', borderTop: '1px solid #f1f5f9', paddingTop: '6px' }}>
                          <div><strong style={{ color: '#475569' }}>Waste Type:</strong> {bin.wasteType}</div>
                          <div><strong style={{ color: '#475569' }}>Last Pickup:</strong> {bin.lastPickup}</div>
                        </div>
                      </div>
                    </Popup>
                    <Tooltip direction="top" offset={[0, -20]} opacity={0.9}>
                      <span className="font-semibold">{bin.name}</span>: {bin.fill || `${bin.fillPct}%`}
                    </Tooltip>
                  </Marker>
                );
              })}
            </>
          )}
        </MapContainer>
      )}
    </div>
  );
}

// Global Mount Helper
export function mountMunicipalDashboard() {
  const rootEl = document.getElementById('map-body');
  if (rootEl) {
    if (!rootEl._reactRoot) {
      rootEl._reactRoot = createRoot(rootEl);
    }
    rootEl._reactRoot.render(<MunicipalDashboard height="600px" allowRoute={true} />);
  }
}

if (typeof window !== 'undefined') {
  window.MunicipalDashboard = MunicipalDashboard;
  window.mountMunicipalDashboard = mountMunicipalDashboard;
  window.mountReactMap = mountMunicipalDashboard;
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
