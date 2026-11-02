/**
 * Helios - Solar Energy & Home Electricity Tracker
 * Pure Vanilla JavaScript (Zero Dependencies, Zero Frameworks)
 * Fully persistent via Browser LocalStorage
 */

(function () {
  'use strict';

  // --- Storage Keys ---
  const STORAGE_KEY_READINGS = 'helios_solar_readings_v1';
  const STORAGE_KEY_SETTINGS = 'helios_solar_settings_v1';

  // --- Default Settings ---
  const defaultSettings = {
    currency: '$',
    importRate: 0.28,    // Cost to import from grid per kWh
    exportRate: 0.08,    // Feed-in tariff payout per kWh
    co2Factor: 0.45,     // kg CO2 per kWh
    systemSize: 6.5,     // kWp
    batteryCap: 10.0     // kWh
  };

  // --- Application State ---
  let readings = [];
  let settings = { ...defaultSettings };
  let currentSort = { field: 'date', order: 'desc' };
  let activeTimeRange = 7; // 7, 14, 30, or 'all'
  let flowViewMode = 'latest'; // 'latest', 'today', 'average'
  let flowAnimationId = null;
  let particles = [];

  // --- DOM Elements ---
  const elements = {
    // Buttons
    btnDemoData: document.getElementById('btn-demo-data'),
    btnOpenSettings: document.getElementById('btn-open-settings'),
    btnOpenLogModal: document.getElementById('btn-open-log-modal'),
    btnExportCsv: document.getElementById('btn-export-csv'),
    btnExportJson: document.getElementById('btn-export-json'),
    fileImportJson: document.getElementById('file-import-json'),
    btnClearAll: document.getElementById('btn-clear-all'),
    btnEmptyLoadDemo: document.getElementById('btn-empty-load-demo'),

    // KPIs
    kpiSolarVal: document.getElementById('kpi-solar-val'),
    kpiSolarSub: document.getElementById('kpi-solar-sub'),
    kpiHomeVal: document.getElementById('kpi-home-val'),
    kpiHomeSub: document.getElementById('kpi-home-sub'),
    kpiExportVal: document.getElementById('kpi-export-val'),
    kpiExportEarnings: document.getElementById('kpi-export-earnings'),
    kpiImportVal: document.getElementById('kpi-import-val'),
    kpiImportCost: document.getElementById('kpi-import-cost'),
    kpiAutarkyVal: document.getElementById('kpi-autarky-val'),
    kpiAutarkySub: document.getElementById('kpi-autarky-sub'),
    kpiSavingsVal: document.getElementById('kpi-savings-val'),
    kpiCarbonVal: document.getElementById('kpi-carbon-val'),

    // Flow Canvas
    flowCanvas: document.getElementById('flow-canvas'),
    flowViewSelect: document.getElementById('flow-view-select'),

    // Charts
    trendCanvas: document.getElementById('trend-chart'),
    chartTooltip: document.getElementById('chart-tooltip'),
    timeFilterGroup: document.getElementById('time-filter-group'),
    donutCanvas: document.getElementById('donut-chart'),
    donutBreakdown: document.getElementById('donut-breakdown'),

    // Table
    readingsTableBody: document.getElementById('readings-table-body'),
    tableSearch: document.getElementById('table-search'),
    tableEmptyState: document.getElementById('table-empty-state'),
    tableCountLabel: document.getElementById('table-count-label'),
    tableHeaders: document.querySelectorAll('#readings-table th[data-sort]'),

    // Modals
    readingModal: document.getElementById('reading-modal'),
    modalHeading: document.getElementById('modal-heading'),
    readingForm: document.getElementById('reading-form'),
    btnModalClose: document.getElementById('btn-modal-close'),
    btnModalCancel: document.getElementById('btn-modal-cancel'),
    entryId: document.getElementById('entry-id'),
    inputDate: document.getElementById('input-date'),
    inputWeather: document.getElementById('input-weather'),
    inputSolar: document.getElementById('input-solar'),
    inputConsumption: document.getElementById('input-consumption'),
    inputExport: document.getElementById('input-export'),
    inputImport: document.getElementById('input-import'),
    inputBattery: document.getElementById('input-battery'),
    inputNotes: document.getElementById('input-notes'),
    previewSelfUse: document.getElementById('preview-self-use'),
    previewSavings: document.getElementById('preview-savings'),

    // Settings Modal
    settingsModal: document.getElementById('settings-modal'),
    settingsForm: document.getElementById('settings-form'),
    btnSettingsClose: document.getElementById('btn-settings-close'),
    btnSettingsCancel: document.getElementById('btn-settings-cancel'),
    settingCurrency: document.getElementById('setting-currency'),
    settingImportRate: document.getElementById('setting-import-rate'),
    settingExportRate: document.getElementById('setting-export-rate'),
    settingCo2Factor: document.getElementById('setting-co2-factor'),
    settingSystemSize: document.getElementById('setting-system-size'),
    settingBatteryCap: document.getElementById('setting-battery-cap'),

    // Toast
    toastContainer: document.getElementById('toast-container')
  };

  // --- Initialize App ---
  function init() {
    loadSettings();
    loadReadings();

    if (readings.length === 0) {
      loadDemoData(false); // seed demo data on fresh run
    }

    setupEventListeners();
    setupCanvasDPI();
    initFlowParticles();
    startFlowAnimation();
    updateUI();
  }

  // --- Persistence Handlers ---
  function loadSettings() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (saved) {
        settings = { ...defaultSettings, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Failed to parse saved settings, using defaults', e);
      settings = { ...defaultSettings };
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save settings to localStorage', e);
    }
  }

  function loadReadings() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_READINGS);
      if (saved) {
        readings = JSON.parse(saved);
        if (!Array.isArray(readings)) readings = [];
      } else {
        readings = [];
      }
    } catch (e) {
      console.error('Failed to parse saved readings', e);
      readings = [];
    }
  }

  function saveReadings() {
    try {
      localStorage.setItem(STORAGE_KEY_READINGS, JSON.stringify(readings));
    } catch (e) {
      console.error('Failed to save readings to localStorage', e);
      showToast('Storage error: browser quota exceeded', 'error');
    }
  }

  // --- Toast Notification ---
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#f43f5e" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
    } else {
      iconSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#f59e0b" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    }

    toast.innerHTML = `${iconSvg}<span>${escapeHtml(message)}</span>`;
    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  // --- High DPI Canvas Helper ---
  function setupCanvasDPI() {
    [elements.flowCanvas, elements.trendCanvas, elements.donutCanvas].forEach(canvas => {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const displayWidth = rect.width || canvas.width;
      const displayHeight = rect.height || canvas.height;

      // Only scale if not already scaled
      if (canvas.width !== Math.round(displayWidth * dpr)) {
        canvas.width = Math.round(displayWidth * dpr);
        canvas.height = Math.round(displayHeight * dpr);
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
      }
    });
  }

  // --- Demo Data Generation ---
  function loadDemoData(notify = true) {
    const demoEntries = [];
    const today = new Date();
    const weatherTypes = ['sunny', 'sunny', 'partly-cloudy', 'sunny', 'cloudy', 'rainy', 'partly-cloudy'];
    const notesPool = [
      'Peak clear sky day, EV charged fully',
      'High solar yield, pool pump scheduled',
      'Intermittent cloud cover in afternoon',
      'Dishwasher & washing machine ran midday',
      'Overcast day, heat pump relied on battery',
      'Heavy rainy morning, low solar generation',
      'Normal weekend electricity usage'
    ];

    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const weather = weatherTypes[i % weatherTypes.length];

      let solar = 0;
      let consumption = +(14 + Math.random() * 8).toFixed(2); // 14 to 22 kWh

      if (weather === 'sunny') {
        solar = +(26 + Math.random() * 8).toFixed(2); // 26 - 34 kWh
      } else if (weather === 'partly-cloudy') {
        solar = +(18 + Math.random() * 6).toFixed(2); // 18 - 24 kWh
      } else if (weather === 'cloudy') {
        solar = +(9 + Math.random() * 4).toFixed(2);  // 9 - 13 kWh
      } else {
        solar = +(4 + Math.random() * 3).toFixed(2);  // 4 - 7 kWh
      }

      // Calculate realistic grid export & import based on production vs consumption
      let exportKwh = 0;
      let importKwh = 0;
      let battery = +(Math.random() * 4 - 1.5).toFixed(2); // slight battery cycling

      if (solar > consumption) {
        const surplus = solar - consumption;
        exportKwh = +(surplus * 0.85).toFixed(2);
        importKwh = +(Math.random() * 2.5).toFixed(2); // small night standby import
      } else {
        const deficit = consumption - solar;
        importKwh = +(deficit * 0.9).toFixed(2);
        exportKwh = +(Math.random() * 1.5).toFixed(2); // brief mid-day spike export
      }

      demoEntries.push({
        id: 'entry_' + Date.now() + '_' + i,
        date: dateStr,
        weather: weather,
        solar: solar,
        consumption: consumption,
        export: exportKwh,
        import: importKwh,
        battery: battery,
        notes: notesPool[i % notesPool.length]
      });
    }

    readings = demoEntries;
    saveReadings();
    updateUI();
    if (notify) {
      showToast('Loaded 14 days of realistic solar data');
    }
  }

  // --- Filtering & Sorting ---
  function getFilteredReadings() {
    let sorted = [...readings].sort((a, b) => {
      let valA = a[currentSort.field];
      let valB = b[currentSort.field];

      if (currentSort.field === 'date') {
        return currentSort.order === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return currentSort.order === 'asc' ? (valA - valB) : (valB - valA);
    });

    const searchQuery = elements.tableSearch.value.trim().toLowerCase();
    if (searchQuery) {
      sorted = sorted.filter(item => {
        return (
          item.date.toLowerCase().includes(searchQuery) ||
          item.weather.toLowerCase().includes(searchQuery) ||
          (item.notes && item.notes.toLowerCase().includes(searchQuery))
        );
      });
    }

    return sorted;
  }

  function getRangeReadings() {
    // Sort chronologically ascending for charts and KPI ranges
    const sorted = [...readings].sort((a, b) => a.date.localeCompare(b.date));
    if (activeTimeRange === 'all') return sorted;
    const count = parseInt(activeTimeRange, 10);
    return sorted.slice(-count);
  }

  // --- UI Update Coordinator ---
  function updateUI() {
    renderKPIs();
    renderTrendChart();
    renderDonutChart();
    renderTable();
  }

  // --- Render KPI Cards ---
  function renderKPIs() {
    const rangeData = getRangeReadings();

    if (rangeData.length === 0) {
      elements.kpiSolarVal.textContent = '0.0';
      elements.kpiSolarSub.textContent = 'No records in range';
      elements.kpiHomeVal.textContent = '0.0';
      elements.kpiHomeSub.textContent = 'No records in range';
      elements.kpiExportVal.textContent = '0.0';
      elements.kpiExportEarnings.textContent = '+ ' + settings.currency + '0.00 earned';
      elements.kpiImportVal.textContent = '0.0';
      elements.kpiImportCost.textContent = '- ' + settings.currency + '0.00 cost';
      elements.kpiAutarkyVal.textContent = '0';
      elements.kpiAutarkySub.textContent = '0% grid independence';
      elements.kpiSavingsVal.textContent = settings.currency + '0.00';
      elements.kpiCarbonVal.textContent = '0 kg CO₂ saved';
      return;
    }

    const totalSolar = rangeData.reduce((acc, r) => acc + (r.solar || 0), 0);
    const totalHome = rangeData.reduce((acc, r) => acc + (r.consumption || 0), 0);
    const totalExport = rangeData.reduce((acc, r) => acc + (r.export || 0), 0);
    const totalImport = rangeData.reduce((acc, r) => acc + (r.import || 0), 0);

    // Self-sufficiency (Autarky): % of home consumption covered without grid import
    const solarDirectUsed = Math.max(0, totalHome - totalImport);
    const autarkyPct = totalHome > 0 ? Math.min(100, Math.round((solarDirectUsed / totalHome) * 100)) : 0;

    // Financial calculations
    const exportEarnings = totalExport * settings.exportRate;
    const importCost = totalImport * settings.importRate;
    // Without solar, home would have paid: totalHome * importRate
    // With solar, home paid: importCost - exportEarnings
    // Net savings = (totalHome * importRate) - (importCost - exportEarnings)
    const billWithoutSolar = totalHome * settings.importRate;
    const billWithSolar = importCost - exportEarnings;
    const netSavings = Math.max(0, billWithoutSolar - billWithSolar);

    // CO2 offset
    const co2Saved = Math.round(totalSolar * settings.co2Factor);

    elements.kpiSolarVal.textContent = totalSolar.toFixed(1);
    elements.kpiSolarSub.textContent = `Avg ${(totalSolar / rangeData.length).toFixed(1)} kWh/day (${rangeData.length}d)`;

    elements.kpiHomeVal.textContent = totalHome.toFixed(1);
    elements.kpiHomeSub.textContent = `Avg ${(totalHome / rangeData.length).toFixed(1)} kWh/day (${rangeData.length}d)`;

    elements.kpiExportVal.textContent = totalExport.toFixed(1);
    elements.kpiExportEarnings.textContent = `+ ${settings.currency}${exportEarnings.toFixed(2)} earned`;

    elements.kpiImportVal.textContent = totalImport.toFixed(1);
    elements.kpiImportCost.textContent = `- ${settings.currency}${importCost.toFixed(2)} cost`;

    elements.kpiAutarkyVal.textContent = autarkyPct;
    elements.kpiAutarkySub.textContent = `${autarkyPct}% grid independence`;

    elements.kpiSavingsVal.textContent = `${settings.currency}${netSavings.toFixed(2)}`;
    elements.kpiCarbonVal.textContent = `${co2Saved} kg CO₂ saved (${(co2Saved / 21).toFixed(1)} trees eq.)`;
  }

  // --- Dynamic Live Energy Flow Canvas Animation ---
  const flowNodes = {
    solar: { x: 170, y: 70, label: 'Solar Array', icon: '☀️', color: '#f59e0b' },
    hub: { x: 450, y: 140, label: 'Hybrid Inverter', icon: '⚡', color: '#6366f1' },
    home: { x: 730, y: 70, label: 'Home Usage', icon: '🏠', color: '#0ea5e9' },
    battery: { x: 170, y: 210, label: 'Battery Storage', icon: '🔋', color: '#8b5cf6' },
    grid: { x: 730, y: 210, label: 'Power Grid', icon: '🔌', color: '#10b981' }
  };

  function initFlowParticles() {
    particles = [];
    for (let i = 0; i < 40; i++) {
      particles.push({
        path: 'solar_to_hub',
        t: Math.random(),
        speed: 0.006 + Math.random() * 0.005,
        color: '#f59e0b',
        radius: 3.5
      });
    }
  }

  function getActiveFlowMetrics() {
    if (readings.length === 0) {
      return { solar: 0, consumption: 0, export: 0, import: 0, battery: 0 };
    }

    if (flowViewMode === 'latest') {
      const sorted = [...readings].sort((a, b) => b.date.localeCompare(a.date));
      return sorted[0];
    } else if (flowViewMode === 'today') {
      const todayStr = new Date().toISOString().split('T')[0];
      const todayEntry = readings.find(r => r.date === todayStr);
      if (todayEntry) return todayEntry;
      // Fallback to latest
      const sorted = [...readings].sort((a, b) => b.date.localeCompare(a.date));
      return sorted[0];
    } else {
      // Historical Average
      const totalSolar = readings.reduce((a, b) => a + b.solar, 0) / readings.length;
      const totalCons = readings.reduce((a, b) => a + b.consumption, 0) / readings.length;
      const totalExp = readings.reduce((a, b) => a + b.export, 0) / readings.length;
      const totalImp = readings.reduce((a, b) => a + b.import, 0) / readings.length;
      const totalBat = readings.reduce((a, b) => a + (b.battery || 0), 0) / readings.length;
      return {
        solar: +totalSolar.toFixed(1),
        consumption: +totalCons.toFixed(1),
        export: +totalExp.toFixed(1),
        import: +totalImp.toFixed(1),
        battery: +totalBat.toFixed(1)
      };
    }
  }

  function startFlowAnimation() {
    const canvas = elements.flowCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function animate() {
      const width = canvas.width / (window.devicePixelRatio || 1);
      const height = canvas.height / (window.devicePixelRatio || 1);

      ctx.clearRect(0, 0, width, height);

      const metrics = getActiveFlowMetrics();

      // 1. Draw connecting pipelines
      drawPipe(ctx, flowNodes.solar, flowNodes.hub, '#f59e0b', metrics.solar > 0);
      drawPipe(ctx, flowNodes.hub, flowNodes.home, '#0ea5e9', metrics.consumption > 0);
      
      // Grid pipe (green if exporting, red if importing)
      const isExporting = metrics.export > 0;
      const isImporting = metrics.import > 0;
      const gridColor = isExporting ? '#10b981' : (isImporting ? '#f43f5e' : '#4b5563');
      drawPipe(ctx, flowNodes.hub, flowNodes.grid, gridColor, isExporting || isImporting);

      // Battery pipe
      const batteryActive = Math.abs(metrics.battery || 0) > 0.1;
      drawPipe(ctx, flowNodes.hub, flowNodes.battery, '#8b5cf6', batteryActive);

      // 2. Draw moving energy particles
      updateAndDrawParticles(ctx, metrics);

      // 3. Draw Nodes with labels & live metric values
      drawNode(ctx, flowNodes.solar, `${metrics.solar.toFixed(1)} kWh`, '#f59e0b');
      drawNode(ctx, flowNodes.hub, 'Active Routing', '#6366f1');
      drawNode(ctx, flowNodes.home, `${metrics.consumption.toFixed(1)} kWh`, '#0ea5e9');

      const gridLabel = isExporting ? `Export: ${metrics.export.toFixed(1)} kWh` : (isImporting ? `Import: ${metrics.import.toFixed(1)} kWh` : 'Standby');
      drawNode(ctx, flowNodes.grid, gridLabel, isExporting ? '#10b981' : (isImporting ? '#f43f5e' : '#9ca3af'));

      const batVal = metrics.battery || 0;
      const batLabel = batVal >= 0 ? `+${batVal.toFixed(1)} kWh (Chg)` : `${batVal.toFixed(1)} kWh (Dis)`;
      drawNode(ctx, flowNodes.battery, batLabel, '#8b5cf6');

      flowAnimationId = requestAnimationFrame(animate);
    }

    if (flowAnimationId) cancelAnimationFrame(flowAnimationId);
    flowAnimationId = requestAnimationFrame(animate);
  }

  function drawPipe(ctx, start, end, color, isActive) {
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    // Draw smooth cubic or quadratic bezier curve
    const midX = (start.x + end.x) / 2;
    ctx.bezierCurveTo(midX, start.y, midX, end.y, end.x, end.y);
    ctx.strokeStyle = isActive ? color : '#374151';
    ctx.lineWidth = isActive ? 3 : 1.5;
    ctx.stroke();

    if (isActive) {
      // Subtle glow
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.bezierCurveTo(midX, start.y, midX, end.y, end.x, end.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = 8;
      ctx.globalAlpha = 0.15;
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }
  }

  function getBezierPoint(start, end, t) {
    const midX = (start.x + end.x) / 2;
    // Cubic bezier formula with P0=(start.x, start.y), P1=(midX, start.y), P2=(midX, end.y), P3=(end.x, end.y)
    const cx = 3 * (midX - start.x);
    const bx = 3 * (midX - midX) - cx;
    const ax = end.x - start.x - cx - bx;

    const cy = 3 * (start.y - start.y);
    const by = 3 * (end.y - start.y) - cy;
    const ay = end.y - start.y - cy - by;

    const xt = ax * (t * t * t) + bx * (t * t) + cx * t + start.x;
    const yt = ay * (t * t * t) + by * (t * t) + cy * t + start.y;
    return { x: xt, y: yt };
  }

  function updateAndDrawParticles(ctx, metrics) {
    // Distribute particle channels
    particles.forEach(p => {
      p.t += p.speed;
      if (p.t > 1) {
        p.t = 0;
        // Reassign path based on energy availability
        const rand = Math.random();
        if (metrics.solar > 0 && rand < 0.4) {
          p.path = 'solar_to_hub';
          p.color = '#f59e0b';
        } else if (metrics.consumption > 0 && rand < 0.7) {
          p.path = 'hub_to_home';
          p.color = '#0ea5e9';
        } else if (metrics.export > 0 && rand < 0.85) {
          p.path = 'hub_to_grid';
          p.color = '#10b981';
        } else if (metrics.import > 0 && rand < 0.95) {
          p.path = 'grid_to_hub';
          p.color = '#f43f5e';
        } else {
          p.path = (metrics.battery || 0) >= 0 ? 'hub_to_battery' : 'battery_to_hub';
          p.color = '#8b5cf6';
        }
      }

      let start = flowNodes.hub;
      let end = flowNodes.home;

      if (p.path === 'solar_to_hub') {
        if (metrics.solar <= 0) return;
        start = flowNodes.solar; end = flowNodes.hub;
      } else if (p.path === 'hub_to_home') {
        if (metrics.consumption <= 0) return;
        start = flowNodes.hub; end = flowNodes.home;
      } else if (p.path === 'hub_to_grid') {
        if (metrics.export <= 0) return;
        start = flowNodes.hub; end = flowNodes.grid;
      } else if (p.path === 'grid_to_hub') {
        if (metrics.import <= 0) return;
        start = flowNodes.grid; end = flowNodes.hub;
      } else if (p.path === 'hub_to_battery') {
        if ((metrics.battery || 0) <= 0) return;
        start = flowNodes.hub; end = flowNodes.battery;
      } else if (p.path === 'battery_to_hub') {
        if ((metrics.battery || 0) >= 0) return;
        start = flowNodes.battery; end = flowNodes.hub;
      }

      const pt = getBezierPoint(start, end, p.t);

      ctx.beginPath();
      ctx.arc(pt.x, pt.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();

      // Outer glow for particle
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, p.radius * 2, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 0.35;
      ctx.fill();
      ctx.globalAlpha = 1.0;
    });
  }

  function drawNode(ctx, node, subText, accentColor) {
    const radius = 28;

    // Node Outer Ring & Background
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#111827';
    ctx.fill();
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Node Icon
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.icon, node.x, node.y);

    // Node Title Text
    ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#f3f4f6';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(node.label, node.x, node.y - radius - 6);

    // Node Value Badge
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = accentColor;
    ctx.textBaseline = 'top';
    ctx.fillText(subText, node.x, node.y + radius + 6);
  }

  // --- Main Interactive Trend Chart (HTML5 Canvas) ---
  let chartHoverIndex = -1;
  let chartBarsMeta = [];

  function renderTrendChart() {
    const canvas = elements.trendCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || canvas.width / dpr;
    const height = rect.height || canvas.height / dpr;

    ctx.clearRect(0, 0, width, height);

    const rangeData = getRangeReadings();
    if (rangeData.length === 0) {
      ctx.fillStyle = '#6b7280';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No readings logged for selected timeframe', width / 2, height / 2);
      return;
    }

    const padding = { top: 25, right: 25, bottom: 45, left: 50 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // Determine scale max
    const maxVal = Math.max(
      ...rangeData.map(d => Math.max(d.solar || 0, d.consumption || 0, d.export || 0, d.import || 0)),
      10
    );
    const roundedMax = Math.ceil(maxVal / 5) * 5;

    // Draw grid horizontal lines
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 1;
    const gridLines = 4;
    ctx.fillStyle = '#9ca3af';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= gridLines; i++) {
      const yVal = (roundedMax / gridLines) * i;
      const yPos = padding.top + chartH - (i / gridLines) * chartH;
      ctx.beginPath();
      ctx.moveTo(padding.left, yPos);
      ctx.lineTo(padding.left + chartW, yPos);
      ctx.stroke();
      ctx.fillText(yVal.toFixed(0) + 'k', padding.left - 8, yPos);
    }

    // Draw bars
    const count = rangeData.length;
    const groupWidth = chartW / count;
    const barWidth = Math.max(3, Math.min(14, (groupWidth - 10) / 4));
    chartBarsMeta = [];

    rangeData.forEach((d, idx) => {
      const groupCenterX = padding.left + (idx + 0.5) * groupWidth;
      const xStart = groupCenterX - (barWidth * 4) / 2;

      const series = [
        { key: 'solar', val: d.solar || 0, color: '#f59e0b' },
        { key: 'consumption', val: d.consumption || 0, color: '#0ea5e9' },
        { key: 'export', val: d.export || 0, color: '#10b981' },
        { key: 'import', val: d.import || 0, color: '#f43f5e' }
      ];

      series.forEach((s, sIdx) => {
        const barH = (s.val / roundedMax) * chartH;
        const bx = xStart + sIdx * barWidth;
        const by = padding.top + chartH - barH;

        ctx.fillStyle = s.color;
        // Rounded top bars
        drawRoundedRect(ctx, bx, by, barWidth - 1.5, barH, 2);
      });

      // Date label on X-axis
      ctx.fillStyle = (idx === chartHoverIndex) ? '#ffffff' : '#9ca3af';
      ctx.font = (idx === chartHoverIndex) ? 'bold 11px sans-serif' : '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      const dateParts = d.date.split('-');
      const shortDate = `${dateParts[1]}/${dateParts[2]}`;
      ctx.fillText(shortDate, groupCenterX, padding.top + chartH + 10);

      chartBarsMeta.push({
        index: idx,
        x: groupCenterX,
        width: groupWidth,
        data: d
      });
    });

    // Draw Hover Highlight Guideline
    if (chartHoverIndex >= 0 && chartHoverIndex < chartBarsMeta.length) {
      const meta = chartBarsMeta[chartHoverIndex];
      ctx.strokeStyle = '#64748b';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(meta.x, padding.top);
      ctx.lineTo(meta.x, padding.top + chartH);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawRoundedRect(ctx, x, y, w, h, r) {
    if (h <= 0) return;
    if (r > w / 2) r = w / 2;
    if (r > h) r = h;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  }

  // --- Trend Chart Hover Interactivity ---
  elements.trendCanvas.addEventListener('mousemove', (e) => {
    const rect = elements.trendCanvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    let foundIdx = -1;
    for (let i = 0; i < chartBarsMeta.length; i++) {
      const b = chartBarsMeta[i];
      if (Math.abs(mouseX - b.x) <= b.width / 2) {
        foundIdx = i;
        break;
      }
    }

    if (foundIdx !== chartHoverIndex) {
      chartHoverIndex = foundIdx;
      renderTrendChart();
    }

    if (chartHoverIndex >= 0 && chartHoverIndex < chartBarsMeta.length) {
      const meta = chartBarsMeta[chartHoverIndex];
      const d = meta.data;

      const directSelfUse = Math.max(0, d.consumption - d.import);
      const autarky = d.consumption > 0 ? Math.min(100, Math.round((directSelfUse / d.consumption) * 100)) : 0;
      const earnings = (d.export * settings.exportRate).toFixed(2);
      const cost = (d.import * settings.importRate).toFixed(2);

      elements.chartTooltip.innerHTML = `
        <div class="tooltip-title">${escapeHtml(d.date)} (${d.weather})</div>
        <div class="tooltip-line"><span style="color:#f59e0b">☀️ Solar Gen:</span> <b>${d.solar.toFixed(1)} kWh</b></div>
        <div class="tooltip-line"><span style="color:#0ea5e9">🏠 Home Usage:</span> <b>${d.consumption.toFixed(1)} kWh</b></div>
        <div class="tooltip-line"><span style="color:#10b981">↗ Grid Export:</span> <b>${d.export.toFixed(1)} kWh (+${settings.currency}${earnings})</b></div>
        <div class="tooltip-line"><span style="color:#f43f5e">↘ Grid Import:</span> <b>${d.import.toFixed(1)} kWh (-${settings.currency}${cost})</b></div>
        <div class="tooltip-line"><span style="color:#8b5cf6">⚡ Self-Sufficiency:</span> <b>${autarky}%</b></div>
      `;

      elements.chartTooltip.style.display = 'block';

      // Keep tooltip inside card bounds
      let tipLeft = mouseX + 15;
      if (tipLeft + 200 > rect.width) tipLeft = mouseX - 210;
      elements.chartTooltip.style.left = `${tipLeft}px`;
      elements.chartTooltip.style.top = `${Math.max(10, mouseY - 40)}px`;
    } else {
      elements.chartTooltip.style.display = 'none';
    }
  });

  elements.trendCanvas.addEventListener('mouseleave', () => {
    chartHoverIndex = -1;
    elements.chartTooltip.style.display = 'none';
    renderTrendChart();
  });

  // --- Donut Chart (Energy Partition & Self-Consumption) ---
  function renderDonutChart() {
    const canvas = elements.donutCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || canvas.width / dpr;
    const height = rect.height || canvas.height / dpr;

    ctx.clearRect(0, 0, width, height);

    const rangeData = getRangeReadings();
    if (rangeData.length === 0) {
      elements.donutBreakdown.innerHTML = '<div class="text-muted" style="text-align:center; font-size:12px;">No data</div>';
      return;
    }

    const totalSolar = rangeData.reduce((acc, r) => acc + (r.solar || 0), 0);
    const totalHome = rangeData.reduce((acc, r) => acc + (r.consumption || 0), 0);
    const totalExport = rangeData.reduce((acc, r) => acc + (r.export || 0), 0);
    const totalImport = rangeData.reduce((acc, r) => acc + (r.import || 0), 0);

    const solarUsedDirectly = Math.max(0, totalSolar - totalExport);
    const autarky = totalHome > 0 ? Math.min(100, Math.round((Math.max(0, totalHome - totalImport) / totalHome) * 100)) : 0;

    const slices = [
      { label: 'Solar Self-Consumed', val: solarUsedDirectly, color: '#f59e0b' },
      { label: 'Solar Exported', val: totalExport, color: '#10b981' },
      { label: 'Grid Imported', val: totalImport, color: '#f43f5e' }
    ].filter(s => s.val > 0);

    const totalDonut = slices.reduce((acc, s) => acc + s.val, 0);

    const centerX = width / 2;
    const centerY = height / 2;
    const outerRadius = Math.min(centerX, centerY) - 15;
    const innerRadius = outerRadius * 0.65;

    let currentAngle = -Math.PI / 2;

    if (totalDonut > 0) {
      slices.forEach(slice => {
        const sliceAngle = (slice.val / totalDonut) * (Math.PI * 2);

        ctx.beginPath();
        ctx.arc(centerX, centerY, outerRadius, currentAngle, currentAngle + sliceAngle);
        ctx.arc(centerX, centerY, innerRadius, currentAngle + sliceAngle, currentAngle, true);
        ctx.closePath();
        ctx.fillStyle = slice.color;
        ctx.fill();

        currentAngle += sliceAngle;
      });
    }

    // Center Text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${autarky}%`, centerX, centerY - 6);

    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#9ca3af';
    ctx.fillText('Autarky', centerX, centerY + 14);

    // Populate breakdown legend
    elements.donutBreakdown.innerHTML = slices.map(s => {
      const pct = totalDonut > 0 ? Math.round((s.val / totalDonut) * 100) : 0;
      return `
        <div class="donut-row">
          <span class="donut-row-label">
            <span class="badge-square" style="background-color: ${s.color};"></span>
            ${escapeHtml(s.label)}
          </span>
          <span class="donut-row-val">${s.val.toFixed(1)} kWh (${pct}%)</span>
        </div>
      `;
    }).join('');
  }

  // --- Render Historical Readings Table ---
  function renderTable() {
    const list = getFilteredReadings();

    if (list.length === 0) {
      elements.readingsTableBody.innerHTML = '';
      elements.tableEmptyState.classList.remove('hidden');
      elements.tableCountLabel.textContent = 'Showing 0 entries';
      return;
    }

    elements.tableEmptyState.classList.add('hidden');
    elements.tableCountLabel.textContent = `Showing ${list.length} of ${readings.length} total entries`;

    elements.readingsTableBody.innerHTML = list.map(item => {
      const weatherIcon = getWeatherIcon(item.weather);
      const directUse = Math.max(0, item.consumption - item.import);
      const selfPct = item.consumption > 0 ? Math.min(100, Math.round((directUse / item.consumption) * 100)) : 0;
      
      const earned = item.export * settings.exportRate;
      const spent = item.import * settings.importRate;
      const netDaily = earned - spent;
      const netSign = netDaily >= 0 ? '+' : '-';
      const netClass = netDaily >= 0 ? 'text-green' : 'text-rose';

      return `
        <tr data-id="${item.id}">
          <td style="font-weight: 600;">${escapeHtml(item.date)}</td>
          <td><span class="badge-weather">${weatherIcon} ${escapeHtml(item.weather)}</span></td>
          <td style="color:#f59e0b; font-weight:600;">${item.solar.toFixed(2)}</td>
          <td style="color:#0ea5e9; font-weight:600;">${item.consumption.toFixed(2)}</td>
          <td style="color:#10b981;">${item.export.toFixed(2)}</td>
          <td style="color:#f43f5e;">${item.import.toFixed(2)}</td>
          <td><b>${selfPct}%</b></td>
          <td class="${netClass}"><b>${netSign}${settings.currency}${Math.abs(netDaily).toFixed(2)}</b></td>
          <td style="color:#9ca3af; font-size:12px; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${escapeHtml(item.notes || '-')}
          </td>
          <td class="text-right">
            <button class="btn-icon edit-entry-btn" title="Edit Entry" data-id="${item.id}">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </button>
            <button class="btn-icon delete-btn delete-entry-btn" title="Delete Entry" data-id="${item.id}">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function getWeatherIcon(weather) {
    switch (weather) {
      case 'sunny': return '☀️';
      case 'partly-cloudy': return '⛅';
      case 'cloudy': return '☁️';
      case 'rainy': return '🌧️';
      default: return '☀️';
    }
  }

  // --- Modal: Open / Close / Save ---
  function openReadingModal(entry = null) {
    if (entry) {
      elements.modalHeading.textContent = 'Edit Electricity Reading';
      elements.entryId.value = entry.id;
      elements.inputDate.value = entry.date;
      elements.inputWeather.value = entry.weather || 'sunny';
      elements.inputSolar.value = entry.solar;
      elements.inputConsumption.value = entry.consumption;
      elements.inputExport.value = entry.export;
      elements.inputImport.value = entry.import;
      elements.inputBattery.value = entry.battery || 0;
      elements.inputNotes.value = entry.notes || '';
    } else {
      elements.modalHeading.textContent = 'Log Electricity Reading';
      elements.readingForm.reset();
      elements.entryId.value = '';
      elements.inputDate.value = new Date().toISOString().split('T')[0];
      elements.inputExport.value = '0';
      elements.inputImport.value = '0';
      elements.inputBattery.value = '0';
    }
    updateFormPreview();
    elements.readingModal.classList.remove('hidden');
    elements.inputSolar.focus();
  }

  function closeReadingModal() {
    elements.readingModal.classList.add('hidden');
  }

  function updateFormPreview() {
    const solar = parseFloat(elements.inputSolar.value) || 0;
    const cons = parseFloat(elements.inputConsumption.value) || 0;
    const exp = parseFloat(elements.inputExport.value) || 0;
    const imp = parseFloat(elements.inputImport.value) || 0;

    const directSelfUse = Math.max(0, cons - imp);
    const selfPct = cons > 0 ? Math.min(100, Math.round((directSelfUse / cons) * 100)) : 0;
    const dayEarnings = exp * settings.exportRate;
    const dayCost = imp * settings.importRate;
    const dayNet = dayEarnings - dayCost;

    elements.previewSelfUse.textContent = `${directSelfUse.toFixed(1)} kWh (${selfPct}%)`;
    elements.previewSavings.textContent = `${dayNet >= 0 ? '+' : ''}${settings.currency}${dayNet.toFixed(2)}`;
    elements.previewSavings.className = `preview-val ${dayNet >= 0 ? 'text-green' : 'text-rose'}`;
  }

  function handleSaveReading(e) {
    e.preventDefault();

    const id = elements.entryId.value;
    const date = elements.inputDate.value;
    const weather = elements.inputWeather.value;
    const solar = parseFloat(elements.inputSolar.value) || 0;
    const consumption = parseFloat(elements.inputConsumption.value) || 0;
    const exp = parseFloat(elements.inputExport.value) || 0;
    const imp = parseFloat(elements.inputImport.value) || 0;
    const battery = parseFloat(elements.inputBattery.value) || 0;
    const notes = elements.inputNotes.value.trim();

    if (!date) {
      showToast('Please select a valid date', 'error');
      return;
    }

    if (id) {
      // Edit existing
      const idx = readings.findIndex(r => r.id === id);
      if (idx !== -1) {
        readings[idx] = { ...readings[idx], date, weather, solar, consumption, export: exp, import: imp, battery, notes };
        showToast('Reading updated successfully');
      }
    } else {
      // Check if entry for date already exists
      const existing = readings.find(r => r.date === date);
      if (existing) {
        if (!confirm(`An entry for ${date} already exists. Do you want to overwrite it?`)) {
          return;
        }
        existing.weather = weather;
        existing.solar = solar;
        existing.consumption = consumption;
        existing.export = exp;
        existing.import = imp;
        existing.battery = battery;
        existing.notes = notes;
        showToast(`Reading for ${date} overwritten`);
      } else {
        readings.push({
          id: 'entry_' + Date.now(),
          date,
          weather,
          solar,
          consumption,
          export: exp,
          import: imp,
          battery,
          notes
        });
        showToast('New electricity reading logged');
      }
    }

    saveReadings();
    closeReadingModal();
    updateUI();
  }

  // --- Settings Modal Handlers ---
  function openSettingsModal() {
    elements.settingCurrency.value = settings.currency;
    elements.settingImportRate.value = settings.importRate;
    elements.settingExportRate.value = settings.exportRate;
    elements.settingCo2Factor.value = settings.co2Factor;
    elements.settingSystemSize.value = settings.systemSize;
    elements.settingBatteryCap.value = settings.batteryCap;
    elements.settingsModal.classList.remove('hidden');
  }

  function closeSettingsModal() {
    elements.settingsModal.classList.add('hidden');
  }

  function handleSaveSettings(e) {
    e.preventDefault();
    settings.currency = elements.settingCurrency.value.trim() || '$';
    settings.importRate = parseFloat(elements.settingImportRate.value) || 0.28;
    settings.exportRate = parseFloat(elements.settingExportRate.value) || 0.08;
    settings.co2Factor = parseFloat(elements.settingCo2Factor.value) || 0.45;
    settings.systemSize = parseFloat(elements.settingSystemSize.value) || 6.5;
    settings.batteryCap = parseFloat(elements.settingBatteryCap.value) || 10.0;

    saveSettings();
    closeSettingsModal();
    updateUI();
    showToast('Tariffs & specs saved successfully');
  }

  // --- Import / Export Handlers ---
  function exportCSV() {
    if (readings.length === 0) {
      showToast('No readings to export', 'warning');
      return;
    }

    const headers = ['Date', 'Weather', 'Solar_kWh', 'Consumption_kWh', 'GridExport_kWh', 'GridImport_kWh', 'Battery_kWh', 'Notes'];
    const rows = readings.map(r => [
      r.date,
      r.weather,
      r.solar,
      r.consumption,
      r.export,
      r.import,
      r.battery || 0,
      `"${(r.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `helios_solar_readings_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast('Exported CSV successfully');
  }

  function exportJSON() {
    if (readings.length === 0) {
      showToast('No readings to export', 'warning');
      return;
    }

    const dataObj = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings,
      readings
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(dataObj, null, 2));
    const link = document.createElement('a');
    link.setAttribute('href', dataStr);
    link.setAttribute('download', `helios_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast('Exported JSON backup successfully');
  }

  function handleImportJSON(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (parsed.readings && Array.isArray(parsed.readings)) {
          readings = parsed.readings;
          if (parsed.settings) settings = { ...defaultSettings, ...parsed.settings };
          saveSettings();
          saveReadings();
          updateUI();
          showToast(`Imported ${readings.length} records successfully`);
        } else if (Array.isArray(parsed)) {
          readings = parsed;
          saveReadings();
          updateUI();
          showToast(`Imported ${readings.length} records successfully`);
        } else {
          showToast('Invalid JSON file format', 'error');
        }
      } catch (err) {
        showToast('Error reading JSON file', 'error');
      }
      elements.fileImportJson.value = '';
    };
    reader.readAsText(file);
  }

  function clearAllData() {
    if (confirm('Are you sure you want to delete ALL energy logs? This cannot be undone.')) {
      readings = [];
      saveReadings();
      updateUI();
      showToast('All records cleared', 'warning');
    }
  }

  // --- Event Listeners Setup ---
  function setupEventListeners() {
    // Header actions
    elements.btnDemoData.addEventListener('click', () => loadDemoData(true));
    elements.btnEmptyLoadDemo.addEventListener('click', () => loadDemoData(true));
    elements.btnOpenLogModal.addEventListener('click', () => openReadingModal());
    elements.btnOpenSettings.addEventListener('click', openSettingsModal);

    // Reading Form & Modal
    elements.btnModalClose.addEventListener('click', closeReadingModal);
    elements.btnModalCancel.addEventListener('click', closeReadingModal);
    elements.readingForm.addEventListener('submit', handleSaveReading);

    // Live preview update in modal
    ['input-solar', 'input-consumption', 'input-export', 'input-import'].forEach(id => {
      document.getElementById(id).addEventListener('input', updateFormPreview);
    });

    // Settings Form & Modal
    elements.btnSettingsClose.addEventListener('click', closeSettingsModal);
    elements.btnSettingsCancel.addEventListener('click', closeSettingsModal);
    elements.settingsForm.addEventListener('submit', handleSaveSettings);

    // Flow View Select
    elements.flowViewSelect.addEventListener('change', (e) => {
      flowViewMode = e.target.value;
    });

    // Range Filter Buttons
    elements.timeFilterGroup.addEventListener('click', (e) => {
      if (e.target.classList.contains('toggle-btn')) {
        document.querySelectorAll('#time-filter-group .toggle-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        activeTimeRange = e.target.getAttribute('data-range');
        updateUI();
      }
    });

    // Table search
    elements.tableSearch.addEventListener('input', renderTable);

    // Table sorting
    elements.tableHeaders.forEach(th => {
      th.addEventListener('click', () => {
        const field = th.getAttribute('data-sort');
        if (currentSort.field === field) {
          currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
        } else {
          currentSort.field = field;
          currentSort.order = 'desc';
        }
        renderTable();
      });
    });

    // Table row actions (Event delegation)
    elements.readingsTableBody.addEventListener('click', (e) => {
      const editBtn = e.target.closest('.edit-entry-btn');
      if (editBtn) {
        const id = editBtn.getAttribute('data-id');
        const entry = readings.find(r => r.id === id);
        if (entry) openReadingModal(entry);
        return;
      }

      const delBtn = e.target.closest('.delete-entry-btn');
      if (delBtn) {
        const id = delBtn.getAttribute('data-id');
        if (confirm('Delete this reading entry?')) {
          readings = readings.filter(r => r.id !== id);
          saveReadings();
          updateUI();
          showToast('Entry deleted');
        }
      }
    });

    // Import / Export
    elements.btnExportCsv.addEventListener('click', exportCSV);
    elements.btnExportJson.addEventListener('click', exportJSON);
    elements.fileImportJson.addEventListener('change', handleImportJSON);
    elements.btnClearAll.addEventListener('click', clearAllData);

    // Window resize
    window.addEventListener('resize', () => {
      setupCanvasDPI();
      renderTrendChart();
      renderDonutChart();
    });

    // Close modal on backdrop click
    elements.readingModal.addEventListener('click', (e) => {
      if (e.target === elements.readingModal) closeReadingModal();
    });
    elements.settingsModal.addEventListener('click', (e) => {
      if (e.target === elements.settingsModal) closeSettingsModal();
    });
  }

  // --- Utility: Escape HTML ---
  function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
  }

  // Boot on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

