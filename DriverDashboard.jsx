import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useApp, AppProvider, appStore } from './AppContext.jsx';

// ── In-Cabin Web Audio Synthesizer Chimes ───────────────────────────────────
function playCollectChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    const now = ctx.currentTime;
    // Pleasant two-tone rising success chime
    osc.frequency.setValueAtTime(784, now); // G5
    osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.12); // C6
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.start(now);
    osc.stop(now + 0.35);
  } catch (e) {
    // Audio context may be restricted before user gesture
  }
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate([100, 40, 100]);
  }
}

function playCompletionFanfare() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'triangle';
      const start = now + idx * 0.12;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.2, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      osc.start(start);
      osc.stop(start + 0.35);
    });
  } catch (e) {}
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate([150, 60, 150, 60, 250]);
  }
}

// ── OSRM Street Route Driving Geometry Fetcher ──────────────────────────────
async function fetchDriverOSRMRoute(waypoints = []) {
  if (!waypoints || waypoints.length < 2) return null;
  const coordsStr = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`OSRM API responded with status ${response.status}`);
    const data = await response.json();
    if (data.code === 'Ok' && data.routes && data.routes[0]?.geometry?.coordinates) {
      const leafletCoords = data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      const distanceKm = (data.routes[0].distance / 1000).toFixed(1);
      const durationMin = Math.round(data.routes[0].duration / 60);
      return { coords: leafletCoords, distanceKm, durationMin };
    }
  } catch (err) {
    console.warn("Driver OSRM route fetch fallback:", err);
  }

  // Graceful fallback: straight line connections between waypoints
  return {
    coords: waypoints,
    distanceKm: (waypoints.length * 2.8).toFixed(1),
    durationMin: waypoints.length * 6,
  };
}

// ── Custom Tablet-Optimized High-Contrast Leaflet Markers ───────────────────
function createTruckMarkerIcon() {
  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:44px;height:44px;">
        <div style="position:absolute;inset:-6px;border-radius:50%;background:rgba(14,165,233,0.35);animation:pulse 1.6s infinite ease-out;"></div>
        <div style="width:44px;height:44px;border-radius:14px;background:#0284c7;border:3px solid #ffffff;box-shadow:0 8px 18px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;color:#ffffff;font-size:20px;">
          <i class="fa-solid fa-truck"></i>
        </div>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -22],
  });
}

function createStopMarkerIcon(number, isCurrent = false) {
  const bg = isCurrent ? '#ef4444' : '#dc2626';
  const size = isCurrent ? 42 : 36;
  const pulse = isCurrent ? `<div style="position:absolute;inset:-8px;border-radius:50%;background:rgba(239,68,68,0.45);animation:pulse 1.2s infinite ease-out;"></div>` : '';
  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:${size}px;height:${size}px;">
        ${pulse}
        <div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:3px solid #ffffff;box-shadow:0 6px 14px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:#ffffff;font-weight:900;font-size:16px;font-family:sans-serif;">
          ${number}
        </div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2)],
  });
}

