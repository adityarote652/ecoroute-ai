import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useApp, AppProvider, appStore } from './AppContext.jsx';
import { db, updateBinStatusInDB } from './firebase.js';
import { doc, setDoc } from 'firebase/firestore';

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
      <div style="width:38px;height:38px;border-radius:12px;background:#0f172a;border:3px solid #38bdf8;box-shadow:0 6px 14px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;color:#38bdf8;font-size:16px;">
        <i class="fa-solid fa-warehouse"></i>
      </div>
    `,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -19],
  });
}

function createPlantMarkerIcon() {
  return L.divIcon({
    className: '',
    html: `
      <div style="width:38px;height:38px;border-radius:12px;background:#7e22ce;border:3px solid #e9d5ff;box-shadow:0 6px 14px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;color:#ffffff;font-size:16px;">
        <i class="fa-solid fa-recycle"></i>
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
    const t1 = setTimeout(() => map.invalidateSize(), 150);
    const t2 = setTimeout(() => map.invalidateSize(), 500);

    const handleResize = () => {
      if (map) map.invalidateSize();
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('view:switched', handleResize);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('view:switched', handleResize);
    };
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

// ── Default Reference Depot and Facilities ──────────────────────────────────
const TRUCK_DEPOT = {
  name: 'Truck Depot (Start)',
  pos: [18.5500, 73.8000],
  id: 'DEPOT-01',
};

const RECYCLING_PLANT = {
  name: 'Municipal Recycling Plant (End)',
  pos: [18.4984, 73.9213],
  id: 'PLANT-01',
};

