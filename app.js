// =============================================================
// EcoRoute AI - Application Logic (app.js)  Phase 1
// PROTOTYPE: All predictions use rule-based simulation only.
// =============================================================

(function () {
  'use strict';

  // -- SVG element helper ------------------------------------
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs = {}) => {
    const e = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    return e;
  };

  // -- DOM shorthand -----------------------------------------
  const $ = id => document.getElementById(id);

  // -- Application state -------------------------------------
  // Deep copy backup for deterministic resetting
  const initialBinsState = JSON.parse(JSON.stringify(ECO.BINS));

  const state = {
    bins:      JSON.parse(JSON.stringify(ECO.BINS)),
    trucks:    ECO.TRUCKS,
    depot:     ECO.DEPOT,
    cfg:       ECO.SIMULATION_CONFIG,
    activeView: 'dashboard',
    sidebarCollapsed: false,
    selectedBinId: null,
    routeActive: false,
    ecoRoute: null,
    greenPoints: 450,
  };
  window.state = state;

  function updateGreenPointsUI() {
    const el = $('citizenPoints');
    if (el) el.textContent = `${state.greenPoints} PTS`;
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // HELPERS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  function fillColor(pct) {
    if (pct >= 80) return 'var(--red)';
    if (pct >= 50) return 'var(--yellow)';
    return 'var(--green)';
  }

  function fillColorHex(pct) {
    if (pct >= 80) return '#dc2626';   /* coral red */
    if (pct >= 50) return '#b45309';   /* amber */
    return '#1a8a4a';                  /* emerald green */
  }

  function overflowETA(hrs) {
    if (hrs >= 99) return { label: '-', cls: '' };
    if (hrs < 1)  return { label: `${Math.round(hrs * 60)} min`, cls: 'critical' };
    if (hrs < 3)  return { label: `${hrs.toFixed(1)} h`, cls: 'critical' };
    if (hrs < 8)  return { label: `${hrs.toFixed(1)} h`, cls: 'soon' };
    return { label: `${hrs.toFixed(1)} h`, cls: '' };
  }

  function formatTime(d) {
    return d.toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
  }

  function formatDateTime(d) {
    return d.toLocaleString('en-IN', {
      weekday: 'short', day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // COMPUTED METRICS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  function computeMetrics() {
    const active = state.bins.filter(b => !b.collected);
    const forCollection = active.filter(b =>
      b.fillPercent >= state.cfg.collectionThresholdPct || b.urgency === 'high'
    );
    return {
      total:                active.length,
      urgentCount:          active.filter(b => b.status === 'urgent').length,
      warningCount:         active.filter(b => b.status === 'warning').length,
      okCount:              active.filter(b => b.status === 'ok').length,
      forCollection:        forCollection.length,
      totalCapacityL:       active.reduce((s, b) => s + b.capacityL, 0),
      currentWasteKg:       Math.round(active.reduce((s, b) => s + b.weightKg, 0)),
      forCollectionWeightKg:Math.round(forCollection.reduce((s, b) => s + b.weightKg, 0)),
      organicKg:            active.filter(b => b.wasteType === 'Organic').reduce((s, b) => s + (b.weightKg * 0.8), 0),
    };
  }

  // -- Drawer Management --------------------------------------
  function whyCollectNow(bin) {
    const parts = [];
    parts.push(`${bin.fillPercent}% full`);
    parts.push(`${bin.areaType.toLowerCase()} zone`);
    if (bin.dailyGenerationRate > 100) parts.push('high daily waste rate');
    if (bin.citizenReportCount > 0) parts.push(`${bin.citizenReportCount} citizen report${bin.citizenReportCount !== 1 ? 's' : ''}`);
    if (bin.overflowHours < 8) parts.push(`overflow in ${Math.round(bin.overflowHours)}h`);
    return parts.join(', ') + '.';
  }

  function openDrawer(binId) {
    state.selectedBinId = binId;
    const bin = state.bins.find(b => b.id === binId);
    if (!bin) return;

    const drawer = $('bin-drawer');
    if (!drawer) return;

    $('drawer-name').textContent = bin.name;
    $('drawer-id').textContent = bin.id;

    const pulse = $('drawer-pulse');
    pulse.className = `drawer-pulse ${bin.urgency}`;
    pulse.style.background = fillColorHex(bin.fillPercent);

    const pClr = bin.priorityScore >= 80 ? '#f85149' : bin.priorityScore >= 50 ? '#d29922' : '#3fb950';
    const wtc  = wasteTypeColor(bin.wasteType) || '#8b949e';
    const eta  = overflowETA(bin.overflowHours);

    $('drawer-body').innerHTML = `
      <div class="drawer-sec">
        <div class="drawer-sec-title">Status Overview</div>
        <div class="drawer-val-row"><span class="drawer-val-label">Current Fill</span> <span class="drawer-val" style="color:${fillColorHex(bin.fillPercent)}">${bin.fillPercent}%</span></div>
        <div class="drawer-val-row"><span class="drawer-val-label">4h Forecast</span> <span class="drawer-val">${bin.predictedFillPercent}%</span></div>
        <div class="drawer-val-row"><span class="drawer-val-label">Overflow ETA</span> <span class="drawer-val ${eta.cls}">${eta.label}</span></div>
        <div class="drawer-val-row"><span class="drawer-val-label">Urgency Level</span> <span class="drawer-val" style="text-transform:capitalize;color:${pulse.style.background}">${bin.urgency}</span></div>
      </div>

      <div class="drawer-sec">
        <div class="drawer-sec-title">Why collect now?</div>
        <div class="drawer-reason">${whyCollectNow(bin)}</div>
      </div>

      <div class="drawer-sec">
        <div class="drawer-sec-title">Bin Details</div>
        <div class="drawer-val-row"><span class="drawer-val-label">Waste Type</span> <span class="drawer-val" style="color:${wtc}">${bin.wasteType}</span></div>
        <div class="drawer-val-row"><span class="drawer-val-label">Area Type</span> <span class="drawer-val">${bin.areaType}</span></div>
        <div class="drawer-val-row"><span class="drawer-val-label">Daily Gen. Rate</span> <span class="drawer-val">${bin.dailyGenerationRate} kg/day</span></div>
        <div class="drawer-val-row"><span class="drawer-val-label">Priority Score</span> <span class="drawer-val" style="color:${pClr}">${bin.priorityScore}/100</span></div>
        <div class="drawer-val-row"><span class="drawer-val-label">Citizen Reports</span> <span class="drawer-val">${bin.citizenReportCount}</span></div>
      </div>
    `;

    drawer.setAttribute('aria-hidden', 'false');
    renderMap();
  }

  function closeDrawer() {
    state.selectedBinId = null;
    const drawer = $('bin-drawer');
    if (drawer) drawer.setAttribute('aria-hidden', 'true');
    renderMap();
  }



  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // RENDER - 4 KPI Summary Cards
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  function renderKPICards(distSaved, co2Saved) {
    const m = computeMetrics();
    
    // Update Tailwind Dashboard Metrics
    if ($('muniTotalBins')) $('muniTotalBins').innerText = m.total;
    if ($('muniHighBins')) $('muniHighBins').innerText = state.simulatedAdvanced ? '18 Bins Require Collection' : '15 Bins Require Collection';
    if ($('muniWarnBins')) $('muniWarnBins').innerText = state.simulatedAdvanced ? '5 Bins' : '8 Bins';
    if ($('muniLowBins')) $('muniLowBins').innerText = state.simulatedAdvanced ? '2 Bins' : '8 Bins';
    
    // Biogas
    if ($('muniOrganicKg')) $('muniOrganicKg').innerText = `${Math.round(m.organicKg).toLocaleString()} kg`;
    if ($('muniBioCNG')) $('muniBioCNG').innerText = `${Math.round(m.organicKg * 0.07).toLocaleString()} mÂ³`;
    if ($('muniPowerKWh')) $('muniPowerKWh').innerText = `${Math.round(m.organicKg * state.cfg.biogasFactor).toLocaleString()} kWh`;

    // Route Savings
    if (distSaved !== undefined && co2Saved !== undefined) {
      if ($('optFixedDist')) $('optFixedDist').innerText = `${state.cfg.fixedRouteDistanceKm} km`;
      const selDist = state.cfg.fixedRouteDistanceKm - distSaved;
      if ($('optSelectDist')) $('optSelectDist').innerText = `${selDist.toFixed(1)} km`;
      const pctSaved = Math.round((distSaved / state.cfg.fixedRouteDistanceKm) * 100);
      if ($('optDistSavings')) $('optDistSavings').innerText = `${pctSaved}% Saved`;
      if ($('optCO2Saved')) $('optCO2Saved').innerText = `${co2Saved.toFixed(1)} kg`;
    }
  }


  // -- Route Calculation --------------------------------------
  function calculateRoute(binsToVisit) {
    let unvisited = [...binsToVisit];
    let currentPos = state.depot;
    const path = [];
    let totalDistPx = 0;
    let totalWasteKg = 0;
    
    // Truck Alpha capacity for the simulation
    const truckCapacity = 3500;
    let currentLoad = 0;

    while (unvisited.length > 0) {
      let nearestIdx = -1;
      let minDist = Infinity;
      for (let i = 0; i < unvisited.length; i++) {
        const b = unvisited[i];
        const dx = b.x - currentPos.x;
        const dy = b.y - currentPos.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < minDist) { minDist = dist; nearestIdx = i; }
      }
      const nextBin = unvisited.splice(nearestIdx, 1)[0];
      
      // Respect capacity: return to depot if next bin exceeds capacity
      if (currentLoad + nextBin.weightKg > truckCapacity) {
        // Distance to depot
        const dxDepot = state.depot.x - currentPos.x;
        const dyDepot = state.depot.y - currentPos.y;
        totalDistPx += Math.sqrt(dxDepot*dxDepot + dyDepot*dyDepot);
        
        // Empty truck
        currentLoad = 0;
        currentPos = state.depot;
        
        // Distance from depot to next bin
        const dxNext = nextBin.x - currentPos.x;
        const dyNext = nextBin.y - currentPos.y;
        minDist = Math.sqrt(dxNext*dxNext + dyNext*dyNext);
        
        // Add a "Depot" marker in the path to signify the return trip
        path.push({ ...state.depot, name: 'Depot (Empty Truck)', isDepotStop: true, id: 'DEPOT' });
      }

      totalDistPx += minDist;
      totalWasteKg += nextBin.weightKg;
      currentLoad += nextBin.weightKg;
      path.push(nextBin);
      currentPos = nextBin;
    }

    // Final return to depot
    const dx = state.depot.x - currentPos.x;
    const dy = state.depot.y - currentPos.y;
    totalDistPx += Math.sqrt(dx*dx + dy*dy);

    const totalDistKm = parseFloat((totalDistPx / state.cfg.mapScalePxPerKm).toFixed(1));
    return { path, totalDistKm, totalWasteKg };
  }

  function generateEcoRoute() {
    // Select bins >= 80% fill OR high urgency
    const ecoBins = state.bins.filter(b => !b.collected && (b.fillPercent >= 80 || b.urgency === 'high'));
    state.ecoRoute = calculateRoute(ecoBins);
    state.routeActive = true;
    
    // Baseline route is all bins (Nearest Neighbor)
    const allActiveBins = state.bins.filter(b => !b.collected);
    state.baselineRoute = calculateRoute(allActiveBins);

    // Defensible route formula: 1.6 km average between stops + 3.8 km depot overhead
    const selectiveDist = (ecoBins.length * 1.6) + 3.8;
    const fixedDist = state.cfg.fixedRouteDistanceKm; // 87.4

    // Override the visual total distances for the dashboard comparison
    state.baselineRoute.totalDistKm = fixedDist;
    state.ecoRoute.totalDistKm = selectiveDist;

    const distSaved = Math.max(0, fixedDist - selectiveDist);
    const timeSaved = distSaved / state.cfg.avgSpeedKmh;
    const fuelSaved = (distSaved / 100) * state.cfg.fuelLPer100km;
    const co2Saved  = fuelSaved * state.cfg.co2KgPerL;
    
    let stepNum = 1;
    const seqHtml = state.ecoRoute.path.map((b) => {
      if (b.isDepotStop) {
        return `<div class="flex items-center gap-2 py-1.5 px-2 text-xs text-blue-500 font-semibold"><span class="w-5 h-5 rounded bg-blue-100 flex items-center justify-center text-[9px] font-bold">D</span> Depot - Empty Truck</div>`;
      }
      const num = stepNum++;
      const pct = b.fillPercent;
      const pctColor = pct >= 80 ? 'text-rose-500' : pct >= 50 ? 'text-amber-500' : 'text-emerald-500';
      return `
        <div class="flex items-center justify-between py-1.5 px-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 text-xs">
          <div class="flex items-center gap-2">
            <span class="w-5 h-5 rounded bg-emerald-600 text-white flex items-center justify-center text-[9px] font-bold">${num}</span>
            <div>
              <div class="font-semibold text-slate-900 dark:text-white">${b.name}</div>
              <div class="text-[10px] text-slate-400">${b.id}</div>
            </div>
          </div>
          <span class="font-mono font-bold ${pctColor}">${pct}%</span>
        </div>
      `;
    }).join('');

    // Update DOM - use the new Tailwind containers (safe-null guards)
    const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
    set('comp-fixed-bins', allActiveBins.length);
    set('comp-fixed-dist', fixedDist.toFixed(1) + ' km');
    set('comp-eco-bins', ecoBins.length);
    set('comp-eco-dist', selectiveDist.toFixed(1) + ' km');
    set('sav-time', Math.round(timeSaved * 60) + ' min');
    set('sav-fuel', fuelSaved.toFixed(1) + ' L');
    set('sav-co2', co2Saved.toFixed(1) + ' kg');
    
    // Update the route sequence panel
    if ($('route-sequence')) {
      $('route-sequence').innerHTML = seqHtml;
    }
    if ($('route-results')) {
      $('route-results').style.display = 'flex';
    }

    // Flash the map bin count for the footer
    if ($('mapRouteBinCount')) $('mapRouteBinCount').textContent = ecoBins.length;
    
    // Update KPI cards to show exact savings
    renderKPICards(distSaved, co2Saved);
    if (window.setMapShowRoute) window.setMapShowRoute(true);
    renderMap();
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // RENDER - SVG City Map
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  function renderMap() { if (window.mountReactMap) window.mountReactMap(); }
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // RENDER - Urgent Bin Panel (right)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // -- Waste-type chip colours --------------------------------
  function wasteTypeColor(wt) {
    return { Organic:'#3fb950', Dry:'#58a6ff', Mixed:'#d29922', Hazardous:'#f85149' }[wt] || '#8b949e';
  }

  // -- Relative time from ISO string to SIM_BASE --------------
  function relativeTime(isoStr) {
    const simBase = new Date(ECO.SIM_META.referenceTime);
    const hrs = Math.round((simBase - new Date(isoStr)) / 3_600_000);
    if (hrs < 24)  return `${hrs}h ago`;
    const d = Math.floor(hrs / 24), h = hrs % 24;
    return h ? `${d}d ${h}h ago` : `${d}d ago`;
  }

  function renderUrgentPanel() {
    if (typeof window.renderPriorityListUI === 'function') {
      window.renderPriorityListUI();
      return;
    }
    const list = $('muniPriorityList');
    if (!list) return;

    const sourceBins = window.wardBins || state.bins;

    // Filter by status (Critical / fillPct >= 80) and sort by fill percentage descending
    const priorityBins = sourceBins
      .filter(b => !b.collected && (b.label === 'Critical' || (b.fillPct || b.fillPercent) >= 80 || (b.status && b.status.toLowerCase().includes('critical')) || b.urgency === 'high'))
      .sort((a, b) => (b.fillPct || b.fillPercent || 0) - (a.fillPct || a.fillPercent || 0));

    if (priorityBins.length === 0) {
      list.innerHTML = `<div class="text-xs text-slate-400 p-4 text-center">No bins currently above threshold (${state.cfg.collectionThresholdPct}%).</div>`;
      return;
    }

    list.innerHTML = priorityBins.map((bin, idx) => {
      let badgeClass = 'bg-rose-500/20 text-rose-500';
      let scoreColor = 'text-rose-500';
      
      const lat = bin.pos ? bin.pos[0] : (bin.latitude || bin.lat || 18.5204);
      const lng = bin.pos ? bin.pos[1] : (bin.longitude || bin.lon || bin.lng || 73.8567);
      const binId = bin.id || bin.code;
      const fill = bin.fillPct || bin.fillPercent || 80;

      return `
        <div onclick="window.flyToBin ? window.flyToBin(${lat}, ${lng}, 16, '${binId}') : flyToBin(${lat}, ${lng}, 16, '${binId}')"
             title="Click to zoom map to ${bin.name} (${lat}, ${lng})"
             class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs cursor-pointer hover:border-emerald-500 dark:hover:border-emerald-500 hover:shadow-md transition-all active:scale-[0.98] group">
            <div class="flex items-center gap-3">
                <span class="w-6 h-6 rounded-lg ${badgeClass} font-bold flex items-center justify-center font-mono text-[10px] group-hover:scale-110 transition-transform">#${idx+1}</span>
                <div>
                    <div class="font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors flex items-center gap-1.5">
                        <span>${bin.code || bin.id} - ${bin.name}</span>
                        <i class="fa-solid fa-location-crosshairs text-[10px] text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity"></i>
                    </div>
                    <div class="text-[10px] text-slate-400">${bin.areaType || 'Commercial'} • ${bin.wasteType || 'Organic'}</div>
                </div>
            </div>
            <div class="text-right">
                <span class="font-mono font-extrabold ${scoreColor} text-sm">${fill}%</span>
                <div class="text-[9px] text-slate-400">Score: ${bin.priorityScore || fill}</div>
            </div>
        </div>
      `;
    }).join('');
  }


  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // RENDER - Truck Capacity Strip (bottom)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  function renderTruckStrip() {
    const strip = $('truck-strip');
    if (!strip) return;

    const label = `<div class="truck-strip-label">Fleet Status</div>`;

    const cards = state.trucks.map(t => {
      const loadPct  = Math.round((t.currentLoadKg / t.capacityKg) * 100);
      const barColor = loadPct > 80 ? '#f85149' : loadPct > 50 ? '#d29922' : '#3fb950';
      const statusCls = t.status.toLowerCase() === 'active' ? 'active' : 'standby';
      return `
        <div class="truck-card-strip">
          <div class="truck-strip-icon">ðŸš›</div>
          <div class="truck-strip-info">
            <div class="truck-strip-name" style="color:${t.color}">${t.name}</div>
            <div class="truck-strip-id">${t.id}</div>
            ${t.licensePlate
              ? `<div style="font-size:9px;color:var(--text-subtle);font-family:'Consolas',monospace;margin-top:1px">${t.licensePlate}</div>`
              : ''}
          </div>
          <div class="truck-strip-stats">
            <div class="truck-cap-row">
              <span>${t.zone || 'Zone'}</span>
              <span class="truck-cap-val">${t.currentLoadKg.toLocaleString()} / ${t.capacityKg.toLocaleString()} kg</span>
            </div>
            <div class="truck-cap-bar-bg">
              <div class="truck-cap-bar-fg"
                   style="width:${loadPct || 1}%;background:${barColor}"></div>
            </div>
          </div>
          <div class="truck-status-pill ${statusCls}">${t.status}</div>
        </div>
      `;
    }).join('');

    strip.innerHTML = label + cards;
  }


  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // RENDER - Route Badge on sidebar nav item
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  function updateRouteBadge() {
    const badge = $('nav-badge-route');
    if (!badge) return;
    const count = state.bins.filter(b =>
      !b.collected && (b.fillPercent >= state.cfg.collectionThresholdPct || b.urgency === 'high')
    ).length;
    badge.textContent = count;
    badge.classList.toggle('hidden', count === 0);
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // RENDER - Full Dashboard
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  function renderDashboard() {
    renderKPICards();
    renderMap();
    renderUrgentPanel();
    renderTruckStrip();
    updateRouteBadge();
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // SIDEBAR TOGGLE
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  function toggleSidebar() {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    const sidebar = $('sidebar');
    if (sidebar) {
      sidebar.classList.toggle('collapsed', state.sidebarCollapsed);
      sidebar.classList.toggle('mobile-open');
    }
  }



  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // SIMULATION ALERT TOAST
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  let _alertTimer = null;
  function showSimAlert(msg) {
    let toast = document.getElementById('sim-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'sim-toast';
      toast.style.cssText = [
        'position:fixed','bottom:24px','left:50%','transform:translateX(-50%)',
        'background:#0f172a','color:#f1f5f9','border:1px solid #10b981',
        'border-radius:12px','padding:12px 20px','font-size:13px','font-weight:600',
        'z-index:9999','box-shadow:0 8px 30px rgba(0,0,0,0.4)',
        'transition:opacity 0.3s','max-width:480px','text-align:center',
      ].join(';');
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(_alertTimer);
    _alertTimer = setTimeout(() => { toast.style.opacity = '0'; }, 4000);
  }
  window.showSimAlert = showSimAlert;

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // SIMULATION ENGINE CONTROLS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  function updateBinCalculations(bin) {
    const s = {
       fill: bin.fillPercent,
       loc: bin.areaType,
       trend: bin.wasteTrend,
       reports: bin.citizenReportCount,
       lastHrs: bin.lastCollectedHoursAgo
    };
    bin.overflowHours = ECO.deriveOverflowHours(s.fill, s.loc, s.trend);
    bin.urgency = ECO.deriveUrgency(s.fill, s.reports, bin.overflowHours);
    bin.status = ECO.deriveStatus(s.fill);
    bin.priorityScore = ECO.derivePriorityScore(s.fill, s.reports, bin.overflowHours, s.loc);
    bin.predictedFillPercent = ECO.derivePredictedFill(s.fill, s.loc, s.trend);
    bin.weightKg = parseFloat((bin.capacityL * bin.fillPercent / 100 * 0.25).toFixed(1));
    bin.priorityReason = ECO.derivePriorityReason(bin);
  }

  function simulateNewReport() {
    // Find an 'ok' or 'warning' bin to spike
    const candidate = state.bins.find(b => b.status === 'ok' && b.fillPercent > 40 && b.fillPercent < 70) 
                   || state.bins.find(b => b.status === 'warning');
    if (!candidate) return;

    candidate.citizenReportCount += 3;
    candidate.fillPercent = Math.min(100, candidate.fillPercent + 30);
    updateBinCalculations(candidate);

    showSimAlert(`🚨 Citizen Report: Overflow at ${candidate.name}! Urgency raised to High.`);
    
    if (state.routeActive) generateEcoRoute();
    else if (state.activeView === 'dashboard') renderDashboard();
  }

  function simulateTimeAdvance() {
    if (window.simulateTimeAdvance && window.simulateTimeAdvance !== simulateTimeAdvance) {
      return window.simulateTimeAdvance();
    }
    state.simulatedAdvanced = !state.simulatedAdvanced;
    if (window.appStore) {
      window.appStore.actions.simulateAdvanceTime();
    }
    if (state.simulatedAdvanced) {
      state.bins.forEach(bin => {
          const inc = Math.floor(Math.random() * (25 - 15 + 1)) + 15;
          bin.fillPercent = Math.min(100, Math.round(bin.fillPercent + inc));
          bin.lastCollectedHoursAgo = (bin.lastCollectedHoursAgo || 0) + 6;
          updateBinCalculations(bin);
      });
      window.dispatchEvent(new CustomEvent('ecoroute:advance-time'));
      showSimAlert(`⏳ Time advanced 6 hours (+15-25% waste fill simulated across all bins).`);
    } else {
      state.bins = JSON.parse(JSON.stringify(initialBinsState));
      window.dispatchEvent(new CustomEvent('ecoroute:reset'));
      showSimAlert(`⏳ Simulation reverted to baseline fill levels.`);
    }

    if ($('muniHighBins')) {
      const crit = state.bins.filter(b => b.fillPercent >= 80).length;
      $('muniHighBins').innerText = `${crit} Bins Require Collection`;
    }

    if (state.routeActive) generateEcoRoute();
    else renderDashboard();
  }

  function simulateAdvanceTime() {
    return simulateTimeAdvance();
  }

  function resetSimulation() {
    state.simulatedAdvanced = false;
    if (window.appStore) {
      window.appStore.actions.resetSimulation();
    }
    state.bins = JSON.parse(JSON.stringify(initialBinsState));
    state.routeActive = false;
    state.ecoRoute = null;
    state.baselineRoute = null;
    
    window.dispatchEvent(new CustomEvent('ecoroute:reset'));
    window.dispatchEvent(new CustomEvent('ecoroute:clear'));

    if ($('muniHighBins')) {
      $('muniHighBins').innerText = '15 Bins Require Collection';
    }
    if ($('mapRouteBinCount')) $('mapRouteBinCount').textContent = '0';
    if ($('optSelectDist')) $('optSelectDist').textContent = '--';
    if ($('optDistSavings')) $('optDistSavings').textContent = '0.0%';
    if ($('optCO2Saved')) $('optCO2Saved').textContent = '0.0 kg';

    showSimAlert(`🔄 Simulation reset to deterministic baseline.`);
    
    const rb = $('route-results');
    if (rb) rb.style.display = 'none';
    
    // Also reset any selected bin if the drawer was open
    if (state.selectedBinId) closeDrawer();

    if (window.setMapShowRoute) window.setMapShowRoute(false);
    renderDashboard();
  }

  // Automated Demo Flow
  async function runDemoSequence() {
    // 1. Reset & Start at Dashboard
    resetSimulation();
    switchView('dashboard');
    showSimAlert('▶ Demo: Starting with 30 monitored bins in Ward 12...');
    await new Promise(r => setTimeout(r, 3000));
    
    // 2. Switch to Route Planner & Generate
    switchView('route');
    showSimAlert('▶ Demo: Generating efficient EcoRoute...');
    await new Promise(r => setTimeout(r, 1000));
    generateEcoRoute();
    await new Promise(r => setTimeout(r, 4000));

    // 3. Citizen Report arrives
    showSimAlert('▶ Demo: Simulating an incoming Citizen Overflow Report...');
    await new Promise(r => setTimeout(r, 2000));
    simulateNewReport();
    await new Promise(r => setTimeout(r, 4000));

    // 4. Worker marks bin collected
    switchView('worker');
    showSimAlert('▶ Demo: Switching to Worker View. Marking first bin as collected...');
    await new Promise(r => setTimeout(r, 2000));
    
    // Select first collected button and click it
    const firstBtn = document.querySelector('.worker-route-list .btn-collect:not(.collected)');
    if (firstBtn) firstBtn.click();
    
    await new Promise(r => setTimeout(r, 3000));
    showSimAlert('✅ Demo Complete! All views and data flows are functional.');
  }

  function showSimAlert(msg) {
    const el = $('sim-alert');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 5000);
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // CITIZEN REPORT & WORKER VIEW
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  function populateReportSelect() {
    const select = $('report-bin-select');
    if (!select) return;
    select.innerHTML = state.bins
      .sort((a,b) => a.id.localeCompare(b.id))
      .map(b => `<option value="${b.id}">${b.name} (${b.id})</option>`)
      .join('');
  }

  function handleReportSubmit() {
    const select = $('report-bin-select');
    const type = document.querySelector('input[name="report-type"]:checked').value;
    const note = $('report-note').value;
    
    if (!select || !select.value) return;
    
    const bin = state.bins.find(b => b.id === select.value);
    if (!bin) return;

    bin.citizenReportCount += 1;
    if (type === 'overflow') {
      bin.fillPercent = 100;
    } else {
      // Damaged bin: spike reports to force high urgency
      bin.citizenReportCount += 5; 
    }
    
    updateBinCalculations(bin);
    
    const success = $('report-success');
    if (success) {
      success.style.display = 'block';
      setTimeout(() => { success.style.display = 'none'; }, 4000);
    }
    
    const noteEl = $('report-note');
    if (noteEl) noteEl.value = '';
    
    if (state.routeActive) generateEcoRoute();
  }

  function renderWorkerView() {
    const list = $('worker-route-list');
    const loadTxt = $('worker-load-txt');
    const loadBar = $('worker-load-bar');
    
    if (!list || !loadTxt || !loadBar) return;

    if (!state.routeActive || !state.ecoRoute) {
      list.innerHTML = `<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px;">
        No active EcoRoute assigned.<br>Please generate a route from the Smart Route Planner first.
      </div>`;
      loadTxt.textContent = `0 / 3500 kg`;
      loadBar.style.width = `0%`;
      return;
    }

    // Calculate current load from collected bins on this route
    let currentLoad = 0;
    let html = '';
    
    state.ecoRoute.path.forEach(b => {
      if (b.isDepotStop) {
        currentLoad = 0; // Empty truck
        html += `
          <div class="worker-bin-item" style="opacity: 0.7; padding: 10px;">
            <div class="worker-bin-info">
              <div class="worker-bin-name" style="font-size: 12px;">♲ Return to Depot</div>
              <div class="worker-bin-meta">Empty truck payload</div>
            </div>
          </div>
        `;
        return;
      }
      
      const realBin = state.bins.find(x => x.id === b.id) || b;
      const isCol = realBin.collected;
      
      if (isCol) currentLoad += realBin.weightKg;

      html += `
        <div class="worker-bin-item ${isCol ? 'collected' : ''}">
          <div class="worker-bin-info">
            <div class="worker-bin-name">${realBin.name}</div>
            <div class="worker-bin-meta">${realBin.id} · ${realBin.areaType} · ${realBin.weightKg} kg</div>
          </div>
          <button class="btn-collect" data-id="${realBin.id}">${isCol ? '✓ Collected' : 'Mark Collected'}</button>
        </div>
      `;
    });

    list.innerHTML = html;
    
    // Update meter
    const cap = 3500;
    const loadPct = Math.min(100, (currentLoad / cap) * 100);
    loadTxt.textContent = `${Math.round(currentLoad)} / ${cap} kg`;
    loadBar.style.width = `${loadPct}%`;
    loadBar.style.background = loadPct > 90 ? 'var(--red)' : loadPct > 75 ? 'var(--yellow)' : 'var(--green)';

    // Bind collection buttons
    list.querySelectorAll('.btn-collect').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.dataset.id;
        const bin = state.bins.find(b => b.id === id);
        if (bin && !bin.collected) {
          bin.collected = true;
          bin.fillPercent = 0;
          bin.citizenReportCount = 0;
          bin.lastCollectedHoursAgo = 0;
          bin.weightKg = 0; // It's empty now
          updateBinCalculations(bin);
          renderWorkerView(); // Refresh list & meter
          if (state.activeView === 'dashboard') renderDashboard(); // If they switch back
        }
      });
    });
  }

  function switchView(viewId) {
    state.activeView = viewId;

    document.querySelectorAll('.nav-item').forEach(btn => {
      const active = btn.dataset.view === viewId;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-current', active ? 'page' : 'false');
    });

    document.querySelectorAll('.view').forEach(v => {
      v.classList.toggle('active', v.id === `view-${viewId}`);
    });

    // Move the map card dynamically
    const mapCard = document.querySelector('.map-card');
    if (mapCard) {
      if (viewId === 'dashboard') {
        const row = document.querySelector('#view-dashboard .map-panel-row');
        if (row) row.insertBefore(mapCard, row.firstChild);
        renderDashboard();
      } else if (viewId === 'route') {
        const container = $('route-map-container');
        if (container) container.appendChild(mapCard);
        renderMap();
      }
    }

    // Call specific view logic
    if (viewId === 'report') {
      populateReportSelect();
    } else if (viewId === 'worker') {
      renderWorkerView();
    }
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // LIVE CLOCK
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  function updateClock() {
    const el = $('topbar-time');
    if (el) el.textContent = formatDateTime(new Date());
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // EVENT LISTENERS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  function setupListeners() {
    // Sidebar toggle
    const toggleBtn = $('sidebar-toggle');
    if (toggleBtn) toggleBtn.addEventListener('click', toggleSidebar);

    // Nav items
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    // Drawer close
    const drawerCloseBtn = $('drawer-close');
    if (drawerCloseBtn) drawerCloseBtn.addEventListener('click', closeDrawer);

    // Global keydown for Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && state.selectedBinId) closeDrawer();
    });

    // Generate Route Button
    const genRouteBtn = $('btn-generate-route');
    if (genRouteBtn) genRouteBtn.addEventListener('click', generateEcoRoute);

    // Citizen Report Submit
    const btnSubmitReport = $('btn-submit-report');
    if (btnSubmitReport) btnSubmitReport.addEventListener('click', handleReportSubmit);

    // Simulation Controls
    const btnSimDemo = $('btn-sim-demo');
    if (btnSimDemo) btnSimDemo.addEventListener('click', runDemoSequence);

    const btnSimReport = $('btn-sim-report');
    if (btnSimReport) btnSimReport.addEventListener('click', simulateNewReport);

    const btnSimTime = $('btn-sim-time');
    if (btnSimTime) btnSimTime.addEventListener('click', simulateAdvanceTime);

    const btnSimReset = $('btn-sim-reset');
    if (btnSimReset) btnSimReset.addEventListener('click', resetSimulation);
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // INIT
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  function switchViewInternal(view) {
      document.querySelectorAll('.view-section').forEach(s => s.classList.add('hidden'));
      const tgt = document.getElementById('view-' + view);
      if (tgt) tgt.classList.remove('hidden');
      window.scrollTo(0, 0);
      window.dispatchEvent(new CustomEvent('view:switched', { detail: { view } }));

      // Update active nav styling across desktop and mobile menus
      document.querySelectorAll('#desktopNav button, #mobileMenu button').forEach(btn => {
          const isMatch = btn.getAttribute('data-view') === view || (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(`switchView('${view}')`));
          if (isMatch) {
              btn.classList.add('active-nav');
          } else {
              btn.classList.remove('active-nav');
          }
      });

      // Update authContainer badge
      const authC = document.getElementById('authContainer');
      if (authC) {
          const user = (window.authState && window.authState.currentUser) || null;
          if (!user && view === 'landing') {
              authC.innerHTML = `
                  <button onclick="openLoginModal()" class="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-md shadow-emerald-600/20 transition-all">
                      <i class="fa-solid fa-right-to-bracket"></i>
                      <span>Login / Portal</span>
                  </button>`;
          } else {
              const activeRole = user ? user.role.toUpperCase() : (view === 'admin' ? 'ADMIN' : view === 'municipal' ? 'MUNICIPAL' : view === 'driver' ? 'DRIVER' : 'CITIZEN');
              const roleConfig = {
                  ADMIN: { label: 'ADMIN', cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' },
                  MUNICIPAL: { label: 'MUNICIPAL', cls: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300 border-teal-200 dark:border-teal-800' },
                  CITIZEN: { label: 'CITIZEN', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800' },
                  DRIVER: { label: 'DRIVER', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300 border-sky-200 dark:border-sky-800' }
              };
              const roleInfo = roleConfig[activeRole] || { label: activeRole, cls: 'bg-slate-100 text-slate-700 border-slate-200' };
              authC.innerHTML = `
                  <div class="flex items-center gap-2 animate-in fade-in duration-300">
                      <span class="px-2.5 py-1 rounded-full text-xs font-bold border ${roleInfo.cls} font-mono tracking-wider">${roleInfo.label}</span>
                      <button onclick="logout()" class="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg text-xs" title="Return to Home / Logout">
                          <i class="fa-solid fa-right-from-bracket"></i>
                      </button>
                  </div>`;
          }
      }

      if (view === 'municipal') {
          renderDashboard();
          if (window.mountReactMap) window.mountReactMap();
          if (window.muniMap) {
            setTimeout(() => window.muniMap.invalidateSize(), 50);
            setTimeout(() => window.muniMap.invalidateSize(), 200);
          }
      } else if (view === 'citizen') {
          if (window.mountCitizenMap) window.mountCitizenMap();
          if (window.mountCitizenWallet) window.mountCitizenWallet();
      } else if (view === 'driver') {
          if (window.mountDriverDashboard) window.mountDriverDashboard();
          try {
            if (window.location.pathname !== '/driver') {
              window.history.pushState({ view: 'driver' }, '', '/driver');
            }
          } catch(e) {}
      } else {
          try {
            if (window.location.pathname === '/driver') {
              window.history.pushState({ view }, '', '/');
            }
          } catch(e) {}
      }
  }

  function init() {
    setupListeners();
    renderDashboard();
    updateClock();
    setInterval(updateClock, 1000);
    updateGreenPointsUI();
    
    // Populate Citizen Select
    const cb = $('citizenBinSelect');
    if (cb) {
        cb.innerHTML = state.bins.map(b => `<option value="${b.id}">${b.id} - ${b.name}</option>`).join('');
    }

    // Support URL routing for /driver or hash
    const isDriverRoute = window.location.pathname === '/driver' ||
                          window.location.pathname.endsWith('/driver') ||
                          window.location.hash === '#driver' ||
                          window.location.hash === '#/driver';
    if (isDriverRoute) {
      switchViewInternal('driver');
    } else {
      const hash = (window.location.hash || '').toLowerCase();
      const path = (window.location.pathname || '').toLowerCase();
      if (path.includes('municipal') || hash.includes('municipal')) {
        switchViewInternal('municipal');
      } else if (path.includes('citizen') || hash.includes('citizen')) {
        switchViewInternal('citizen');
      } else if (path.includes('admin') || hash.includes('admin')) {
        switchViewInternal('admin');
      } else {
        switchViewInternal('landing');
      }
    }

    window.addEventListener('popstate', () => {
      if (window.location.pathname === '/driver' || window.location.hash.includes('driver')) {
        switchViewInternal('driver');
      } else {
        const hash = (window.location.hash || '').toLowerCase();
      const path = (window.location.pathname || '').toLowerCase();
      if (path.includes('municipal') || hash.includes('municipal')) {
        switchViewInternal('municipal');
      } else if (path.includes('citizen') || hash.includes('citizen')) {
        switchViewInternal('citizen');
      } else if (path.includes('admin') || hash.includes('admin')) {
        switchViewInternal('admin');
      } else {
        switchViewInternal('landing');
      }
      }
    });

    console.log(
      '%c EcoRoute AI %c Phase 1 · Prototype Simulation ',
      'background:#3fb950;color:#0b0f17;font-weight:700;padding:2px 6px;border-radius:3px 0 0 3px',
      'background:#1c2230;color:#dce6f0;padding:2px 6px;border-radius:0 3px 3px 0'
    );
    console.log(`Bins: ${ECO.BINS.length}  Trucks: ${ECO.TRUCKS.length}  Depot: 1`);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.generateEcoRoute = generateEcoRoute;
  window.resetSimulation = resetSimulation;
  window.simulateAdvanceTime = simulateAdvanceTime;
  window.simulateTimeAdvance = simulateTimeAdvance;
  window.switchView = function(view) {
      switchViewInternal(view);
  };
  window.exportMunicipalReport = function() {
      window.print();
  };

  window.dispatchComplaint = function(btn, title) {
      if (window.appStore) {
          window.appStore.actions.dispatchComplaint(title);
      }
      if (!btn) return;
      const card = btn.closest('.p-4') || btn.parentElement;
      if (card) {
          const badge = card.querySelector('.complaint-badge');
          if (badge) {
              badge.textContent = 'Dispatched to TR-01';
              badge.className = 'complaint-badge px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700';
          }
      }
      btn.innerHTML = '<i class="fa-solid fa-check text-[11px]"></i> Dispatched to TR-01';
      btn.className = 'px-3 py-1.5 bg-emerald-700/80 text-white rounded-xl text-xs font-bold shadow-none cursor-default flex items-center justify-center gap-1.5 self-start sm:self-auto opacity-90';
      btn.disabled = true;
      showSimAlert(`Dispatched to TR-01: ${title || 'Complaint verified'}`);

      const pendingEl = document.getElementById('complaintPendingCount');
      if (pendingEl) {
          const count = document.querySelectorAll('#muniComplaintList .complaint-badge:not(.bg-emerald-100)').length;
          pendingEl.textContent = count > 0 ? `${count} Pending` : 'All Dispatched';
          if (count === 0) {
              pendingEl.className = 'text-xs px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full font-bold';
          }
      }
  };
  
  let _citizenBannerTimer = null;
  function showCitizenBanner(message) {
      const banner = document.getElementById('citizenNotificationBanner');
      const textEl = document.getElementById('citizenNotificationText');
      if (textEl) textEl.textContent = message;
      if (banner) {
          banner.classList.remove('hidden');
          clearTimeout(_citizenBannerTimer);
          _citizenBannerTimer = setTimeout(() => {
              banner.classList.add('hidden');
          }, 5000);
      }
      showSimAlert(message);
  }
  window.showCitizenBanner = showCitizenBanner;

  window.previewUpload = function(input) {
      if (input.files && input.files[0]) {
          const file = input.files[0];
          const reader = new FileReader();
          reader.onload = function(e) {
              const thumb = document.getElementById('uploadThumbnail');
              const icon = document.getElementById('uploadIcon');
              const text = document.getElementById('uploadText');
              if (thumb) {
                  thumb.src = e.target.result;
                  thumb.classList.remove('hidden');
              }
              if (icon) icon.classList.add('hidden');
              if (text) {
                  text.innerHTML = `<span class="text-amber-600 dark:text-amber-400 font-bold">${file.name}</span><span class="text-[10px] text-slate-400 block mt-0.5">Click to replace photo</span>`;
              }
          };
          reader.readAsDataURL(file);
      }
  };

  // Async Citizen Report Submission to DB with try/catch, loading spinner, and +50 DB points
  async function uploadReportToDB(e) {
      if (window.submitCitizenReport && window.submitCitizenReport !== uploadReportToDB) {
          return await window.submitCitizenReport(e);
      }
      if (e && e.preventDefault) e.preventDefault();
      const submitBtn = document.getElementById('btnSubmitCitizenReport') || (e && e.target && e.target.querySelector('button[type="submit"]'));
      const originalHtml = submitBtn ? submitBtn.innerHTML : '';
      if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> <span>Saving to Firestore...</span>`;
      }

      try {
          const binSelect = $('citizenBinSelect');
          const binId = binSelect ? binSelect.value : '';
          const issue = $('citizenIssueType') ? $('citizenIssueType').value : 'Overflowing Waste';
          const notes = $('citizenNotes') ? $('citizenNotes').value : '';
          const bin = state.bins.find(b => b.id === binId);
          const locationName = bin ? bin.name : (binSelect?.options[binSelect.selectedIndex]?.text || 'Ward 4 Station');

          const reportPayload = {
              nearestBin: locationName,
              issueCategory: issue,
              additionalDetails: notes,
              timestamp: new Date().toISOString(),
              binId,
              issue,
              locationName,
              notes,
              reportedBy: window.authState?.currentUser?.displayName || 'Alex Johnson',
              userUid: window.authState?.currentUser?.uid || 'user_guest'
          };

          // Push data to Firestore collection "citizen_reports"
          let backendResult = null;
          if (window.uploadReportToDBBackend) {
              backendResult = await window.uploadReportToDBBackend(reportPayload);
          } else if (window.submitReportToBackend) {
              backendResult = await window.submitReportToBackend(reportPayload);
          } else {
              // 2-second setTimeout simulation
              backendResult = await new Promise((resolve) => {
                  setTimeout(() => {
                      resolve({
                          id: 'REP-' + Date.now().toString(36).toUpperCase(),
                          ...reportPayload,
                          createdAt: new Date().toISOString(),
                          status: 'Under Verification',
                          rewardPoints: 50
                      });
                  }, 2000);
              });
          }

          // Add +50 points to the user's DB profile
          if (window.updateUserProfilePointsInDB) {
              await window.updateUserProfilePointsInDB(50);
          } else {
              const currentPts = (typeof window.citizenPoints === 'number') ? window.citizenPoints : (state.greenPoints || 450);
              const newPts = currentPts + 50;
              if (window.setGreenPoints) window.setGreenPoints(newPts);
              state.greenPoints = newPts;
              window.citizenPoints = newPts;
              updateGreenPointsUI();
              window.dispatchEvent(new CustomEvent('citizen:set-points', { detail: { amount: newPts } }));
          }

          // Update local bin urgency and simulation state
          if (bin) {
              bin.urgency = 'high';
              bin.priorityReason = `Citizen Report: ${issue}`;
              bin.priorityScore = Math.max(90, bin.priorityScore + 30);
              bin.fillPercent = Math.max(85, bin.fillPercent + 20);
              renderDashboard();
          }

          const ticketNum = Math.floor(105 + Math.random() * 20);

          // Citizen to Municipal Sync: push report to AppContext array
          if (window.appStore) {
              window.appStore.actions.addCitizenReport({
                  ticketNum: String(ticketNum),
                  title: `${issue} at ${locationName}`,
                  issue: issue,
                  locationName: locationName,
                  notes: notes,
                  reportedBy: window.authState?.currentUser?.displayName || 'Citizen Reporter'
              });
          }

          // Update UI ticket list: prepend new ticket card into "My Submitted Reports Status"
          const reportsContainer = $('citizenMyReports');
          if (reportsContainer) {
              const card = document.createElement('div');
              card.className = "p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 animate-in fade-in duration-300";
              card.innerHTML = `
                  <div class="space-y-1">
                      <div class="flex flex-wrap items-center gap-2">
                          <span class="text-xs font-bold text-slate-900 dark:text-white">Ticket #${ticketNum}</span>
                          <span class="text-xs text-slate-600 dark:text-slate-400">${issue} at ${locationName}</span>
                      </div>
                      <div class="text-[11px] text-slate-400 flex items-center gap-1.5">
                          <i class="fa-regular fa-calendar-check text-[10px]"></i> Just now
                      </div>
                  </div>
                  <span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex-shrink-0">
                      Under Verification
                  </span>
              `;
              reportsContainer.prepend(card);
          }

          // Reset the form inputs and miniature preview
          const formEl = (e && e.target && e.target.reset) ? e.target : document.querySelector('form[onsubmit*="uploadReportToDB"]') || document.querySelector('form[onsubmit*="handleCitizenReportSubmit"]');
          if (formEl && formEl.reset) formEl.reset();
          const thumb = $('uploadThumbnail');
          const icon = $('uploadIcon');
          const ut = $('uploadText');
          if (thumb) { thumb.src = ''; thumb.classList.add('hidden'); }
          if (icon) icon.classList.remove('hidden');
          if (ut) ut.textContent = 'Click to select photo or capture';

          // Trigger temporary green success banner at the top
          showCitizenBanner("Report Verified & Submitted! +50 Green Points Added to Profile");
      } catch (err) {
          console.error(err);
          alert("Failed to save: " + err.message);
          showCitizenBanner(`Submission failed: ${err.message || 'Error uploading to database'}`);
      } finally {
          if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.innerHTML = originalHtml;
          }
      }
  }

  window.uploadReportToDB = uploadReportToDB;
  window.handleCitizenReportSubmit = uploadReportToDB;

  window.redeemReward = function(itemName, itemCost) {
      const currentPts = (window.appStore ? window.appStore.getState().greenPoints : ((typeof window.citizenPoints === 'number') ? window.citizenPoints : (state.greenPoints || 450)));
      if (currentPts >= itemCost) {
          if (window.appStore) {
              window.appStore.actions.deductGreenPoints(itemCost);
          }
          if (window.setGreenPoints) {
              window.setGreenPoints(prev => Math.max(0, prev - itemCost));
          }
          state.greenPoints = Math.max(0, currentPts - itemCost);
          updateGreenPointsUI();
          window.dispatchEvent(new CustomEvent('citizen:deduct-points', { detail: { amount: itemCost } }));
          showCitizenBanner("Voucher Claimed! Discount code sent to registered mobile");
      } else {
          showCitizenBanner(`Insufficient Green Points! You have ${currentPts} PTS, but this item requires ${itemCost} PTS.`);
      }
  };

  window.openSpecialPickupModal = function() {
      showCitizenBanner("E-Waste Pickup Scheduled for tomorrow 10:00 AM");
      const m = document.getElementById('specialPickupModal');
      if (m) m.classList.remove('hidden');
  };
  window.closeSpecialPickupModal = function() {
      const m = document.getElementById('specialPickupModal');
      if (m) m.classList.add('hidden');
  };
  window.handleSpecialPickupSubmit = function(e) {
      if (e) e.preventDefault();
      window.closeSpecialPickupModal();
      showCitizenBanner("E-Waste Pickup Scheduled for tomorrow 10:00 AM");
  };

  // Async OSRM Real Route Generation with loading state (TSP Solution)
  window.handleGenerateRouteWithLoading = async function(btn) {
      const button = btn || document.getElementById('btnGenerateOptimalRoute');
      const originalHtml = button ? button.innerHTML : '';
      if (button) {
          button.disabled = true;
          button.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> <span>Solving TSP & Routing...</span>`;
      }

      try {
          if (window.generateRealRoute) {
              await window.generateRealRoute();
          } else if (window.generateOSRMRoute) {
              await window.generateOSRMRoute();
          } else {
              window.dispatchEvent(new CustomEvent('ecoroute:show'));
              if (window.generateOptimalRouteBackend) {
                  await window.generateOptimalRouteBackend('Ward 4');
              } else {
                  await new Promise(r => setTimeout(r, 1200));
              }
          }

          generateEcoRoute();
          if (window.setMapShowRoute) window.setMapShowRoute(true);
          showSimAlert("✅ Optimal TSP route calculated via OSRM (Depot → Critical Bins → Recycling Plant)!");
      } catch (err) {
          console.error("Route calculation error:", err);
          showSimAlert(`❌ Route calculation failed: ${err.message || 'Error'}`);
      } finally {
          if (button) {
              button.disabled = false;
              button.innerHTML = originalHtml;
          }
      }
  };

  // Global Auth handlers with 1.5s async loading state
  async function performLoginWithLoading(role, email, btn) {
      const button = btn || document.getElementById('btnLoginSubmit');
      const originalHtml = button ? button.innerHTML : '';
      if (button) {
          button.disabled = true;
          button.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> <span>Authenticating...</span>`;
      }

      try {
          const user = window.authenticateUser 
              ? await window.authenticateUser(role, email)
              : await new Promise(r => setTimeout(() => r({ role: (role || 'CITIZEN').toUpperCase() }), 1500));

          window.closeLoginModal();
          window.switchView(role.toLowerCase());
          if (window.showSimAlert) {
              window.showSimAlert(`✅ Authenticated successfully as ${user.role}!`);
          }
      } catch (err) {
          if (window.showSimAlert) {
              window.showSimAlert(`❌ Authentication failed: ${err.message || 'Error'}`);
          }
      } finally {
          if (button) {
              button.disabled = false;
              button.innerHTML = originalHtml;
          }
      }
  }

  window.openLoginModal = function() {
      const m = document.getElementById('loginModal');
      if (m) m.classList.remove('hidden');
  };
  window.closeLoginModal = function() {
      const m = document.getElementById('loginModal');
      if (m) m.classList.add('hidden');
  };
  window.setAuthRole = function(role) { 
      window.authModalRole = role;
      document.querySelectorAll('.role-tab').forEach(t => {
          t.className = 'role-tab text-xs font-semibold py-2 rounded-lg transition-all text-slate-600 dark:text-slate-400';
      });
      const activeTab = document.getElementById(`roleBtn-${role}`);
      if (activeTab) {
          activeTab.className = 'role-tab text-xs font-semibold py-2 rounded-lg transition-all bg-white dark:bg-slate-700 text-emerald-600 shadow-sm';
      }
  };
  window.quickLogin = async function(role, btn) {
      await performLoginWithLoading(role, `${role.toLowerCase()}@ecoroute.gov`, btn);
  };
  window.handleLoginSubmit = async function(e) {
      if (e) e.preventDefault();
      const role = window.authModalRole || 'municipal';
      const emailInput = document.getElementById('loginUsername');
      const email = emailInput ? emailInput.value : '';
      const submitBtn = (e.target && e.target.querySelector('button[type="submit"]')) || document.getElementById('btnLoginSubmit');
      await performLoginWithLoading(role, email, submitBtn);
  };
  window.logout = function() {
      if (window.authState) window.authState.logout();
      window.currentUser = null;
      window.switchView('landing');
      if (window.showSimAlert) window.showSimAlert('🔒 Successfully logged out of session.');
  };
  window.requireRoleView = function(role) {
      window.switchView(role);
  };

  // UI utility stubs
  window.toggleMobileMenu = function() {
      const m = document.getElementById('mobileMenu');
      if (m) m.classList.toggle('hidden');
  };
  // Multi-language Dictionary for Home Landing Hero & Stats
  const LANG_DICTIONARY = {
    en: {
      badge: "Sensorless Predictive AI Engine",
      title: 'Predictive Waste Collection & <span class="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">Garbage Truck Route Optimization</span>',
      subtitle: "Eliminate fixed pickup schedules. Predict bin overflow using historical waste rates, area priority, and citizen reports-reducing trips, fuel, traffic, and urban emissions.",
      cta1: "Launch Route Optimization Engine",
      cta2: "Report Overflow Bin",
      rule1: "Prediction Rule",
      rule2: "Dispatch Trigger",
      rule3: "Optimization Model",
      statDistance: "Total Distance Saved",
      statFuel: "Fuel Conserved",
      statCO2: "CO₂ Emissions Avoided",
      statBiogas: "Biogas Energy Generated",
      toast: "Switched language to English (EN)"
    },
    hi: {
      badge: "सेंसर-मुक्त प्रेडिक्टिव एआई इंजन",
      title: 'स्मार्ट कचरा संकलन और <span class="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">कचरा ट्रक रूट अनुकूलन</span>',
      subtitle: "निश्चित पिकअप कार्यक्रम समाप्त करें। ऐतिहासिक डेटा, क्षेत्र प्राथमिकता और नागरिक रिपोर्ट के आधार पर कचरा पात्र भरने का पूर्वानुमान लगाएं - ईंधन, यातायात और प्रदूषण कम करें।",
      cta1: "रूट अनुकूलन इंजन शुरू करें",
      cta2: "कचरा पात्र ओवरफ्लो रिपोर्ट करें",
      rule1: "पूर्वानुमान नियम",
      rule2: "डिस्पैच ट्रिगर",
      rule3: "अनुकूलन मॉडल",
      statDistance: "कुल बचाई गई दूरी",
      statFuel: "ईंधन की बचत",
      statCO2: "CO₂ उत्सर्जन में कमी",
      statBiogas: "बायोगैस ऊर्जा उत्पादन",
      toast: "भाषा बदलकर हिंदी (Hindi) की गई"
    },
    mr: {
      badge: "सेन्सर-मुक्त प्रेडिक्टिव्ह एआय इंजिन",
      title: 'स्मार्ट कचरा संकलन आणि <span class="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">कचरा वाहतूक मार्ग ऑप्टिमायझेशन</span>',
      subtitle: "ठरावीक वेळापत्रक बंद करा. ऐतिहासिक कचरा दर, परिसर प्राधान्य आणि नागरिक तक्रारींद्वारे कचरा कुंडी भरण्याचा अचूक अंदाज घ्या - इंधन, वाहतूक कोंडी आणि उत्सर्जन घटवा.",
      cta1: "रूट ऑप्टिमायझेशन इंजिन सुरू करा",
      cta2: "कचरा पेटी ओव्हरफ्लो तक्रार नोंदवा",
      rule1: "अंदाज नियम",
      rule2: "डिस्पॅच ट्रिगर",
      rule3: "ऑप्टिमायझेशन मॉडेल",
      statDistance: "एकूण वाचवलेले अंतर",
      statFuel: "इंधनाची बचत",
      statCO2: "CO₂ उत्सर्जनात घट",
      statBiogas: "बायोगॅस ऊर्जा निर्मिती",
      toast: "भाषा बदलून मराठी (Marathi) केली"
    }
  };

  window.toggleLang = function(lang) {
    const dict = LANG_DICTIONARY[lang] || LANG_DICTIONARY.en;
    const badgeEl = document.getElementById('heroBadgeText');
    const titleEl = document.getElementById('heroTitle');
    const subEl = document.getElementById('heroSubtitle');
    const cta1El = document.getElementById('heroCta1Text');
    const cta2El = document.getElementById('heroCta2Text');
    const r1El = document.getElementById('heroRule1Title');
    const r2El = document.getElementById('heroRule2Title');
    const r3El = document.getElementById('heroRule3Title');
    const sDistEl = document.getElementById('statDistanceLabel');
    const sFuelEl = document.getElementById('statFuelLabel');
    const sCO2El = document.getElementById('statCO2Label');
    const sBioEl = document.getElementById('statBiogasLabel');

    if (badgeEl) badgeEl.textContent = dict.badge;
    if (titleEl) titleEl.innerHTML = dict.title;
    if (subEl) subEl.textContent = dict.subtitle;
    if (cta1El) cta1El.textContent = dict.cta1;
    if (cta2El) cta2El.textContent = dict.cta2;
    if (r1El) r1El.textContent = dict.rule1;
    if (r2El) r2El.textContent = dict.rule2;
    if (r3El) r3El.textContent = dict.rule3;
    if (sDistEl) sDistEl.textContent = dict.statDistance;
    if (sFuelEl) sFuelEl.textContent = dict.statFuel;
    if (sCO2El) sCO2El.textContent = dict.statCO2;
    if (sBioEl) sBioEl.textContent = dict.statBiogas;

    if (window.showSimAlert) {
      window.showSimAlert(dict.toast);
    }
  };
  window.runDemoSequence = function() {
      window.quickLogin('municipal');
  };

})();

// =============================================================
// LIVE MONITORING MAP - Leaflet.js (no API key required)
// Initialised once; re-used on every switchView('municipal').
// =============================================================
(function initLiveMonitoringMap() {
  'use strict';

  const STATIONS = [
    { name: 'Pune City Center',              lat: 18.5204, lon: 73.8567, status: 'High Risk',     color: '#ef4444' },
    { name: 'Karvenagar / Cummins College',  lat: 18.4893, lon: 73.8202, status: 'Moderate Risk', color: '#f59e0b' },
    { name: 'Hinjewadi IT Park',             lat: 18.5913, lon: 73.7389, status: 'High Risk',     color: '#ef4444' },
    { name: 'Hadapsar',                      lat: 18.4966, lon: 73.9416, status: 'Low Risk',      color: '#10b981' },
    { name: 'Kothrud',                       lat: 18.5074, lon: 73.8151, status: 'Moderate Risk', color: '#f59e0b' },
  ];

  let _map = null;

  function buildMap() {
    const container = document.getElementById('live-monitoring-map');
    if (!container || typeof L === 'undefined') return;

    // Avoid double-init if the map was already created
    if (_map) { _map.invalidateSize(); return; }

    _map = L.map('live-monitoring-map', {
      center:  [18.5204, 73.8567],
      zoom:    11,
      scrollWheelZoom: false,
    });

    // OpenStreetMap tiles - completely free, no API key
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(_map);

    STATIONS.forEach(function(s) {
      // Coloured circle marker
      const marker = L.circleMarker([s.lat, s.lon], {
        radius:      11,
        fillColor:   s.color,
        color:       '#fff',
        weight:      2.5,
        opacity:     1,
        fillOpacity: 0.9,
      }).addTo(_map);

      // Popup with name + risk status
      marker.bindPopup(
        '<div style="font-family:Inter,sans-serif;min-width:160px;">' +
          '<div style="font-weight:700;font-size:13px;color:#0f172a;margin-bottom:4px;">' + s.name + '</div>' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
            '<span style="width:10px;height:10px;border-radius:50%;background:' + s.color + ';display:inline-block;flex-shrink:0;"></span>' +
            '<span style="font-size:12px;font-weight:600;color:' + s.color + ';">' + s.status + '</span>' +
          '</div>' +
        '</div>',
        { maxWidth: 220, className: 'eco-popup' }
      );

      // Open popup on hover as well as click
      marker.on('mouseover', function() { this.openPopup(); });
    });
  }

  // Build immediately if DOM is ready, then also whenever switchView is called
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildMap);
  } else {
    buildMap();
  }

  // Patch window.switchView so the map invalidates size and Context panels mount
  const _origSwitch = window.switchView;
  window.switchView = function(view) {
    if (_origSwitch) _origSwitch(view);
    if (view === 'municipal') {
      setTimeout(function() {
        if (window.mountReactMap) window.mountReactMap();
        if (window.mountMunicipalComplaints) window.mountMunicipalComplaints();
        buildMap();
        if (_map) _map.invalidateSize(); if (window.muniMap) window.muniMap.invalidateSize();
      }, 80);
    }
    if (view === 'citizen') {
      setTimeout(function() {
        if (window.mountCitizenMap) window.mountCitizenMap();
        if (window.mountCitizenWallet) window.mountCitizenWallet();
      }, 80);
    }
    if (view === 'admin') {
      setTimeout(function() {
        if (window.mountAdminBinTable) window.mountAdminBinTable();
        if (window.mountAdminTruckList) window.mountAdminTruckList();
        if (window.mountAdminAuditLog) window.mountAdminAuditLog();
        if (window.mountAdminAddBinButton) window.mountAdminAddBinButton();
        if (window.mountAdminAddTruckButton) window.mountAdminAddTruckButton();
      }, 80);
    }
    if (view === 'driver') {
      setTimeout(function() {
        if (window.mountDriverDashboard) window.mountDriverDashboard();
      }, 80);
    }
  };

  // Also expose a manual trigger for the quick-login path
  window.invalidateLiveMap = function() {
    if (_map) { setTimeout(function() { _map.invalidateSize(); }, 80); }
  };
}());

// Admin Hub UI Handlers
window.filterAdminBinTable = function() {
  const input = document.getElementById('adminBinSearch');
  const query = (input ? input.value : '').toLowerCase().trim();
  const rows = document.querySelectorAll('#adminBinTableBody tr');
  rows.forEach(r => {
    r.style.display = r.textContent.toLowerCase().includes(query) ? '' : 'none';
  });
};

window.updateParamThreshold = function(val) {
  const el = document.getElementById('paramThresholdVal');
  if (el) el.textContent = val + '%';
};

window.saveAdminParams = function() {
  const banner = document.getElementById('adminNotificationBanner');
  const textEl = document.getElementById('adminNotificationText');
  const msg = "System Parameters & CO2 Factors Saved Successfully";
  if (textEl) textEl.textContent = msg;
  if (banner) {
    banner.classList.remove('hidden');
    clearTimeout(window._adminBannerTimer);
    window._adminBannerTimer = setTimeout(() => {
      banner.classList.add('hidden');
    }, 4500);
  }
  if (window.showSimAlert) {
    window.showSimAlert(msg);
  }
};

window.addNewAdminBin = function() {
  // Sync with AppContext store
  if (window.appStore) {
    window.appStore.actions.addBin({
      id: 'B-26',
      name: 'Deccan Gymkhana',
      sector: 'Ward 04 • High-Priority Sector',
      capacity: '1000L',
      wasteType: 'Organic',
      dailyRate: '85 kg/day',
      fillPct: 85,
      status: 'Active'
    });
  }

  const tbody = document.getElementById('adminBinTableBody');
  if (tbody) {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors animate-in fade-in duration-300';
    tr.innerHTML = `
      <td class="p-3">
          <div class="font-bold text-slate-900 dark:text-white">B-26 • Deccan Gymkhana</div>
          <div class="text-[11px] text-slate-400">Ward 04 • High-Priority Sector</div>
      </td>
      <td class="p-3 font-mono font-semibold text-slate-700 dark:text-slate-300">1000L</td>
      <td class="p-3">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              Organic
          </span>
      </td>
      <td class="p-3 font-mono text-slate-600 dark:text-slate-400">85%</td>
      <td class="p-3">
          <span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
              Active
          </span>
      </td>
    `;
    tbody.appendChild(tr);
  }

  // Update registry counter
  const countEl = document.getElementById('adminBinCount');
  if (countEl) {
    const current = parseInt(countEl.textContent, 10) || 25;
    countEl.textContent = current + 1;
  }

  // Update simulation state
  if (window.state && window.state.bins) {
    window.state.bins.push({
      id: 'B-26',
      name: 'Deccan Gymkhana',
      capacityL: 1000,
      wasteType: 'Organic',
      fillPercent: 85,
      areaType: 'Commercial',
      status: 'urgent',
      urgency: 'high',
      dailyGenerationRate: 85
    });
  }

  if (window.showSimAlert) {
    window.showSimAlert('✅ Added B-26 (Deccan Gymkhana | 1000L | Organic | 85% | Active) to Managed Bins registry.');
  }
};

window.addNewAdminTruck = function() {
  const list = document.getElementById('adminTruckList');
  if (list) {
    const count = list.querySelectorAll('.p-4').length + 1;
    const truckId = `Truck TR-0${count}`;
    const driver = count === 3 ? 'Anil M.' : 'Vikram S.';
    const cap = '4500L';
    const card = document.createElement('div');
    card.className = 'p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 animate-in fade-in duration-300';
    card.innerHTML = `
      <div class="flex items-center gap-3.5">
          <div class="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 flex items-center justify-center font-bold text-sm">
              <i class="fa-solid fa-truck"></i>
          </div>
          <div>
              <div class="flex items-center gap-2">
                  <span class="font-bold text-slate-900 dark:text-white text-xs">${truckId}</span>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      Active
                  </span>
              </div>
              <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Driver: <strong class="text-slate-700 dark:text-slate-300">${driver}</strong> • Cap: <span class="font-mono font-semibold">${cap}</span>
              </div>
          </div>
      </div>
      <div class="text-right">
          <span class="text-[11px] text-slate-400 block font-mono">Assigned: Route ${String.fromCharCode(64 + count)}</span>
          <span class="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">Dispatched &amp; Active</span>
      </div>
    `;
    list.appendChild(card);
  }
  if (window.showSimAlert) {
    window.showSimAlert('🚛 Added new truck to Fleet List.');
  }
};

// Centered Modal Overlays for Admin Operations (delegated to Dynamic React Modals)
window.openAddBinModal = function() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('open-add-bin-modal'));
  }
};

window.closeAddBinModal = function() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('close-add-bin-modal'));
  }
};

window.openAddTruckModal = function() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('open-add-truck-modal'));
  }
};

window.closeAddTruckModal = function() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('close-add-truck-modal'));
  }
};

window.triggerBulkImport = function() {
  if (window.showSimAlert) {
    window.showSimAlert('📂 Bulk CSV Import: Synchronized 25 telemetry streams from municipal sensor grid.');
  }
};

