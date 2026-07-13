// lab-compare-chart.js — overlays multiple variants'/symbols' equity curves on one
// zoomable chart so the user can visually compare which combination outperformed.
const LabCompareChart = {
  _instance: null,
  _colors: ['#6366f1', '#f59e0b', '#10b981', '#ec4899', '#06b6d4', '#a855f7', '#f97316', '#84cc16'],

  _ensureZoomPlugin() {
    if (window.__labZoomPluginRegistered) return;
    if (window.Chart && window.ChartZoom) {
      Chart.register(window.ChartZoom);
      window.__labZoomPluginRegistered = true;
    }
  },

  /** series: [{ label, equityCurve: [{date, equity}] }, ...] */
  render(containerId, series) {
    const canvas = document.getElementById(containerId);
    if (!canvas || !series || !series.length) return;

    this._ensureZoomPlugin();
    if (this._instance) { this._instance.destroy(); this._instance = null; }

    const allDates = new Set();
    series.forEach(s => (s.equityCurve || []).forEach(p => allDates.add(p.date)));
    const labels = Array.from(allDates).sort();

    const datasets = series.map((s, i) => {
      const map = new Map((s.equityCurve || []).map(p => [p.date, p.equity]));
      return {
        label: s.label,
        data: labels.map(d => (map.has(d) ? map.get(d) : null)),
        borderColor: this._colors[i % this._colors.length],
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        spanGaps: true,
        tension: 0.2,
        fill: false,
      };
    });

    const ctx = canvas.getContext('2d');
    this._instance = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true, position: 'top',
            labels: { color: '#94a3b8', boxWidth: 12, font: { size: 11 } },
          },
          tooltip: {
            backgroundColor: '#12121a',
            borderColor: '#1e1e2e',
            borderWidth: 1,
            titleColor: '#94a3b8',
            bodyColor: '#e2e8f0',
            callbacks: {
              label: (ctx) => ctx.parsed.y === null ? '' : ` ${ctx.dataset.label}: $${ctx.parsed.y.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
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
            ticks: { color: '#64748b', font: { size: 11 }, callback: (v) => '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 }) },
          },
        },
      },
    });
  },

  resetZoom() {
    if (this._instance) this._instance.resetZoom();
  },

  destroy() {
    if (this._instance) { this._instance.destroy(); this._instance = null; }
  }
};
