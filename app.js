// =============================================================
// EcoRoute AI — Application Logic (app.js)  Phase 1
// PROTOTYPE: All predictions use rule-based simulation only.
// =============================================================

(function () {
  'use strict';

  // ── SVG element helper ────────────────────────────────────
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs = {}) => {
    const e = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    return e;
  };

  // ── DOM shorthand ─────────────────────────────────────────
  const $ = id => document.getElementById(id);

  // ── Application state ─────────────────────────────────────
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
  };

  // ══════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════

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
    if (hrs >= 99) return { label: '—', cls: '' };
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

  // ══════════════════════════════════════════════════════════
  // COMPUTED METRICS
  // ══════════════════════════════════════════════════════════

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

  // ── Drawer Management ──────────────────────────────────────
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



  // ══════════════════════════════════════════════════════════
  // RENDER — 4 KPI Summary Cards
  // ══════════════════════════════════════════════════════════

  function renderKPICards(distSaved, co2Saved) {
    const m = computeMetrics();
    
    // Update Tailwind Dashboard Metrics
    if ($('muniTotalBins')) $('muniTotalBins').innerText = m.total;
    if ($('muniHighBins')) $('muniHighBins').innerText = `${m.urgentCount} Bins`;
    if ($('muniWarnBins')) $('muniWarnBins').innerText = `${m.warningCount} Bins`;
    if ($('muniLowBins')) $('muniLowBins').innerText = `${m.okCount} Bins`;
    
    // Biogas
    if ($('muniOrganicKg')) $('muniOrganicKg').innerText = `${Math.round(m.organicKg).toLocaleString()} kg`;
    if ($('muniBioCNG')) $('muniBioCNG').innerText = `${Math.round(m.organicKg * 0.07).toLocaleString()} m³`;
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


  // ── Route Calculation ──────────────────────────────────────
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
        return `<div class="flex items-center gap-2 py-1.5 px-2 text-xs text-blue-500 font-semibold"><span class="w-5 h-5 rounded bg-blue-100 flex items-center justify-center text-[9px] font-bold">D</span> Depot — Empty Truck</div>`;
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

    // Update DOM – use the new Tailwind containers (safe-null guards)
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
    renderMap();
  }

  // ══════════════════════════════════════════════════════════
  // RENDER — SVG City Map
  // ══════════════════════════════════════════════════════════

  function renderMap() {
    const container = $('map-body');
    if (!container) return;

    const W = 800, H = 520;

    // ── Root SVG ──────────────────────────────────────────
    const svg = svgEl('svg', {
      viewBox: `0 0 ${W} ${H}`,
      preserveAspectRatio: 'xMidYMid slice',
      role: 'img',
      'aria-label': 'City map showing bin locations for Ward 12, Pune',
    });

    // ── Background ────────────────────────────────────────
    const bgRect = svgEl('rect', { width: W, height: H, fill: '#e8f0f7' });
    bgRect.addEventListener('click', closeDrawer);
    svg.appendChild(bgRect);

    // ── City block grid ───────────────────────────────────
    // Road grid (vertical x, horizontal y boundary positions)
    const vRoads = [0, 158, 316, 474, 632, W];
    const hRoads = [0, 106, 212, 318, 424, H];
    const roadGap = 10; // half-gap each side of road centre

    // Zone types by [col][row]
    const ZONES = [
      ['park',  'res',  'res',  'res',  'res' ],
      ['res',   'res',  'com',  'com',  'ind' ],
      ['res',   'com',  'com',  'com',  'ind' ],
      ['res',   'res',  'res',  'ind',  'ind' ],
    ];

    const ZONE_FILL = {
      park: '#d4ecd9',   /* soft green — parks */
      res:  '#dde8f4',   /* light slate-blue — residential */
      com:  '#d0e2f0',   /* slightly deeper blue — commercial */
      ind:  '#dce3e8',   /* cool grey — industrial */
    };

    // Draw city blocks
    for (let c = 0; c < vRoads.length - 1; c++) {
      for (let r = 0; r < hRoads.length - 1; r++) {
        const bx = vRoads[c] + roadGap;
        const by = hRoads[r] + roadGap;
        const bw = vRoads[c + 1] - vRoads[c] - roadGap * 2;
        const bh = hRoads[r + 1] - hRoads[r] - roadGap * 2;
        const zone = (ZONES[r] || [])[c] || 'res';
        svg.appendChild(svgEl('rect', {
          x: bx, y: by, width: bw, height: bh,
          fill: ZONE_FILL[zone],
          rx: 2,
        }));

        // Park hatching (subtle diagonal lines)
        if (zone === 'park') {
          const pat = svgEl('rect', {
            x: bx, y: by, width: bw, height: bh,
            fill: 'none',
            stroke: '#9fca9f',
            'stroke-width': 1,
            rx: 2,
            opacity: 0.6,
          });
          svg.appendChild(pat);
        }
      }
    }

    // Draw road network (light roads on light map)
    const roadLineAttr = { stroke: '#c5d5e8', 'stroke-width': roadGap * 2, opacity: '0.9' };

    // Vertical roads
    vRoads.slice(1, -1).forEach(x => {
      svg.appendChild(svgEl('line', { x1: x, y1: 0, x2: x, y2: H, ...roadLineAttr }));
    });
    // Horizontal roads
    hRoads.slice(1, -1).forEach(y => {
      svg.appendChild(svgEl('line', { x1: 0, y1: y, x2: W, y2: y, ...roadLineAttr }));
    });

    // ── Subtle grid texture overlay ───────────────────────
    const defs = svgEl('defs');
    const gridPat = svgEl('pattern', {
      id: 'cityGrid', width: 40, height: 40,
      patternUnits: 'userSpaceOnUse',
    });
    const gl1 = svgEl('line', { x1: 0, y1: 0, x2: 40, y2: 0, stroke: '#1a2638', 'stroke-width': 0.5 });
    const gl2 = svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 40, stroke: '#1a2638', 'stroke-width': 0.5 });
    gridPat.appendChild(gl1);
    gridPat.appendChild(gl2);
    defs.appendChild(gridPat);
    svg.appendChild(defs);
    svg.appendChild(svgEl('rect', {
      width: W, height: H,
      fill: 'url(#cityGrid)',
      opacity: 0.5,
      'pointer-events': 'none',
    }));

    // ── Zone labels (very subtle) ──────────────────────────
    const labels = [
      { x: 10, y: 95, text: 'PARK', col: '#1a3a1a' },
      { x: 474, y: 95, text: 'INDUSTRIAL', col: '#1a1e30' },
      { x: 218, y: 210, text: 'COMMERCIAL DISTRICT', col: '#162030' },
    ];
    labels.forEach(({ x, y, text, col }) => {
      const t = svgEl('text', {
        x, y,
        fill: col,
        'font-size': 9,
        'font-weight': '700',
        'letter-spacing': 1.5,
        'font-family': 'system-ui, sans-serif',
        'text-anchor': 'start',
      });
      t.textContent = text;
      svg.appendChild(t);
    });

    // ── Routes (if active) ─────────────────────────────────
    if (state.routeActive && state.ecoRoute && state.baselineRoute) {
      // Helper to generate SVG path string
      const makePath = (seq) => {
        if (!seq || seq.length === 0) return '';
        let d = `M ${state.depot.x} ${state.depot.y}`;
        seq.forEach(b => { d += ` L ${b.x} ${b.y}`; });
        d += ` L ${state.depot.x} ${state.depot.y}`;
        return d;
      };

      // Draw baseline route (faint)
      svg.appendChild(svgEl('path', {
        d: makePath(state.baselineRoute.path),
        class: 'route-line-baseline'
      }));

      // Draw eco route (highlighted)
      svg.appendChild(svgEl('path', {
        d: makePath(state.ecoRoute.path),
        class: 'route-line-eco'
      }));
    }

    // ── Depot marker ──────────────────────────────────────
    const { x: dx, y: dy } = state.depot;
    const dg = svgEl('g', { class: 'depot-marker', transform: `translate(${dx},${dy})` });
    // Diamond
    dg.appendChild(svgEl('polygon', {
      points: '0,-13 11,0 0,13 -11,0',
      fill: '#1a3660',
      stroke: '#58a6ff',
      'stroke-width': 1.8,
    }));
    // Inner dot
    dg.appendChild(svgEl('circle', { cx: 0, cy: 0, r: 3, fill: '#58a6ff' }));
    // Label
    const dl = svgEl('text', {
      x: 14, y: 4,
      fill: '#58a6ff',
      'font-size': 9,
      'font-weight': '700',
      'font-family': 'system-ui, sans-serif',
    });
    dl.textContent = 'DEPOT';
    dg.appendChild(dl);
    svg.appendChild(dg);

    // ── Bin markers ───────────────────────────────────────
    state.bins.forEach(bin => {
      if (bin.collected) return;

      const isSelected = state.selectedBinId === bin.id;
      const g = svgEl('g', {
        class: isSelected ? 'bin-marker selected' : 'bin-marker',
        'data-id': bin.id,
      });

      // Add click listener
      g.addEventListener('click', (e) => {
        e.stopPropagation(); // prevent closing drawer
        openDrawer(bin.id);
      });

      const hex = fillColorHex(bin.fillPercent);
      const r = bin.status === 'urgent' ? 8 : bin.status === 'warning' ? 7 : 6;

      // Pulsing ring for urgent bins
      if (bin.status === 'urgent') {
        const ring = svgEl('circle', {
          cx: bin.x, cy: bin.y, r: 10,
          fill: 'none',
          stroke: '#f85149',
          'stroke-width': 1.5,
          class: 'pulse-ring',
        });
        // SVG <animate> for the pulse (cross-browser reliable)
        const animR = svgEl('animate', {
          attributeName: 'r',
          values: '10;22;10',
          dur: '1.8s',
          repeatCount: 'indefinite',
        });
        const animO = svgEl('animate', {
          attributeName: 'opacity',
          values: '0.7;0;0.7',
          dur: '1.8s',
          repeatCount: 'indefinite',
        });
        ring.appendChild(animR);
        ring.appendChild(animO);
        g.appendChild(ring);
      }

      // Outer circle (coloured)
      g.appendChild(svgEl('circle', {
        cx: bin.x, cy: bin.y, r,
        fill: hex,
        class: 'bin-circle',
        opacity: 0.95,
      }));

      // Inner dark dot (shows "how full" by size)
      const innerR = Math.max(2, r - 3 - (100 - bin.fillPercent) * 0.03);
      g.appendChild(svgEl('circle', {
        cx: bin.x, cy: bin.y, r: innerR,
        fill: '#090d13',
        opacity: 0.55,
      }));

      // Tooltip title for accessibility
      const title = svgEl('title');
      title.textContent =
        `${bin.name} (${bin.id}) · ${bin.fillPercent}% full · Overflow in ${overflowETA(bin.overflowHours).label}`;
      g.appendChild(title);

      svg.appendChild(g);
    });

    // ── Ward boundary label ───────────────────────────────
    const wl = svgEl('text', {
      x: W - 8, y: H - 8,
      fill: '#1a2638',
      'font-size': 11,
      'font-weight': '700',
      'letter-spacing': 1.2,
      'font-family': 'system-ui, sans-serif',
      'text-anchor': 'end',
    });
    wl.textContent = 'WARD 12 · PUNE  ⊡ PROTOTYPE';
    svg.appendChild(wl);

    container.innerHTML = '';
    container.appendChild(svg);
  }

  // ══════════════════════════════════════════════════════════
  // RENDER — Urgent Bin Panel (right)
  // ══════════════════════════════════════════════════════════

  // ── Waste-type chip colours ────────────────────────────────
  function wasteTypeColor(wt) {
    return { Organic:'#3fb950', Dry:'#58a6ff', Mixed:'#d29922', Hazardous:'#f85149' }[wt] || '#8b949e';
  }

  // ── Relative time from ISO string to SIM_BASE ──────────────
  function relativeTime(isoStr) {
    const simBase = new Date(ECO.SIM_META.referenceTime);
    const hrs = Math.round((simBase - new Date(isoStr)) / 3_600_000);
    if (hrs < 24)  return `${hrs}h ago`;
    const d = Math.floor(hrs / 24), h = hrs % 24;
    return h ? `${d}d ${h}h ago` : `${d}d ago`;
  }

  function renderUrgentPanel() {
    const list = $('muniPriorityList');
    if (!list) return;

    // High-urgency first, then medium — both sorted by overflow ETA
    const priorityBins = state.bins
      .filter(b => !b.collected && (b.urgency === 'high' || b.urgency === 'medium'))
      .sort((a, b) => {
        if (a.urgency !== b.urgency) return a.urgency === 'high' ? -1 : 1;
        return a.overflowHours - b.overflowHours;
      });

    if (priorityBins.length === 0) {
      list.innerHTML = `<div class="text-xs text-slate-400 p-4 text-center">No bins currently above threshold (${state.cfg.collectionThresholdPct}%).</div>`;
      return;
    }

    list.innerHTML = priorityBins.map((bin, idx) => {
      let badgeClass = bin.urgency === 'high' ? 'bg-rose-500/20 text-rose-500' : 'bg-amber-500/20 text-amber-500';
      let scoreColor = bin.priorityScore >= 80 ? 'text-rose-500' : bin.priorityScore >= 50 ? 'text-amber-500' : 'text-emerald-500';
      
      return `
        <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
            <div class="flex items-center gap-3">
                <span class="w-6 h-6 rounded-lg ${badgeClass} font-bold flex items-center justify-center font-mono text-[10px]">#${idx+1}</span>
                <div>
                    <div class="font-bold text-slate-900 dark:text-white">${bin.id} — ${bin.name}</div>
                    <div class="text-[10px] text-slate-400">${bin.areaType} • ${bin.wasteType}</div>
                </div>
            </div>
            <div class="text-right">
                <span class="font-mono font-extrabold ${scoreColor} text-sm">${bin.fillPercent}%</span>
                <div class="text-[9px] text-slate-400">Score: ${bin.priorityScore}</div>
            </div>
        </div>
      `;
    }).join('');
  }


  // ══════════════════════════════════════════════════════════
  // RENDER — Truck Capacity Strip (bottom)
  // ══════════════════════════════════════════════════════════

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
          <div class="truck-strip-icon">🚛</div>
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


  // ══════════════════════════════════════════════════════════
  // RENDER — Route Badge on sidebar nav item
  // ══════════════════════════════════════════════════════════

  function updateRouteBadge() {
    const badge = $('nav-badge-route');
    if (!badge) return;
    const count = state.bins.filter(b =>
      !b.collected && (b.fillPercent >= state.cfg.collectionThresholdPct || b.urgency === 'high')
    ).length;
    badge.textContent = count;
    badge.classList.toggle('hidden', count === 0);
  }

  // ══════════════════════════════════════════════════════════
  // RENDER — Full Dashboard
  // ══════════════════════════════════════════════════════════

  function renderDashboard() {
    renderKPICards();
    renderMap();
    renderUrgentPanel();
    renderTruckStrip();
    updateRouteBadge();
  }

  // ══════════════════════════════════════════════════════════
  // SIDEBAR TOGGLE
  // ══════════════════════════════════════════════════════════

  function toggleSidebar() {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    const sidebar = $('sidebar');
    if (sidebar) {
      sidebar.classList.toggle('collapsed', state.sidebarCollapsed);
      sidebar.classList.toggle('mobile-open');
    }
  }



  // ══════════════════════════════════════════════════════════
  // SIMULATION ALERT TOAST
  // ══════════════════════════════════════════════════════════

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

  // ══════════════════════════════════════════════════════════
  // SIMULATION ENGINE CONTROLS
  // ══════════════════════════════════════════════════════════

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

  function simulateAdvanceTime() {
    state.bins.forEach(bin => {
        const hourlyRate = (bin.predictedFillPercent - bin.fillPercent) / 4;
        bin.fillPercent = Math.min(100, parseFloat((bin.fillPercent + hourlyRate * 6).toFixed(1)));
        bin.lastCollectedHoursAgo += 6;
        updateBinCalculations(bin);
    });

    showSimAlert(`⏳ Time advanced 6 hours. Bins updated according to generation rates.`);
    
    if (state.routeActive) generateEcoRoute();
    else if (state.activeView === 'dashboard') renderDashboard();
  }

  function resetSimulation() {
    state.bins = JSON.parse(JSON.stringify(initialBinsState));
    state.routeActive = false;
    state.ecoRoute = null;
    state.baselineRoute = null;
    
    showSimAlert(`🔄 Simulation reset to deterministic baseline.`);
    
    const rb = $('route-results');
    if (rb) rb.style.display = 'none';
    
    // Also reset any selected bin if the drawer was open
    if (state.selectedBinId) closeDrawer();

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

  // ══════════════════════════════════════════════════════════
  // CITIZEN REPORT & WORKER VIEW
  // ══════════════════════════════════════════════════════════

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
              <div class="worker-bin-name" style="font-size: 12px;">♻ Return to Depot</div>
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

  // ══════════════════════════════════════════════════════════
  // LIVE CLOCK
  // ══════════════════════════════════════════════════════════

  function updateClock() {
    const el = $('topbar-time');
    if (el) el.textContent = formatDateTime(new Date());
  }

  // ══════════════════════════════════════════════════════════
  // EVENT LISTENERS
  // ══════════════════════════════════════════════════════════

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

  // ══════════════════════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════════════════════

  function switchViewInternal(view) {
      document.querySelectorAll('.view-section').forEach(s => s.classList.add('hidden'));
      const tgt = document.getElementById('view-' + view);
      if (tgt) tgt.classList.remove('hidden');
      window.scrollTo(0, 0);
  }

  function init() {
    setupListeners();
    renderDashboard();
    updateClock();
    setInterval(updateClock, 1000);
    
    // Populate Citizen Select
    const cb = $('citizenBinSelect');
    if (cb) {
        cb.innerHTML = state.bins.map(b => `<option value="${b.id}">${b.id} — ${b.name}</option>`).join('');
    }

    // Show landing view
    switchViewInternal('landing');

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
  window.switchView = function(view) {
      switchViewInternal(view);
  };
  window.exportMunicipalReport = function() { alert("📄 Generating PDF..."); };
  
  window.handleCitizenReportSubmit = function(e) {
      e.preventDefault();
      const binId = $('citizenBinSelect').value;
      const issue = $('citizenIssueType').value;
      const bin = state.bins.find(b => b.id === binId);
      if (bin) {
          bin.urgency = 'high';
          bin.priorityReason = `Citizen Report: ${issue}`;
          bin.priorityScore = Math.max(90, bin.priorityScore + 30);
          bin.fillPercent = Math.max(85, bin.fillPercent + 20);
          renderDashboard();
          alert(`Simulation Event: Citizen reported ${bin.name} (${bin.id}).\nIts urgency was raised to HIGH.`);
          e.target.reset();
      }
  };

  // Auth mocks
  window.openLoginModal = function() {
      const m = document.getElementById('loginModal');
      if (m) m.classList.remove('hidden');
  };
  window.closeLoginModal = function() {
      const m = document.getElementById('loginModal');
      if (m) m.classList.add('hidden');
  };
  window.setAuthRole = function(role) { window.authModalRole = role; };
  window.quickLogin = function(role) {
      window.closeLoginModal();
      window.switchView(role);
      
      const authC = document.getElementById('authContainer');
      if (authC) {
          authC.innerHTML = `
              <div class="flex items-center gap-2">
                  <span class="px-2.5 py-1 rounded-full text-xs font-bold border bg-indigo-100 text-indigo-700 uppercase">${role}</span>
                  <button onclick="logout()" class="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg text-xs" title="Logout">
                      <i class="fa-solid fa-right-from-bracket"></i>
                  </button>
              </div>`;
      }
      
      if (role === 'municipal') renderDashboard();
  };
  window.logout = function() {
      window.switchView('landing');
      const authC = document.getElementById('authContainer');
      if (authC) {
          authC.innerHTML = `
              <button onclick="openLoginModal()" class="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-md shadow-emerald-600/20 transition-all">
                  <i class="fa-solid fa-right-to-bracket"></i>
                  <span>Login / Portal</span>
              </button>`;
      }
  };
  window.requireRoleView = function(role) {
      window.setAuthRole(role);
      window.openLoginModal();
  };

  // UI utility stubs
  window.toggleMobileMenu = function() {
      const m = document.getElementById('mobileMenu');
      if (m) m.classList.toggle('hidden');
  };
  window.toggleLang = function(lang) {
      // Placeholder — multilingual simulation
      console.log('Language set to:', lang);
  };
  window.handleLoginSubmit = function(e) {
      e.preventDefault();
      const role = window.authModalRole || 'municipal';
      window.quickLogin(role);
  };
  window.runDemoSequence = function() {
      window.quickLogin('municipal');
  };

})();
