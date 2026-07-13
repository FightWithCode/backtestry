// lab-price-chart.js — Lab module's own price chart (price + indicator overlays + trade
// markers + scroll/pinch zoom + drag pan). A standalone sibling of price-chart.js so the
// existing backtest results page is never touched by the lab module.
const LabPriceChart = {
  _instance: null,
  _oscillatorDatasetIndex: {},
  _overlayColors: ['#f59e0b', '#06b6d4', '#a855f7', '#84cc16', '#ec4899'],

  controlsHtml(chartData) {
    const oscillators = Object.entries((chartData && chartData.indicators) || {})
      .filter(([, d]) => d.scale === 'oscillator');
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:8px;">
        <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--text-muted);">
          ${oscillators.map(([id]) => `
            <label style="display:flex;align-items:center;gap:5px;cursor:pointer;user-select:none;">
              <input type="checkbox" data-osc-toggle="${id}" onchange="LabPriceChart._toggleOscillator('${id}', this.checked)" />
              ${id}
            </label>
          `).join('')}
        </div>
        <button class="btn-secondary" style="padding:4px 10px;font-size:11px;" onclick="LabPriceChart.resetZoom()">Reset Zoom</button>
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">Scroll or pinch to zoom, drag to pan.</div>
    `;
  },

  _ensureZoomPlugin() {
    if (window.__labZoomPluginRegistered) return;
    if (window.Chart && window.ChartZoom) {
      Chart.register(window.ChartZoom);
      window.__labZoomPluginRegistered = true;
    }
  },

  render(containerId, chartData, tradeLog) {
    const canvas = document.getElementById(containerId);
    if (!canvas || !chartData || !chartData.price || !chartData.price.length) return;

    this._ensureZoomPlugin();
    if (this._instance) { this._instance.destroy(); this._instance = null; }
    this._oscillatorDatasetIndex = {};

    const price = chartData.price;
    const labels = price.map(p => p.date);
    const dateIndex = new Map(labels.map((d, i) => [d, i]));
    const hasOscillators = Object.values(chartData.indicators || {}).some(d => d.scale === 'oscillator');

    const datasets = [{
      label: 'Close',
      data: price.map(p => p.close),
      borderColor: '#6366f1',
      borderWidth: 1.75,
      pointRadius: 0,
      pointHoverRadius: 3,
      tension: 0.15,
      fill: false,
    }];

    let colorIdx = 0;
    for (const [id, ind] of Object.entries(chartData.indicators || {})) {
      if (ind.scale !== 'overlay') continue;
      datasets.push({
        label: id,
        data: ind.values,
        borderColor: this._overlayColors[colorIdx % this._overlayColors.length],
        borderWidth: 1.25,
        pointRadius: 0,
        tension: 0.15,
        fill: false,
      });
      colorIdx++;
    }

    for (const [id, ind] of Object.entries(chartData.indicators || {})) {
      if (ind.scale !== 'oscillator') continue;
      this._oscillatorDatasetIndex[id] = datasets.length;
      datasets.push({
        label: id,
        data: ind.values,
        borderColor: this._overlayColors[colorIdx % this._overlayColors.length],
        borderWidth: 1.25,
        pointRadius: 0,
        tension: 0.15,
        fill: false,
        yAxisID: 'y2',
        hidden: true,
      });
      colorIdx++;
    }

    const longEntry = Array(labels.length).fill(null);
    const shortEntry = Array(labels.length).fill(null);
    const winExit = Array(labels.length).fill(null);
    const lossExit = Array(labels.length).fill(null);
    const meta = {};

    (tradeLog || []).forEach(t => {
      const isLong = (t.type || 'LONG').toUpperCase() === 'LONG';
      const entryIdx = dateIndex.get(t.entry_date);
      if (entryIdx !== undefined) {
        (isLong ? longEntry : shortEntry)[entryIdx] = t.entry_price;
        meta[`${isLong ? 'long' : 'short'}:${entryIdx}`] = t;
      }
      const exitIdx = dateIndex.get(t.exit_date);
      if (exitIdx !== undefined) {
        (t.pnl >= 0 ? winExit : lossExit)[exitIdx] = t.exit_price;
        meta[`${t.pnl >= 0 ? 'win' : 'loss'}:${exitIdx}`] = t;
      }
    });

    const markerDataset = (key, label, data, color, pointStyle) => ({
      label, data, showLine: false,
      borderColor: color, backgroundColor: color,
      pointStyle, pointRadius: 6, pointHoverRadius: 8,
      _markerKey: key,
    });
    datasets.push(markerDataset('long', 'Long Entry', longEntry, '#818cf8', 'triangle'));
    datasets.push(markerDataset('short', 'Short Entry', shortEntry, '#f97316', 'rectRot'));
    datasets.push(markerDataset('win', 'Win Exit', winExit, '#10b981', 'circle'));
    datasets.push(markerDataset('loss', 'Loss Exit', lossExit, '#ef4444', 'circle'));

    const ctx = canvas.getContext('2d');
    this._instance = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'nearest', intersect: true },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#12121a',
            borderColor: '#1e1e2e',
            borderWidth: 1,
            titleColor: '#94a3b8',
            bodyColor: '#e2e8f0',
            callbacks: {
              label: (ctx) => {
                const key = ctx.dataset._markerKey;
                if (key) {
                  const t = meta[`${key}:${ctx.dataIndex}`];
                  if (!t) return '';
                  if (key === 'long' || key === 'short') {
                    return ` ${key === 'long' ? 'Long' : 'Short'} entry @ $${t.entry_price}`;
                  }
                  return ` Exit (${t.exit_reason || ''}) @ $${t.exit_price}  ${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(2)} (${t.return_pct >= 0 ? '+' : ''}${t.return_pct.toFixed(2)}%)`;
                }
                if (ctx.parsed.y === null) return '';
                return ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(4)}`;
              },
            },
          },
          zoom: {
            pan: { enabled: true, mode: 'x', modifierKey: null },
            zoom: {
              wheel: { enabled: true },
              pinch: { enabled: true },
              drag: { enabled: false },
              mode: 'x',
            },
            limits: { x: { minRange: 5 } },
          },
        },
        scales: {
          x: {
            grid: { color: 'rgba(30,30,46,.5)' },
            ticks: { color: '#64748b', maxTicksLimit: 8, font: { size: 11 } },
          },
          y: {
            grid: { color: 'rgba(30,30,46,.5)' },
            ticks: { color: '#64748b', font: { size: 11 }, callback: (v) => '$' + v.toLocaleString('en-US', { maximumFractionDigits: 2 }) },
          },
          ...(hasOscillators ? {
            y2: {
              position: 'right',
              grid: { drawOnChartArea: false },
              ticks: { color: '#64748b', font: { size: 11 } },
            },
          } : {}),
        },
      },
    });
  },

  _toggleOscillator(id, visible) {
    if (!this._instance) return;
    const idx = this._oscillatorDatasetIndex[id];
    if (idx === undefined) return;
    this._instance.setDatasetVisibility(idx, visible);
    this._instance.update();
  },

  resetZoom() {
    if (this._instance) this._instance.resetZoom();
  },

  destroy() {
    if (this._instance) { this._instance.destroy(); this._instance = null; }
  }
};
