// drawdown-chart.js — Chart.js drawdown chart
const DrawdownChart = {
  _instance: null,

  render(containerId, drawdownSeries) {
    const labels = drawdownSeries.map(p => p.date);
    const values = drawdownSeries.map(p => p.drawdown);

    const canvas = document.getElementById(containerId);
    if (!canvas) return;

    if (this._instance) { this._instance.destroy(); this._instance = null; }

    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.offsetHeight || 200);
    grad.addColorStop(0, 'rgba(239,68,68,0.4)');
    grad.addColorStop(1, 'rgba(239,68,68,0.02)');

    this._instance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Drawdown %',
          data: values,
          borderColor: '#ef4444',
          backgroundColor: grad,
          borderWidth: 1.5,
          pointRadius: 0,
          fill: true,
          tension: 0.2,
        }],
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
            callbacks: { label: (ctx) => ` ${ctx.parsed.y.toFixed(2)}%` },
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
              callback: (v) => v.toFixed(1) + '%',
            },
            max: 0,
          },
        },
      },
    });
  },

  destroy() {
    if (this._instance) { this._instance.destroy(); this._instance = null; }
  }
};
