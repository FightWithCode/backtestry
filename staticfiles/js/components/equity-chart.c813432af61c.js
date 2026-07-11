// equity-chart.js — Chart.js equity curve
const EquityChart = {
  _instance: null,

  render(containerId, equityCurve, initialCapital) {
    const labels = equityCurve.map(p => p.date);
    const values = equityCurve.map(p => p.equity);

    const canvas = document.getElementById(containerId);
    if (!canvas) return;

    if (this._instance) { this._instance.destroy(); this._instance = null; }

    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.offsetHeight || 300);
    grad.addColorStop(0, 'rgba(99,102,241,0.35)');
    grad.addColorStop(1, 'rgba(99,102,241,0.02)');

    this._instance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Equity',
            data: values,
            borderColor: '#6366f1',
            backgroundColor: grad,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: true,
            tension: 0.3,
          },
          {
            label: 'Initial Capital',
            data: Array(labels.length).fill(initialCapital),
            borderColor: 'rgba(100,116,139,.35)',
            borderWidth: 1,
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#12121a',
            borderColor: '#1e1e2e',
            borderWidth: 1,
            titleColor: '#94a3b8',
            bodyColor: '#e2e8f0',
            callbacks: {
              label: (ctx) => ` $${ctx.parsed.y.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: 'rgba(30,30,46,.5)' },
            ticks: { color: '#64748b', maxTicksLimit: 8, font: { size: 11 } },
          },
          y: {
            grid: { color: 'rgba(30,30,46,.5)' },
            ticks: {
              color: '#64748b', font: { size: 11 },
              callback: (v) => '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 }),
            },
          },
        },
      },
    });
  },

  destroy() {
    if (this._instance) { this._instance.destroy(); this._instance = null; }
  }
};
