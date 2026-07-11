// metrics-cards.js — 6 metric cards for backtest results
const MetricsCards = {
  render(result) {
    const metrics = [
      {
        label: 'Total Return',
        value: `${result.total_return_pct >= 0 ? '+' : ''}${result.total_return_pct.toFixed(2)}%`,
        color: result.total_return_pct >= 0 ? '#10b981' : '#ef4444',
        icon: result.total_return_pct >= 0
          ? '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>'
          : '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>',
      },
      {
        label: 'Win Rate',
        value: `${result.win_rate.toFixed(1)}%`,
        color: result.win_rate >= 50 ? '#10b981' : '#ef4444',
        icon: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
      },
      {
        label: 'Max Drawdown',
        value: `${result.max_drawdown_pct.toFixed(2)}%`,
        color: '#ef4444',
        icon: '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>',
      },
      {
        label: 'Sharpe Ratio',
        value: result.sharpe_ratio.toFixed(3),
        color: result.sharpe_ratio >= 1 ? '#10b981' : result.sharpe_ratio >= 0 ? '#f59e0b' : '#ef4444',
        icon: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
      },
      {
        label: 'Total Trades',
        value: result.total_trades.toString(),
        color: '#818cf8',
        icon: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
      },
      {
        label: 'Profit Factor',
        value: result.profit_factor >= 999 ? '∞' : result.profit_factor.toFixed(3),
        color: result.profit_factor >= 1.5 ? '#10b981' : result.profit_factor >= 1 ? '#f59e0b' : '#ef4444',
        icon: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
      },
    ];

    return `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
        ${metrics.map(m => `
          <div class="metric-card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
              <span style="font-size:12px;color:var(--text-muted);font-weight:500;">${m.label}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${m.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:.8;flex-shrink:0;">${m.icon}</svg>
            </div>
            <div style="font-size:26px;font-weight:700;color:${m.color};letter-spacing:-0.5px;">${m.value}</div>
          </div>
        `).join('')}
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:12px;">
        <div class="metric-card" style="padding:14px 20px;">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Win / Loss</div>
          <div style="font-size:15px;font-weight:600;">
            <span style="color:#10b981;">${result.winning_trades}W</span>
            <span style="color:var(--text-muted);margin:0 4px;">/</span>
            <span style="color:#ef4444;">${result.losing_trades}L</span>
          </div>
        </div>
        <div class="metric-card" style="padding:14px 20px;">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Best Trade</div>
          <div style="font-size:15px;font-weight:600;color:#10b981;">+${result.best_trade_pct.toFixed(2)}%</div>
        </div>
        <div class="metric-card" style="padding:14px 20px;">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Worst Trade</div>
          <div style="font-size:15px;font-weight:600;color:#ef4444;">${result.worst_trade_pct.toFixed(2)}%</div>
        </div>
      </div>
    `;
  }
};
