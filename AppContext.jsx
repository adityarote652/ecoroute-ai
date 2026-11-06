import React, { createContext, useContext, useState, useEffect, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase.js';

// ── Initial State Seed Data ──────────────────────────────────────────────────
const INITIAL_REPORTS = [
  {
    id: 'T-104',
    ticketNum: '104',
    title: 'Market Gate 2 Overflow',
    issue: 'Overflowing Waste',
    location: 'Mandai Sub-Ward',
    reportedBy: 'Citizen #104',
    time: '25 mins ago',
    priority: 'High Priority',
    status: 'Pending',
  },
  {
    id: 'T-089',
    ticketNum: '089',
    title: 'Bin Lid Broken at Ward 4',
    issue: 'Damaged Bin Structure',
    location: 'Deccan Gymkhana Stand',
    reportedBy: 'Resident',
    time: '1 hr ago',
    priority: 'Moderate Risk',
    status: 'Pending',
  },
];

const INITIAL_BINS = [
  // 5 Original Map Bins
  {
    id: '1',
    code: 'B01',
    name: 'Pune City Center',
    sector: 'Ward 12 • Commercial Sector',
    capacity: '1000L',
    wasteType: 'Organic',
    dailyRate: '145 kg/day',
    baseFill: 88,
    fillPct: 88,
    status: 'Critical (Red)',
    pos: [18.5204, 73.8567],
    lastPickup: 'Today, 06:30 AM',
    collected: false,
  },
  {
    id: '2',
    code: 'B02',
    name: 'Karvenagar / Cummins',
    sector: 'Ward 09 • Residential Crossing',
    capacity: '750L',
    wasteType: 'Mixed',
    dailyRate: '85 kg/day',
    baseFill: 62,
    fillPct: 62,
    status: 'Warning (Orange)',
    pos: [18.4893, 73.8202],
    lastPickup: 'Yesterday, 05:00 PM',
    collected: false,
  },
  {
    id: '3',
    code: 'B03',
    name: 'Hinjewadi IT Park',
    sector: 'Ward 21 • IT Corridor',
    capacity: '1500L',
    wasteType: 'Recyclable',
    dailyRate: '60 kg/day',
    baseFill: 35,
    fillPct: 35,
    status: 'Normal (Green)',
    pos: [18.5913, 73.7389],
    lastPickup: 'Today, 07:15 AM',
    collected: false,
  },
  {
    id: '4',
    code: 'B04',
    name: 'Hadapsar Terminal',
    sector: 'Ward 14 • Transit Hub',
    capacity: '1500L',
    wasteType: 'Mixed',
    dailyRate: '180 kg/day',
    baseFill: 92,
    fillPct: 92,
    status: 'Critical (Red)',
    pos: [18.4966, 73.9416],
    lastPickup: 'Yesterday, 04:30 PM',
    collected: false,
  },
  {
    id: '5',
    code: 'B05',
    name: 'Kothrud Stand',
    sector: 'Ward 08 • Transit Hub',
    capacity: '800L',
    wasteType: 'Organic',
    dailyRate: '95 kg/day',
    baseFill: 68,
    fillPct: 68,
    status: 'Warning (Orange)',
    pos: [18.5074, 73.8151],
    lastPickup: '2 days ago',
    collected: false,
  },
  // 4 Missing Bins with Accurate Pune Coordinates
  {
    id: 'B06',
    code: 'B06',
    name: 'FC Road Night Zone',
    sector: 'Ward 12 • Commercial Food Hub',
    capacity: '1000L',
    wasteType: 'Organic',
    dailyRate: '160 kg/day',
    baseFill: 97,
    fillPct: 97,
    status: 'Critical (Red)',
    pos: [18.5262, 73.8441],
    lastPickup: 'Yesterday, 10:00 PM',
    collected: false,
  },
  {
    id: 'B07',
    code: 'B07',
    name: 'Prabhat Road Colony',
    sector: 'Ward 10 • Residential Colony',
    capacity: '1200L',
    wasteType: 'Organic',
    dailyRate: '120 kg/day',
    baseFill: 86,
    fillPct: 86,
    status: 'Critical (Red)',
    pos: [18.5135, 73.8315],
    lastPickup: 'Yesterday, 08:30 PM',
    collected: false,
  },
  {
    id: 'B09',
    code: 'B09',
    name: 'Westend Mall',
    sector: 'Ward 15 • Shopping & Retail',
    capacity: '1500L',
    wasteType: 'Dry',
    dailyRate: '140 kg/day',
    baseFill: 91,
    fillPct: 91,
    status: 'Critical (Red)',
    pos: [18.5623, 73.8078],
    lastPickup: 'Yesterday, 06:15 PM',
    collected: false,
  },
  {
    id: 'B12',
    code: 'B12',
    name: 'Pune University Road',
    sector: 'Ward 11 • University Corridor',
    capacity: '1000L',
    wasteType: 'Mixed',
    dailyRate: '115 kg/day',
    baseFill: 84,
    fillPct: 84,
    status: 'Critical (Red)',
    pos: [18.5367, 73.8242],
    lastPickup: 'Yesterday, 09:00 PM',
    collected: false,
  },
];

const INITIAL_TRUCKS = [
  {
    id: 'Truck TR-01',
    driver: 'Ramesh P.',
    capacity: '4000L',
    status: 'Active',
    zone: 'Route A • Commercial Corridor',
  },
  {
    id: 'Truck TR-02',
    driver: 'Suresh K.',
    capacity: '3500L',
    status: 'Standby',
    zone: 'Route B • Residential North',
  },
];

// ── Global Reactive Store (Bridge for Context across separate React roots) ───
class GlobalAppStore {
  constructor() {
    this.state = {
      citizenReports: INITIAL_REPORTS,
      greenPoints: 450,
      bins: INITIAL_BINS,
      trucks: INITIAL_TRUCKS,
      isSimulated: false,
    };
    this.listeners = new Set();

    this.actions = {
      // 1. Citizen to Municipal Sync: push report to Context array
      addCitizenReport: (reportData) => {
        const ticketNum = reportData.ticketNum || String(Math.floor(105 + Math.random() * 20));
        const newReport = {
          id: 'REP-' + Date.now(),
          ticketNum,
          title: reportData.title || `${reportData.issue || 'Waste Issue'} at ${reportData.locationName || 'Ward Station'}`,
          issue: reportData.issue || 'Overflowing Waste',
          location: reportData.locationName || 'Ward Station',
          reportedBy: reportData.reportedBy || 'Alex Johnson',
          time: 'Just now',
          priority: 'High Priority',
          status: 'Pending',
          notes: reportData.notes || '',
        };

        this.setState((prev) => ({
          citizenReports: [newReport, ...prev.citizenReports],
          greenPoints: prev.greenPoints + 50, // Auto-add +50 points on submission
        }));

        this.syncDOM();
        return newReport;
      },

      // Dispatch complaint action for Municipal oversight
      dispatchComplaint: (reportIdOrTitle) => {
        this.setState((prev) => ({
          citizenReports: prev.citizenReports.map((r) =>
            r.id === reportIdOrTitle || r.title === reportIdOrTitle
              ? { ...r, status: 'Dispatched to TR-01' }
              : r
          ),
        }));
        this.syncDOM();
      },

      // 2. Green Points Wallet Sync: add and deduct globally
      addGreenPoints: (amount = 50) => {
        this.setState((prev) => ({
          greenPoints: prev.greenPoints + amount,
        }));
        this.syncDOM();
      },

      deductGreenPoints: (amount) => {
        let success = false;
        this.setState((prev) => {
          if (prev.greenPoints >= amount) {
            success = true;
            return { greenPoints: prev.greenPoints - amount };
          }
          return prev;
        });
        this.syncDOM();
        return success;
      },

      setGreenPoints: (pts) => {
        this.setState({ greenPoints: pts });
        this.syncDOM();
      },

      // 3. Bin State Sync: Simulate +6h Waste updates Admin Registry
      simulateAdvanceTime: () => {
        this.setState((prev) => {
          const nextSimulated = !prev.isSimulated;
          const updatedBins = prev.bins.map((bin) => {
            if (nextSimulated) {
              const newFill = Math.min(100, bin.baseFill + 15);
              const isCritical = newFill >= 80;
              return {
                ...bin,
                fillPct: newFill,
                status: isCritical ? 'Critical (≥80% Dispatch)' : 'Warning (50-79%)',
              };
            } else {
              return {
                ...bin,
                fillPct: bin.baseFill,
                status: 'Active',
              };
            }
          });

          return {
            isSimulated: nextSimulated,
            bins: updatedBins,
          };
        });
        this.syncDOM();
      },

      resetSimulation: () => {
        this.setState((prev) => ({
          isSimulated: false,
          bins: prev.bins.map((bin) => ({
            ...bin,
            fillPct: bin.baseFill,
            status: 'Active',
          })),
        }));
        this.syncDOM();
      },

      // Modal Add Bin handler: appends new data to Context bins array
      addBin: (binData) => {
        const newBin = {
          id: binData.id || `B-${String(this.state.bins.length + 1).padStart(2, '0')}`,
          name: binData.name || binData.location || 'Deccan Gymkhana Stand',
          sector: binData.sector || 'Ward 04 • High-Priority Sector',
          capacity: binData.capacity || '1000L',
          wasteType: binData.wasteType || 'Organic',
          dailyRate: binData.dailyRate || '85 kg/day',
          baseFill: parseInt(binData.fillPct, 10) || 85,
          fillPct: parseInt(binData.fillPct, 10) || 85,
          status: binData.status || 'Active',
        };

        this.setState((prev) => ({
          bins: [...prev.bins, newBin],
        }));
        this.syncDOM();
        return newBin;
      },

      // Modal Add Truck handler: appends new data to Context trucks array
      addTruck: (truckData) => {
        const newTruck = {
          id: truckData.id || `Truck TR-0${this.state.trucks.length + 1}`,
          driver: truckData.driver || 'Anil M.',
          capacity: truckData.capacity || '4500L',
          status: truckData.status || 'Active',
          zone: truckData.zone || `Route ${String.fromCharCode(65 + this.state.trucks.length)} • Priority Sector`,
        };

        this.setState((prev) => ({
          trucks: [...prev.trucks, newTruck],
        }));
        this.syncDOM();
        return newTruck;
      },

      // 4. Driver Action: Mark bin collected, transition from Critical (Red) to Normal (Green), remove from route
      markBinCollected: (binId) => {
        let updatedTarget = null;
        this.setState((prev) => {
          const updatedBins = prev.bins.map((bin) => {
            const matches = bin.id === binId || bin.id.replace('-', '') === String(binId).replace('-', '');
            if (matches) {
              updatedTarget = {
                ...bin,
                baseFill: 12,
                fillPct: 12,
                status: 'Normal (Green)',
                collected: true,
                lastPickup: 'Just now',
              };
              return updatedTarget;
            }
            return bin;
          });

          return {
            bins: updatedBins,
          };
        });

        // Also sync simulation state if window.state exists
        if (typeof window !== 'undefined' && window.state && Array.isArray(window.state.bins)) {
          window.state.bins.forEach((b) => {
            if (b.id === binId || b.id.replace('-', '') === String(binId).replace('-', '')) {
              b.fillPercent = 12;
              b.status = 'ok';
              b.urgency = 'low';
              b.collected = true;
            }
          });
        }

        this.syncDOM();
        return updatedTarget;
      },

      // Reset driver route collections
      resetDriverRoute: () => {
        this.setState({
          bins: INITIAL_BINS.map((b) => ({ ...b })),
        });
        if (typeof window !== 'undefined' && window.state && Array.isArray(window.state.bins)) {
          window.state.bins.forEach((b) => {
            b.collected = false;
          });
        }
        this.syncDOM();
      },
    };
  }

  getState = () => this.state;

  setState = (updater) => {
    const next = typeof updater === 'function' ? updater(this.state) : updater;
    this.state = { ...this.state, ...next };
    this.listeners.forEach((listener) => listener());
  };

  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  syncDOM = () => {
    if (typeof document === 'undefined') return;

    // Green Points
    const ptsEl = document.getElementById('citizenPoints');
    if (ptsEl) ptsEl.textContent = `${this.state.greenPoints} PTS`;
    if (window.citizenPoints !== undefined) window.citizenPoints = this.state.greenPoints;
    if (window.state) window.state.greenPoints = this.state.greenPoints;

    // Complaint Count
    const pendingEl = document.getElementById('complaintPendingCount');
    if (pendingEl) {
      const pendingCount = this.state.citizenReports.filter((r) => r.status === 'Pending').length;
      pendingEl.textContent = pendingCount > 0 ? `${pendingCount} Pending` : 'All Dispatched';
      pendingEl.className = pendingCount > 0
        ? 'text-xs px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full font-bold'
        : 'text-xs px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full font-bold';
    }

    // High Bins Indicator
    const muniHighBins = document.getElementById('muniHighBins');
    if (muniHighBins) {
      muniHighBins.textContent = this.state.isSimulated
        ? '18 Bins Require Collection'
        : '15 Bins Require Collection';
    }

    // Admin Bin Registry Count
    const countEl = document.getElementById('adminBinCount');
    if (countEl) countEl.textContent = this.state.bins.length + 21; // Baseline 25+
  };
}

export const appStore = new GlobalAppStore();

// ── React Context Creation ───────────────────────────────────────────────────
export const AppContext = createContext(null);

export function AppProvider({ children }) {
  const state = useSyncExternalStore(appStore.subscribe, appStore.getState);
  const contextValue = {
    ...state,
    ...appStore.actions,
  };

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context) return context;
  const state = useSyncExternalStore(appStore.subscribe, appStore.getState);
  return { ...state, ...appStore.actions };
}