// ── Main DriverDashboard Component ──────────────────────────────────────────
export function DriverDashboard() {
  // Read exact routePath and criticalBins directly from Global Context
  const {
    bins = [],
    criticalBins = [],
    routePath = [],
    routeStats = { distanceKm: '0.0', durationMin: 0 },
    markBinCollected,
    resetDriverRoute,
    isRouteActive,
  } = useApp();

  const [truckPos, setTruckPos] = useState(TRUCK_DEPOT.pos); // Live Truck Position starts at Depot
  const [bannerNotice, setBannerNotice] = useState(null);
  const [isUpdatingDb, setIsUpdatingDb] = useState(false);
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

  // Compute Uncollected Critical Bins for Driver Route
  // Read directly from criticalBins in Global Context (the exact route Municipal dispatcher generated)
  const activeCriticalBins = useMemo(() => {
    if (criticalBins && criticalBins.length > 0) {
      return criticalBins.filter((b) => {
        if (!b.pos) return false;
        const isCollected = b.collected === true || (b.status && b.status.toLowerCase().includes('normal') && b.fillPct === 0);
        const isCritical = b.fillPct >= 80 || (b.status && b.status.toLowerCase().includes('critical')) || b.urgency === 'high';
        return isCritical && !isCollected;
      });
    }
    return (bins || []).filter((b) => {
      if (!b.pos) return false;
      const isCritical = b.fillPct >= 80 || (b.status && b.status.toLowerCase().includes('critical'));
      const isCollected = b.collected === true || (b.status && b.status.toLowerCase().includes('normal') && b.fillPct === 0);
      return isCritical && !isCollected;
    });
  }, [criticalBins, bins]);

  // Local Driver Queue state to ensure zero-latency immediate removal upon collection
  const [localQueue, setLocalQueue] = useState([]);

  useEffect(() => {
    setLocalQueue(activeCriticalBins);
  }, [activeCriticalBins]);

  // Collected Bins (turned to Normal / Green)
  const collectedBins = useMemo(() => {
    return (bins || []).filter((b) => {
      if (!b.pos) return false;
      return b.collected === true || (b.status && b.status.toLowerCase().includes('normal') && b.fillPct === 0);
    });
  }, [bins]);

  // The immediate Next Target Bin is the first bin in the driver's local queue
  const currentTargetBin = localQueue[0] || null;

  // The Driver map reads routePath directly from Global Context (does NOT generate its own route)
  const routeCoords = routePath && routePath.length > 0 ? routePath : [];

  // Compute bounding box for auto-fitting the map view
  const mapBounds = useMemo(() => {
    const pts = [truckPos, TRUCK_DEPOT.pos, RECYCLING_PLANT.pos];
    if (currentTargetBin && currentTargetBin.pos) pts.push(currentTargetBin.pos);
    localQueue.forEach((b) => {
      if (b.pos) pts.push(b.pos);
    });
    if (routeCoords && routeCoords.length > 0) {
      pts.push(routeCoords[0]);
      pts.push(routeCoords[routeCoords.length - 1]);
    }
    return pts;
  }, [truckPos, currentTargetBin, localQueue, routeCoords]);

  // ── CORE ACTION: "Mark Bin Collected" (Database Write & Closed Loop Sync) ────
  const handleMarkBinCollected = async () => {
    if (!currentTargetBin) return;

    const collectedTarget = currentTargetBin;
    const binId = collectedTarget.id || collectedTarget.code;
    const normalizedId = String(binId).trim().toUpperCase();

    setIsUpdatingDb(true);

    // 1. Immediately remove from driver's local queue for instant zero-latency UI transition
    setLocalQueue((prevQueue) =>
      prevQueue.filter((b) => {
        const id = String(b.id || b.code).trim().toUpperCase();
        return id !== normalizedId;
      })
    );

    // 2. Advance simulated truck position to this bin's location
    if (collectedTarget.pos) {
      setTruckPos(collectedTarget.pos);
    }

    // 3. Play audio chime and trigger in-cab haptic feedback
    playCollectChime();

    // 4. Trigger Firebase Firestore Write (The Closed Loop)
    try {
      // Direct update via firebase.js helper
      if (typeof updateBinStatusInDB === 'function') {
        await updateBinStatusInDB(binId, {
          status: 'Normal',
          fillPct: 0,
          fillPercent: 0,
          collected: true,
          lastPickup: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
      }

      // Direct Firestore document update if db is initialized
      if (db) {
        const binDocRef = doc(db, 'bins', String(binId));
        await setDoc(
          binDocRef,
          {
            id: String(binId),
            status: 'Normal',
            fillPct: 0,
            fillPercent: 0,
            collected: true,
            lastPickup: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }
    } catch (dbErr) {
      console.warn('Firestore database write notice:', dbErr);
    }

    // 5. Update Global Context / Store:
    //    - Removes bin from driver's active route array (criticalBins)
    //    - Updates bin status to "Normal", fill level to 0%, and color to Green
    //    - Clears Red marker on Municipal map and removes from Priority Collection List without refresh
    if (typeof markBinCollected === 'function') {
      markBinCollected(binId);
    } else if (appStore?.actions?.markBinCollected) {
      appStore.actions.markBinCollected(binId);
    } else if (typeof window !== 'undefined' && window.markBinCollectedInContext) {
      window.markBinCollectedInContext(binId);
    }

    // 6. Mutate window.wardBins so Municipal Map and Priority Collection List instantly sync
    if (typeof window !== 'undefined' && window.wardBins && Array.isArray(window.wardBins)) {
      window.wardBins.forEach((b) => {
        if (
          String(b.id).toUpperCase() === normalizedId ||
          String(b.code).toUpperCase() === normalizedId ||
          String(b.id).replace(/[^a-zA-Z0-9]/g, '') === normalizedId.replace(/[^a-zA-Z0-9]/g, '')
        ) {
          b.fillPct = 0;
          b.fillPercent = 0;
          b.status = 'Normal';
          b.collected = true;
          b.lastPickup = 'Just now';
          if (window.greenIcon) b.icon = window.greenIcon;
        }
      });
      if (typeof window.updateMapBins === 'function') {
        window.updateMapBins([...window.wardBins]);
      }
      if (typeof window.renderPriorityListUI === 'function') {
        window.renderPriorityListUI([...window.wardBins]);
      }
    }

    setIsUpdatingDb(false);

    // 7. Dynamic tablet banner feedback
    const remainingCount = localQueue.length - 1;
    if (remainingCount > 0) {
      setBannerNotice({
        type: 'success',
        title: `Stop Collected: ${collectedTarget.name} (${binId})`,
        message: `Status updated to Normal (Green) • Fill level 0% • Sync dispatched to Municipal & Firebase (${remainingCount} stops remaining).`,
      });
    } else {
      playCompletionFanfare();
      setBannerNotice({
        type: 'done',
        title: `🎉 All Assigned Bins Collected!`,
        message: `Dispatched route complete! All critical bins returned to Normal. Proceed to Municipal Recycling Plant (Ramtekdi) for offloading.`,
      });
    }

    setTimeout(() => {
      setBannerNotice(null);
    }, 5000);
  };

  // Reset route for demo testing
  const handleResetRoute = () => {
    if (typeof resetDriverRoute === 'function') {
      resetDriverRoute();
    } else if (appStore?.actions?.resetDriverRoute) {
      appStore.actions.resetDriverRoute();
    } else if (typeof window !== 'undefined' && window.resetDriverRouteInContext) {
      window.resetDriverRouteInContext();
    }
    setTruckPos(TRUCK_DEPOT.pos);
    setBannerNotice({
      type: 'info',
      title: 'Route Simulation Reset',
      message: 'Restored all critical bins and reset baseline for collection testing.',
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
    <div className="w-full min-h-[92vh] flex flex-col bg-slate-950 text-white font-sans select-none rounded-3xl overflow-hidden border-2 border-slate-800 shadow-2xl pb-4">
      
      {/* ── 1. TOP TABLET HUD BAR (Large, glanceable for mounted tablet) ───────── */}
      <div className="bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 shadow-lg sticky top-0 z-30">
        
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
              {localQueue.length} <span className="text-xs text-slate-400 font-normal">Stops</span>
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
            className="p-3 bg-slate-800 hover:bg-slate-700 text-sky-400 rounded-2xl border border-slate-700 transition-all flex items-center gap-2 text-xs font-bold active:scale-95"
            title="Recenter on Truck Position"
          >
            <i className="fa-solid fa-location-crosshairs text-base"></i>
            <span className="hidden sm:inline">Follow Truck</span>
          </button>
          <button
            onClick={() => {
              if (window.switchView) window.switchView('municipal');
            }}
            className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl border border-slate-700 transition-all text-xs font-bold flex items-center gap-1.5 active:scale-95"
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
          className={`mx-4 sm:px-6 mt-3 p-4 rounded-2xl border flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-3 duration-300 shadow-xl ${
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

      {/* ── 2. LARGE TABLET LEAFLET MAP CONTAINER ──────────────────────────────── */}
      <div className="px-4 sm:px-6 flex-1 flex flex-col min-h-[440px] sm:min-h-[500px] relative mt-3">
        <div className="w-full flex-1 rounded-3xl overflow-hidden border-2 border-slate-800 shadow-2xl relative bg-slate-900">
          
          {/* Dispatched Route Status Overlay */}
          <div className="absolute top-4 left-4 z-[500] px-3.5 py-2 rounded-xl bg-slate-900/90 text-sky-400 border border-sky-500/40 text-xs font-bold flex items-center gap-2 shadow-lg backdrop-blur-md">
            <i className="fa-solid fa-route text-sky-400"></i>
            <span>
              {routeCoords.length > 0
                ? `Municipal Route Dispatched: ${routeStats.distanceKm} km • ~${routeStats.durationMin}m`
                : 'Awaiting Municipal Dispatch'}
            </span>
          </div>

          {/* Map Quick Badges Overlay */}
          <div className="absolute top-4 right-4 z-[500] flex flex-col gap-2">
            <div className="px-3 py-1.5 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-700 text-[11px] font-bold text-slate-200 shadow-lg flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
              <span>{localQueue.length} Critical Pending</span>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-700 text-[11px] font-bold text-emerald-400 shadow-lg flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span>{collectedBins.length} Normal / Collected</span>
            </div>
          </div>

          <MapContainer
            center={truckPos}
            zoom={15}
            style={{ width: '100%', height: '100%', minHeight: '440px' }}
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

            {/* Truck Depot (Start) Location Marker */}
            <Marker position={TRUCK_DEPOT.pos} icon={createDepotMarkerIcon()}>
              <Popup>
                <div className="p-2 text-slate-900">
                  <div className="font-extrabold text-sm">{TRUCK_DEPOT.name}</div>
                  <div className="text-xs text-slate-600">Route Start Point • Municipal Fleet Garage</div>
                </div>
              </Popup>
            </Marker>

            {/* Municipal Recycling Plant (End) Location Marker */}
            <Marker position={RECYCLING_PLANT.pos} icon={createPlantMarkerIcon()}>
              <Popup>
                <div className="p-2 text-slate-900">
                  <div className="font-extrabold text-sm">{RECYCLING_PLANT.name}</div>
                  <div className="text-xs text-slate-600">Route End Point • Ramtekdi Processing Center</div>
                </div>
              </Popup>
            </Marker>

            {/* Critical Uncollected Bins (Red Pulsing Waypoints) */}
            {localQueue.map((bin, idx) => {
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

      {/* ── 3. BELOW THE MAP: NEXT STOP DETAILS & THE ACTION BUTTON ────────────── */}
      <div className="px-4 sm:px-6 pt-4 space-y-3">
        {currentTargetBin ? (
          <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-rose-950/40 rounded-3xl p-5 sm:p-6 border-2 border-rose-500/60 shadow-2xl space-y-4">
            
            {/* Next Stop Details Grid */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              
              {/* Left: Stop Icon & Identification */}
              <div className="flex items-start sm:items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-rose-600 text-white flex items-center justify-center text-3xl font-black shadow-lg shadow-rose-600/40 flex-shrink-0 animate-bounce">
                  <i className="fa-solid fa-location-dot"></i>
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-3 py-1 rounded-full text-xs font-black bg-rose-500 text-white tracking-wider uppercase">
                      NEXT STOP #1 of {localQueue.length}
                    </span>
                    <span className="font-mono text-sm font-extrabold text-rose-300 bg-rose-950/60 px-2.5 py-0.5 rounded-lg border border-rose-800">
                      ID: {currentTargetBin.id}
                    </span>
                    <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-red-950 text-red-200 border border-red-700 animate-pulse">
                      CRITICAL ({currentTargetBin.fillPct}% FULL)
                    </span>
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-black text-white mt-1.5 tracking-tight">
                    {currentTargetBin.name}
                  </h3>
                  <div className="text-xs sm:text-sm text-slate-300 mt-1 flex items-center gap-3 flex-wrap">
                    <span>Sector: <strong className="text-white">{currentTargetBin.sector}</strong></span>
                    <span>•</span>
                    <span>Waste Type: <strong className="text-emerald-400">{currentTargetBin.wasteType}</strong></span>
                    <span>•</span>
                    <span>Capacity: <strong className="text-sky-300">{currentTargetBin.capacity}</strong></span>
                  </div>
                </div>
              </div>

              {/* Right: Route Telemetry to this stop */}
              <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 pt-3 md:pt-0 border-slate-800">
                <div className="text-left md:text-right">
                  <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Drive Distance</div>
                  <div className="text-2xl sm:text-3xl font-black font-mono text-sky-400">
                    {routeStats.distanceKm} <span className="text-xs font-medium text-slate-400">km</span>
                  </div>
                </div>
                <div className="text-left md:text-right">
                  <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Est. Travel Time</div>
                  <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-400">
                    ~{routeStats.durationMin} <span className="text-xs font-medium text-slate-400">mins</span>
                  </div>
                </div>
              </div>
            </div>

            {/* MASSIVE PROMINENT ACTION BUTTON: "Mark Bin Collected" */}
            <button
              onClick={handleMarkBinCollected}
              disabled={isUpdatingDb}
              className="w-full py-6 sm:py-7 px-8 bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-2xl sm:text-3xl rounded-3xl shadow-2xl shadow-emerald-500/50 active:scale-[0.98] transition-all flex items-center justify-center gap-4 border-4 border-emerald-300 ring-4 ring-emerald-500/20 cursor-pointer disabled:opacity-50"
            >
              <i className="fa-solid fa-circle-check text-3xl sm:text-4xl text-slate-950 flex-shrink-0 animate-pulse"></i>
              <span className="tracking-tight text-center">
                {isUpdatingDb ? 'Updating Firebase...' : 'Mark Bin Collected'}
              </span>
            </button>

            <div className="text-center text-xs text-slate-400 font-medium">
              Tapping updates status to <strong className="text-emerald-400">Normal (Green)</strong>, resets fill to <strong className="text-emerald-400">0%</strong>, and writes to Firebase &amp; Municipal Hub.
            </div>

          </div>
        ) : (
          <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-teal-950 rounded-3xl p-6 sm:p-8 border-2 border-emerald-500/60 shadow-2xl space-y-4 text-center">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-3xl font-black shadow-lg shadow-emerald-600/40">
              <i className="fa-solid fa-flag-checkered"></i>
            </div>
            <div>
              <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-500 text-slate-950 tracking-wider uppercase">
                ROUTE A COMPLETED
              </span>
              <h3 className="text-2xl sm:text-3xl font-black text-white mt-2">
                All Assigned Bins Cleared &amp; Collected!
              </h3>
              <p className="text-sm text-slate-300 mt-1 max-w-xl mx-auto">
                Every critical bin on Route A has been collected, reset to Normal (Green), and recorded in Firebase. Proceed to the <strong>Municipal Recycling Plant (Ramtekdi Center)</strong> for payload offloading.
              </p>
            </div>
            <button
              onClick={handleResetRoute}
              className="py-4 px-8 bg-slate-800 hover:bg-slate-700 text-emerald-300 text-base font-bold rounded-2xl border border-emerald-500/40 transition-all inline-flex items-center gap-3 active:scale-95 shadow-lg"
            >
              <i className="fa-solid fa-rotate-left"></i>
              <span>Reload Route Simulation for Testing</span>
            </button>
          </div>
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
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    mountDriverDashboard();
  } else {
    document.addEventListener('DOMContentLoaded', mountDriverDashboard);
  }
}

export default DriverDashboard;