function createCollectedMarkerIcon() {
  return L.divIcon({
    className: '',
    html: `
      <div style="width:32px;height:32px;border-radius:50%;background:#10b981;border:2.5px solid #ffffff;box-shadow:0 4px 10px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:#ffffff;font-size:15px;font-weight:bold;">
        <i class="fa-solid fa-check"></i>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

function createDepotMarkerIcon() {
  return L.divIcon({
    className: '',
    html: `
      <div style="width:38px;height:38px;border-radius:12px;background:#334155;border:3px solid #ffffff;box-shadow:0 6px 14px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:#ffffff;font-size:16px;">
        <i class="fa-solid fa-warehouse"></i>
      </div>
    `,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -19],
  });
}

// ── Map Viewport Adjuster ───────────────────────────────────────────────────
function MapController({ center, zoom, bounds }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    const t = setTimeout(() => map.invalidateSize(), 150);
    return () => clearTimeout(t);
  }, [map]);

  useEffect(() => {
    if (bounds && bounds.length >= 2) {
      try {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      } catch (e) {}
    } else if (center) {
      map.setView(center, zoom || 15);
    }
  }, [map, center, zoom, bounds]);

  return null;
}

// ── Default Reference Depot and Truck Location ─────────────────────────────
const CENTRAL_DEPOT = {
  name: 'Pune Central Municipal Garage / Yard',
  pos: [18.5204, 73.8567],
  id: 'DEPOT-01',
};

// ── Main DriverDashboard Component ──────────────────────────────────────────
export function DriverDashboard() {
  const { bins, markBinCollected, resetDriverRoute } = useApp();
  const [truckPos, setTruckPos] = useState([18.5204, 73.8567]); // Live Truck Position
  const [routeCoords, setRouteCoords] = useState([]);
  const [routeStats, setRouteStats] = useState({ distanceKm: '0.0', durationMin: 0 });
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [bannerNotice, setBannerNotice] = useState(null);
  const [currentSpeed, setCurrentSpeed] = useState(26);
  const [currentTime, setCurrentTime] = useState('');
  const mapRef = useRef(null);

  // Live Tablet Clock
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setCurrentTime(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Compute Uncollected Critical Bins for Driver Route A
  // A bin is considered on the active route if it has pos coords and is not marked collected (or fillPct >= 80)
  const activeCriticalBins = useMemo(() => {
    return (bins || []).filter((b) => {
      if (!b.pos) return false;
      const isCritical = b.fillPct >= 80 || (b.status && b.status.toLowerCase().includes('critical'));
      const isCollected = b.collected === true || (b.status && b.status.toLowerCase().includes('normal') && b.fillPct < 50);
      return isCritical && !isCollected;
    });
  }, [bins]);

  // Collected Bins (turned to Normal / Green)
  const collectedBins = useMemo(() => {
    return (bins || []).filter((b) => {
      if (!b.pos) return false;
      return b.collected === true || (b.status && b.status.toLowerCase().includes('normal') && b.fillPct < 50);
    });
  }, [bins]);

  // The immediate Next Target Bin is the first uncollected bin
  const currentTargetBin = activeCriticalBins[0] || null;

  // Whenever the active waypoints change, fetch the real OSRM street route
  useEffect(() => {
    let isCancelled = false;

    async function updateRouteGeometry() {
      setIsLoadingRoute(true);

      // Build route points: Truck pos -> all uncollected bins -> Central Depot
      const waypoints = [
        truckPos,
        ...activeCriticalBins.map((b) => b.pos),
      ];

      // If all critical bins collected, route directly back to Depot
      if (activeCriticalBins.length === 0) {
        waypoints.push(CENTRAL_DEPOT.pos);
      }

      if (waypoints.length >= 2) {
        const result = await fetchDriverOSRMRoute(waypoints);
        if (!isCancelled && result && result.coords) {
          setRouteCoords(result.coords);
          setRouteStats({
            distanceKm: result.distanceKm,
            durationMin: result.durationMin,
          });
        }
      } else {
        if (!isCancelled) {
          setRouteCoords([]);
          setRouteStats({ distanceKm: '0.0', durationMin: 0 });
        }
      }

      if (!isCancelled) setIsLoadingRoute(false);
    }

    updateRouteGeometry();
    return () => { isCancelled = true; };
  }, [activeCriticalBins, truckPos]);

  // Compute bounding box for auto-fitting the map view
  const mapBounds = useMemo(() => {
    const pts = [truckPos];
    if (currentTargetBin) pts.push(currentTargetBin.pos);
    activeCriticalBins.forEach((b) => pts.push(b.pos));
    if (pts.length < 2) pts.push(CENTRAL_DEPOT.pos);
    return pts;
  }, [truckPos, currentTargetBin, activeCriticalBins]);

  // ── CORE ACTION: "Mark Current Bin Collected" ──────────────────────────────
  const handleMarkCurrentBinCollected = () => {
    if (!currentTargetBin) return;

    const collectedTarget = currentTargetBin;
    const binId = collectedTarget.id;

    // 1. Update Global Context: Changes bin status from "Critical (Red)" to "Normal (Green)"
    if (typeof markBinCollected === 'function') {
      markBinCollected(binId);
    } else if (typeof window !== 'undefined' && window.markBinCollectedInContext) {
      window.markBinCollectedInContext(binId);
    } else if (appStore?.actions?.markBinCollected) {
      appStore.actions.markBinCollected(binId);
    }

    // 2. Advance simulated truck position to this bin's location
    setTruckPos(collectedTarget.pos);

    // 3. Play audio chime feedback
    playCollectChime();

    // 4. Temporary banner feedback for in-cab tablet
    const remainingCount = activeCriticalBins.length - 1;
    if (remainingCount > 0) {
      setBannerNotice({
        type: 'success',
        title: `Stop Collected: ${collectedTarget.name} (${binId})`,
        message: `Status updated to Normal (Green). Route recalibrated to next stop (${remainingCount} bins remaining).`,
      });
    } else {
      playCompletionFanfare();
      setBannerNotice({
        type: 'done',
        title: `🎉 All Assigned Bins Collected!`,
        message: `Route A complete. All critical bins cleared from active queue. Proceed back to Central Depot.`,
      });
    }

    setTimeout(() => {
      setBannerNotice(null);
    }, 6000);
  };

  // Reset route for demo testing
  const handleResetRoute = () => {
    if (typeof resetDriverRoute === 'function') {
      resetDriverRoute();
    } else if (typeof window !== 'undefined' && window.resetDriverRouteInContext) {
      window.resetDriverRouteInContext();
    }
    setTruckPos(CENTRAL_DEPOT.pos);
    setBannerNotice({
      type: 'info',
      title: 'Route Simulation Reset',
      message: 'Restored all Route A critical bins for collection testing.',
    });
    setTimeout(() => setBannerNotice(null), 4000);
  };

  // Recenter on Truck
  const handleRecenterOnTruck = () => {
    const map = mapRef.current;
    if (map) {
      map.flyTo(truckPos, 16, { animate: true, duration: 1 });
    }
  };

  return (
    <div className="w-full min-h-[92vh] flex flex-col bg-slate-950 text-white font-sans select-none pb-4">
      
      {/* ── TOP TABLET HUD BAR (Large, glanceable for mounted tablet) ───────── */}
      <div className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 shadow-lg sticky top-0 z-30">
        
        {/* Left: Truck Identity & GPS Ping */}
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-600 to-blue-500 text-white flex items-center justify-center font-black text-xl shadow-md shadow-sky-600/30">
            <i className="fa-solid fa-truck-front"></i>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg sm:text-xl font-black text-white tracking-tight">TRUCK TR-01</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                GPS LIVE
              </span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5 font-medium flex items-center gap-2">
              <span>Driver: <strong className="text-slate-200">Ramesh Patil</strong></span>
              <span>•</span>
              <span className="text-sky-400 font-semibold font-mono">Route A (Corridor)</span>
            </div>
          </div>
        </div>

        {/* Center: Live Vehicle Telemetry Gauges */}
        <div className="hidden lg:flex items-center gap-6 px-4 py-1.5 bg-slate-800/60 rounded-2xl border border-slate-700/60">
          <div>
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Speed</div>
            <div className="text-lg font-black font-mono text-emerald-400">{currentSpeed} km/h</div>
          </div>
          <div className="w-px h-7 bg-slate-700"></div>
          <div>
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Compactor Load</div>
            <div className="text-lg font-black font-mono text-sky-400">
              {2450 + (collectedBins.length * 480)}L <span className="text-xs text-slate-400 font-normal">/ 4000L</span>
            </div>
          </div>
          <div className="w-px h-7 bg-slate-700"></div>
          <div>
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Assigned Remaining</div>
            <div className="text-lg font-black font-mono text-amber-400">
              {activeCriticalBins.length} <span className="text-xs text-slate-400 font-normal">Stops</span>
            </div>
          </div>
        </div>

        {/* Right: Tablet Clock & Controls */}
        <div className="flex items-center gap-2.5">
          <div className="text-right hidden sm:block">
            <div className="text-xs text-slate-400 font-medium">Shift Time</div>
            <div className="text-base font-black font-mono text-white tracking-wide">{currentTime}</div>
          </div>
          <button
            onClick={handleRecenterOnTruck}
            className="p-3 bg-slate-800 hover:bg-slate-700 text-sky-400 rounded-2xl border border-slate-700 transition-all flex items-center gap-2 text-xs font-bold"
            title="Recenter on Truck Position"
          >
            <i className="fa-solid fa-location-crosshairs text-base"></i>
            <span className="hidden sm:inline">Follow Truck</span>
          </button>
          <button
            onClick={() => {
              if (window.switchView) window.switchView('municipal');
            }}
            className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl border border-slate-700 transition-all text-xs font-bold flex items-center gap-1.5"
            title="Exit Driver Tablet Mode"
          >
            <i className="fa-solid fa-arrow-right-from-bracket"></i>
            <span className="hidden sm:inline">Exit</span>
          </button>
        </div>
      </div>

      {/* ── DYNAMIC NOTIFICATION BANNER ──────────────────────────────────────── */}
      {bannerNotice && (
        <div
          className={`mx-4 sm:mx-6 mt-3 p-4 rounded-2xl border flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-3 duration-300 shadow-xl ${
            bannerNotice.type === 'done'
              ? 'bg-gradient-to-r from-emerald-900 to-teal-900 border-emerald-500 text-emerald-100'
              : 'bg-gradient-to-r from-sky-950 to-slate-900 border-sky-500 text-sky-100'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-xl">
              {bannerNotice.type === 'done' ? '🏆' : '✅'}
            </div>
            <div>
              <div className="font-extrabold text-sm sm:text-base">{bannerNotice.title}</div>
              <div className="text-xs opacity-90">{bannerNotice.message}</div>
            </div>
          </div>
          <button
            onClick={() => setBannerNotice(null)}
            className="text-white/60 hover:text-white p-2 text-sm"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      )}

      {/* ── CURRENT TURN-BY-TURN GUIDANCE CARD ───────────────────────────────── */}
      <div className="px-4 sm:px-6 pt-3 pb-2">
        {currentTargetBin ? (
          <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-rose-950/40 rounded-3xl p-4 sm:p-5 border-2 border-rose-500/60 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            
            {/* Target Details */}
            <div className="flex items-start sm:items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-rose-600 text-white flex items-center justify-center text-2xl font-black shadow-lg shadow-rose-600/40 flex-shrink-0 animate-bounce">
                <i className="fa-solid fa-diamond-turn-right"></i>
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-500 text-white tracking-wide uppercase">
                    NEXT STOP #1 of {activeCriticalBins.length}
                  </span>
                  <span className="font-mono text-xs font-bold text-rose-300">
                    ID: {currentTargetBin.id}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-950 text-red-200 border border-red-700">
                    CRITICAL ({currentTargetBin.fillPct}% FULL)
                  </span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-white mt-1">
                  {currentTargetBin.name}
                </h3>
                <div className="text-xs text-slate-300 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>Sector: <strong>{currentTargetBin.sector}</strong></span>
                  <span>•</span>
                  <span>Type: <strong className="text-emerald-400">{currentTargetBin.wasteType}</strong></span>
                  <span>•</span>
                  <span>Cap: <strong>{currentTargetBin.capacity}</strong></span>
                </div>
              </div>
            </div>

            {/* OSRM Route Navigation Stats */}
            <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 pt-3 md:pt-0 border-slate-800">
              <div className="text-left md:text-right">
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Drive Distance</div>
                <div className="text-xl sm:text-2xl font-black font-mono text-sky-400">
                  {routeStats.distanceKm} <span className="text-xs font-medium text-slate-400">km</span>
                </div>
              </div>
              <div className="text-left md:text-right">
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Est. Travel Time</div>
                <div className="text-xl sm:text-2xl font-black font-mono text-emerald-400">
                  ~{routeStats.durationMin} <span className="text-xs font-medium text-slate-400">mins</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-teal-950 rounded-3xl p-5 border-2 border-emerald-500/60 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-3xl font-black shadow-lg shadow-emerald-600/40 flex-shrink-0">
                <i className="fa-solid fa-flag-checkered"></i>
              </div>
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-500 text-slate-950 tracking-wide uppercase">
                  ROUTE A COMPLETED
                </span>
                <h3 className="text-xl sm:text-2xl font-black text-white mt-1">
                  All Critical Bins Cleared &amp; Collected!
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Route A queue is fully cleared. Head back to Central Municipal Depot for offloading.
                </p>
              </div>
            </div>
            <button
              onClick={handleResetRoute}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs font-bold rounded-xl border border-emerald-500/40 transition-all flex items-center gap-2 flex-shrink-0"
            >
              <i className="fa-solid fa-rotate-left"></i>
              <span>Reset Route for Demo</span>
            </button>
          </div>
        )}
      </div>

      {/* ── LARGE TABLET LEAFLET MAP CONTAINER ──────────────────────────────── */}
      <div className="px-4 sm:px-6 flex-1 flex flex-col min-h-[460px] sm:min-h-[520px] relative mt-2">
        <div className="w-full flex-1 rounded-3xl overflow-hidden border-2 border-slate-800 shadow-2xl relative bg-slate-900">
          
          {/* Map Loading Overlay */}
          {isLoadingRoute && (
            <div className="absolute top-4 left-4 z-[500] px-3.5 py-2 rounded-xl bg-slate-900/90 text-sky-400 border border-sky-500/40 text-xs font-bold flex items-center gap-2 shadow-lg backdrop-blur-md">
              <i className="fa-solid fa-circle-notch fa-spin"></i>
              <span>OSRM Recalibrating Street Geometry...</span>
            </div>
          )}

          {/* Map Quick Badges Overlay */}
          <div className="absolute top-4 right-4 z-[500] flex flex-col gap-2">
            <div className="px-3 py-1.5 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-700 text-[11px] font-bold text-slate-200 shadow-lg flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
              <span>{activeCriticalBins.length} Critical Pending</span>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-700 text-[11px] font-bold text-emerald-400 shadow-lg flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span>{collectedBins.length} Normal / Collected</span>
            </div>
          </div>

          <MapContainer
            center={truckPos}
            zoom={15}
            style={{ width: '100%', height: '100%', minHeight: '460px' }}
            zoomControl={false}
            ref={mapRef}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <MapController bounds={mapBounds} />

            {/* Truck Live Location Marker */}
            <Marker position={truckPos} icon={createTruckMarkerIcon()}>
              <Popup>
                <div className="p-2 text-slate-900">
                  <div className="font-extrabold text-sm">Truck TR-01 (Current Location)</div>
                  <div className="text-xs text-slate-600 mt-0.5">Driver: Ramesh Patil • Speed: {currentSpeed} km/h</div>
                </div>
              </Popup>
            </Marker>

            {/* Central Depot Location Marker */}
            <Marker position={CENTRAL_DEPOT.pos} icon={createDepotMarkerIcon()}>
              <Popup>
                <div className="p-2 text-slate-900">
                  <div className="font-extrabold text-sm">{CENTRAL_DEPOT.name}</div>
                  <div className="text-xs text-slate-600">Base Depot &amp; Maintenance Yard</div>
                </div>
              </Popup>
            </Marker>

            {/* Critical Uncollected Bins (Red Pulsing Waypoints) */}
            {activeCriticalBins.map((bin, idx) => {
              const isCurrent = currentTargetBin && currentTargetBin.id === bin.id;
              return (
                <Marker
                  key={bin.id}
                  position={bin.pos}
                  icon={createStopMarkerIcon(idx + 1, isCurrent)}
                >
                  <Popup>
                    <div className="p-2 text-slate-900">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                          {isCurrent ? 'NEXT STOP' : `STOP #${idx + 1}`}
                        </span>
                        <span className="font-bold text-xs">{bin.id}</span>
                      </div>
                      <div className="font-bold text-sm">{bin.name}</div>
                      <div className="text-xs text-rose-600 font-extrabold mt-0.5">
                        Fill Level: {bin.fillPct}% (Critical Hazard)
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Capacity: {bin.capacity} • {bin.wasteType}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {/* Collected Bins (Green with Checkmark) */}
            {collectedBins.map((bin) => (
              <Marker
                key={bin.id}
                position={bin.pos}
                icon={createCollectedMarkerIcon()}
              >
                <Popup>
                  <div className="p-2 text-slate-900">
                    <div className="flex items-center gap-1 mb-1">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        COLLECTED
                      </span>
                      <span className="font-bold text-xs">{bin.id}</span>
                    </div>
                    <div className="font-bold text-sm">{bin.name}</div>
                    <div className="text-xs text-emerald-600 font-bold mt-0.5">
                      Status: Normal (Green) • {bin.fillPct}%
                    </div>
                    <div className="text-[10px] text-slate-500">Collected Just now</div>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* OSRM Driving Street Geometry Polyline */}
            {routeCoords && routeCoords.length > 0 && (
              <Polyline
                positions={routeCoords}
                pathOptions={{
                  color: '#0284c7',
                  weight: 7,
                  opacity: 0.9,
                  lineJoin: 'round',
                  lineCap: 'round',
                }}
              />
            )}
          </MapContainer>
        </div>
      </div>

      {/* ── PROMINENT BOTTOM TABLET CONTROL BUTTON (Oversized for in-cab mount) */}
      <div className="px-4 sm:px-6 pt-4">
        {currentTargetBin ? (
          <button
            onClick={handleMarkCurrentBinCollected}
            className="w-full py-5 sm:py-7 px-6 sm:px-8 bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xl sm:text-2xl md:text-3xl rounded-3xl shadow-2xl shadow-emerald-500/40 active:scale-[0.98] transition-all flex items-center justify-center gap-4 border-4 border-emerald-300 ring-4 ring-emerald-500/20"
          >
            <i className="fa-solid fa-circle-check text-2xl sm:text-3xl md:text-4xl text-slate-950 flex-shrink-0 animate-pulse"></i>
            <span className="tracking-tight text-center">
              MARK CURRENT BIN COLLECTED ({currentTargetBin.id} • {currentTargetBin.name.split(' ')[0]})
            </span>
          </button>
        ) : (
          <button
            onClick={handleResetRoute}
            className="w-full py-5 sm:py-6 px-6 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-black text-xl sm:text-2xl rounded-3xl shadow-2xl shadow-sky-600/30 active:scale-[0.98] transition-all flex items-center justify-center gap-3 border-2 border-sky-400"
          >
            <i className="fa-solid fa-rotate-left text-2xl"></i>
            <span>ALL BINS COLLECTED — TAP TO RELOAD ROUTE SIMULATION</span>
          </button>
        )}
      </div>

    </div>
  );
}

// ── Global Mount Helper ─────────────────────────────────────────────────────
export function mountDriverDashboard() {
  const rootEl = document.getElementById('driverDashboardRoot');
  if (rootEl && !rootEl._reactRoot) {
    const root = createRoot(rootEl);
    root.render(
      <AppProvider>
        <DriverDashboard />
      </AppProvider>
    );
    rootEl._reactRoot = root;
  }
}

if (typeof window !== 'undefined') {
  window.mountDriverDashboard = mountDriverDashboard;
  window.DriverDashboard = DriverDashboard;
}

export default DriverDashboard;