// ── 1. Citizen Complaint Oversight React Component (Live Firestore) ─────────
export function MunicipalComplaintsPanel() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe = () => {};

    try {
      if (!db) {
        console.error("Firestore db instance is not initialized.");
        setLoading(false);
        return;
      }

      const collRef = collection(db, 'citizen_reports');

      unsubscribe = onSnapshot(
        collRef,
        (snapshot) => {
          try {
            const list = [];
            snapshot.forEach((docSnap) => {
              const data = docSnap.data();
              list.push({
                id: docSnap.id,
                ...data,
              });
            });

            // Sort newest first by timestamp or createdAt
            list.sort((a, b) => {
              const tA = new Date(a.timestamp || a.createdAt || 0).getTime();
              const tB = new Date(b.timestamp || b.createdAt || 0).getTime();
              return tB - tA;
            });

            setReports(list);
            setLoading(false);

            // Update pending complaints count badge in DOM
            const pendingCountEl = document.getElementById('complaintPendingCount');
            if (pendingCountEl) {
              const pendingCount = list.filter(
                (r) => r.status !== 'Dispatched to TR-01' && r.status !== 'Resolved'
              ).length;
              pendingCountEl.textContent = `${pendingCount} Pending`;
            }
          } catch (processErr) {
            console.error("Error processing citizen_reports snapshot data:", processErr);
          }
        },
        (error) => {
          console.error("Firestore onSnapshot error on citizen_reports collection:", error);
          setLoading(false);
        }
      );
    } catch (err) {
      console.error("Failed to establish real-time listener for citizen_reports:", err);
      setLoading(false);
    }

    return () => {
      try {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      } catch (err) {
        console.error("Error unsubscribing from citizen_reports listener:", err);
      }
    };
  }, []);

  const handleDispatch = async (reportId) => {
    try {
      if (db) {
        const reportRef = doc(db, 'citizen_reports', reportId);
        await updateDoc(reportRef, { status: 'Dispatched to TR-01' });
      }
    } catch (err) {
      console.error("Error updating complaint status in Firestore:", err);
    }

    // Local state fallback / optimistic update
    setReports((prev) =>
      prev.map((r) =>
        r.id === reportId ? { ...r, status: 'Dispatched to TR-01' } : r
      )
    );
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-xs text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
        <i className="fa-solid fa-spinner fa-spin mr-2 text-emerald-500 text-sm"></i>
        <span>Connecting to Firestore &amp; syncing live citizen complaints...</span>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="p-8 text-center text-xs text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
        <i className="fa-solid fa-inbox text-3xl text-slate-300 dark:text-slate-600 block"></i>
        <div className="font-semibold text-slate-700 dark:text-slate-300">No citizen complaints currently logged in Firestore.</div>
        <div className="text-[11px] text-slate-400">
          Reports submitted via the Citizen Hub will appear here in real time.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reports.map((report) => {
        const isDispatched = report.status === 'Dispatched to TR-01';
        const issue = report.issueCategory || report.issue || 'Waste Issue';
        const binLocation = report.nearestBin || report.locationName || report.location || 'Ward Station';
        const title = report.title || `${issue} at ${binLocation}`;
        const priority =
          report.priority ||
          (issue === 'Overflowing Waste' ? 'High Priority' : 'Moderate Risk');
        const reporter = report.reportedBy || 'Citizen Reporter';
        const details = report.additionalDetails || report.notes;

        let timeLabel = 'Just now';
        if (report.timestamp) {
          try {
            const date = new Date(report.timestamp);
            timeLabel = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          } catch (e) {
            timeLabel = report.timestamp;
          }
        } else if (report.time) {
          timeLabel = report.time;
        }

        return (
          <div
            key={report.id}
            className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all animate-in fade-in duration-300"
          >
            <div className="space-y-1 flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  {title}
                </span>
                <span
                  className={`complaint-badge px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    isDispatched
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                      : priority === 'High Priority'
                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                  }`}
                >
                  {isDispatched ? 'Dispatched to TR-01' : priority}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
                <span>Reported by <strong>{reporter}</strong></span>
                <span>•</span>
                <span>{binLocation}</span>
                <span>•</span>
                <span className="font-mono text-[10px]">{timeLabel}</span>
              </div>
              {details && (
                <p className="text-[11px] text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800/80 p-2 rounded-xl border border-slate-200 dark:border-slate-700/60 mt-1 italic">
                  "{details}"
                </p>
              )}
            </div>

            <button
              onClick={() => handleDispatch(report.id)}
              disabled={isDispatched}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1.5 self-start sm:self-auto flex-shrink-0 ${
                isDispatched
                  ? 'bg-emerald-700/80 text-white cursor-default opacity-90'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95'
              }`}
            >
              <i
                className={`fa-solid ${
                  isDispatched ? 'fa-check' : 'fa-truck-fast'
                } text-[11px]`}
              ></i>
              <span>{isDispatched ? 'Dispatched to TR-01' : 'Verify & Dispatch'}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── 2. Admin Bin Registry Table React Component ─────────────────────────────
export function AdminBinRegistryTable() {
  const { bins } = useApp();

  return (
    <>
      {bins.map((bin) => {
        const isCritical = bin.fillPct >= 80;
        const isWarning = bin.fillPct >= 50 && bin.fillPct < 80;

        return (
          <tr
            key={bin.id}
            className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors animate-in fade-in duration-200"
          >
            <td className="p-3">
              <div className="font-bold text-slate-900 dark:text-white">
                {bin.id} • {bin.name}
              </div>
              <div className="text-[11px] text-slate-400">{bin.sector}</div>
            </td>
            <td className="p-3 font-mono font-semibold text-slate-700 dark:text-slate-300">
              {bin.capacity}
            </td>
            <td className="p-3">
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  bin.wasteType === 'Organic'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : bin.wasteType === 'Dry'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                    : bin.wasteType === 'Hazardous'
                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                }`}
              >
                {bin.wasteType}
              </span>
            </td>
            <td className="p-3 font-mono text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-1.5">
                <span>{bin.dailyRate}</span>
                <span
                  className={`text-[10px] font-bold font-mono px-1.5 py-0.2 rounded ${
                    isCritical
                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                      : isWarning
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                  }`}
                >
                  {bin.fillPct}%
                </span>
              </div>
            </td>
            <td className="p-3">
              <span
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all ${
                  isCritical
                    ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 animate-pulse'
                    : isWarning
                    ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300'
                    : 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                }`}
              >
                {bin.status}
              </span>
            </td>
          </tr>
        );
      })}
    </>
  );
}

// ── 3. Municipal Fleet & Drivers React Component ─────────────────────────────
export function AdminTruckListPanel() {
  const { trucks } = useApp();

  return (
    <div className="space-y-3">
      {trucks.map((truck) => (
        <div
          key={truck.id}
          className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 animate-in fade-in duration-300"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 flex items-center justify-center font-bold text-sm">
              <i className="fa-solid fa-truck"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 dark:text-white text-xs">{truck.id}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  {truck.status}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Driver: <strong className="text-slate-700 dark:text-slate-300">{truck.driver}</strong> • Cap: <span className="font-mono font-semibold">{truck.capacity}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[11px] text-slate-400 block font-mono">{truck.zone}</span>
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">Dispatched &amp; Active</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 4. Dynamic Audit Log React Component (every 10 seconds interval) ────────
export function AdminAuditLogPanel() {
  const [logs, setLogs] = useState([
    { id: 1, time: '[10:00 AM]', tag: 'Driver Shift', text: 'Driver TR-01 accepted dispatched route for Ward 4', icon: 'fa-circle-check', color: 'indigo' },
    { id: 2, time: '[09:15 AM]', tag: 'Citizen Inbound', text: 'Citizen report #104 logged for Shivajinagar Market', icon: 'fa-triangle-exclamation', color: 'amber' },
    { id: 3, time: '[08:30 AM]', tag: 'Auto Optimizer', text: 'System auto-generated optimal route for Ward 4 (52.6% saved)', icon: 'fa-route', color: 'emerald' },
  ]);

  useEffect(() => {
    const eventsPool = [
      { tag: 'Health Check', text: 'System health check complete: All 25 bin telemetry streams online', icon: 'fa-heart-pulse', color: 'emerald' },
      { tag: 'Fleet GPS', text: 'Truck TR-02 GPS ping received at Deccan Gymkhana Stand', icon: 'fa-location-dot', color: 'indigo' },
      { tag: 'Telemetry Sync', text: 'Ward 4 telemetry stream synced: 25 sensors reporting optimal fill rates', icon: 'fa-tower-broadcast', color: 'teal' },
      { tag: 'Route Engine', text: 'OSRM street driving route recalibrated: -18.2 km / 20.6 kg CO2 saved', icon: 'fa-route', color: 'blue' },
      { tag: 'Citizen Bot', text: 'Citizen report verified for Mandai Sub-Ward (+50 Green Points)', icon: 'fa-comments', color: 'amber' },
      { tag: 'Driver Ping', text: 'Truck TR-01 completed waypoint #2 at Karvenagar Station', icon: 'fa-truck-fast', color: 'emerald' },
    ];

    const timer = setInterval(() => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const ev = eventsPool[Math.floor(Math.random() * eventsPool.length)];

      const newEntry = {
        id: Date.now() + Math.random(),
        time: `[${timeStr}]`,
        tag: ev.tag,
        text: ev.text,
        icon: ev.icon,
        color: ev.color,
      };

      setLogs((prev) => [newEntry, ...prev.slice(0, 14)]);
    }, 10000); // exactly every 10 seconds

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="space-y-3">
      {logs.map((log) => (
        <div key={log.id} className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className={`w-7 h-7 rounded-lg bg-${log.color}-100 dark:bg-${log.color}-950 text-${log.color}-600 flex items-center justify-center flex-shrink-0 text-xs`}>
            <i className={`fa-solid ${log.icon}`}></i>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] text-slate-400 font-bold">{log.time}</span>
              <span className={`text-[10px] font-semibold text-${log.color}-600`}>{log.tag}</span>
            </div>
            <p className="text-slate-700 dark:text-slate-300 text-xs mt-0.5">{log.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 5. Green Points Wallet React Component ──────────────────────────────────
export function CitizenWallet() {
  const { greenPoints } = useApp();

  return (
    <div className="flex items-center gap-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-4 rounded-2xl shadow-md">
      <i className="fa-solid fa-coins text-amber-300 text-2xl animate-bounce"></i>
      <div>
        <div className="text-[10px] uppercase font-bold tracking-wider opacity-90">
          Green Points Wallet
        </div>
        <div className="text-2xl font-extrabold font-mono" id="citizenPoints">
          {greenPoints} PTS
        </div>
      </div>
    </div>
  );
}

// ── Component Mounting Utilities ────────────────────────────────────────────
export function mountCitizenWallet() {
  const rootEl = document.getElementById('citizenWalletRoot');
  if (rootEl && !rootEl._reactRoot) {
    const root = createRoot(rootEl);
    root.render(
      <AppProvider>
        <CitizenWallet />
      </AppProvider>
    );
    rootEl._reactRoot = root;
  }
}

export function mountMunicipalComplaints() {
  const rootEl = document.getElementById('muniComplaintList');
  if (rootEl && !rootEl._reactRoot) {
    const root = createRoot(rootEl);
    root.render(
      <AppProvider>
        <MunicipalComplaintsPanel />
      </AppProvider>
    );
    rootEl._reactRoot = root;
  }
}

export function mountAdminBinTable() {
  const rootEl = document.getElementById('adminBinTableBody');
  if (rootEl && !rootEl._reactRoot) {
    const root = createRoot(rootEl);
    root.render(
      <AppProvider>
        <AdminBinRegistryTable />
      </AppProvider>
    );
    rootEl._reactRoot = root;
  }
}

export function mountAdminTruckList() {
  const rootEl = document.getElementById('adminTruckList');
  if (rootEl && !rootEl._reactRoot) {
    const root = createRoot(rootEl);
    root.render(
      <AppProvider>
        <AdminTruckListPanel />
      </AppProvider>
    );
    rootEl._reactRoot = root;
  }
}

export function mountAdminAuditLog() {
  const rootEl = document.getElementById('adminAuditLogs');
  if (rootEl && !rootEl._reactRoot) {
    const root = createRoot(rootEl);
    root.render(
      <AppProvider>
        <AdminAuditLogPanel />
      </AppProvider>
    );
    rootEl._reactRoot = root;
  }
}

export function mountAllContextPanels() {
  mountCitizenWallet();
  mountMunicipalComplaints();
  mountAdminBinTable();
  mountAdminTruckList();
  mountAdminAuditLog();
  appStore.syncDOM();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAllContextPanels);
  } else {
    mountAllContextPanels();
  }
}

// Global window bindings for inter-dashboard synchronization
if (typeof window !== 'undefined') {
  window.appStore = appStore;
  window.useApp = useApp;
  window.AppProvider = AppProvider;
  window.AppContext = AppContext;
  window.mountMunicipalComplaints = mountMunicipalComplaints;
  window.mountAdminBinTable = mountAdminBinTable;
  window.mountAdminTruckList = mountAdminTruckList;
  window.mountAdminAuditLog = mountAdminAuditLog;
  window.mountCitizenWallet = mountCitizenWallet;
  window.mountAllContextPanels = mountAllContextPanels;

  // Direct helper methods for button handlers
  window.addCitizenReportToContext = (rep) => appStore.actions.addCitizenReport(rep);
  window.dispatchComplaintInContext = (id) => appStore.actions.dispatchComplaint(id);
  window.addGreenPointsInContext = (amt) => appStore.actions.addGreenPoints(amt);
  window.deductGreenPointsInContext = (amt) => appStore.actions.deductGreenPoints(amt);
  window.simulateAdvanceTimeInContext = () => appStore.actions.simulateAdvanceTime();
  window.resetSimulationInContext = () => appStore.actions.resetSimulation();
  window.addBinToContext = (b) => appStore.actions.addBin(b);
  window.addTruckToContext = (t) => appStore.actions.addTruck(t);
  window.markBinCollectedInContext = (id) => appStore.actions.markBinCollected(id);
  window.resetDriverRouteInContext = () => appStore.actions.resetDriverRoute();
}
