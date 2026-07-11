// trade-log-table.js — colored trade log table
const TradeLogTable = {
  _sortCol: null,
  _sortDir: 1,

  render(trades) {
    if (!trades || trades.length === 0) {
      return `<div style="text-align:center;padding:32px;color:var(--text-muted);">No trades recorded</div>`;
    }

    const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
    const avgReturn = trades.reduce((s, t) => s + t.return_pct, 0) / trades.length;

    return `
      <div style="overflow:auto;border-radius:8px;border:1px solid var(--border);">
        <table class="data-table">
          <thead>
            <tr style="background:rgba(255,255,255,.02);">
              <th>#</th>
              <th>Entry Date</th>
              <th>Exit Date</th>
              <th>Entry Price</th>
              <th>Exit Price</th>
              <th>Return %</th>
              <th>P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            ${trades.map((t, i) => {
              const win = t.return_pct > 0;
              const ret = `${t.return_pct >= 0 ? '+' : ''}${t.return_pct.toFixed(2)}%`;
              const pnl = `${t.pnl >= 0 ? '+' : ''}$${Math.abs(t.pnl).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
              return `
              <tr class="${win ? 'win' : 'loss'}">
                <td style="color:var(--text-muted);font-size:11px;">${i + 1}</td>
                <td>${t.entry_date}</td>
                <td>${t.exit_date}</td>
                <td>$${t.entry_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                <td>$${t.exit_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                <td style="color:${win ? '#10b981' : '#ef4444'};font-weight:600;">${ret}</td>
                <td style="color:${t.pnl >= 0 ? '#10b981' : '#ef4444'};font-weight:600;">${pnl}</td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot>
            <tr style="background:rgba(255,255,255,.03);border-top:2px solid var(--border);">
              <td colspan="5" style="font-weight:600;color:var(--text-muted);">Total (${trades.length} trades)</td>
              <td style="font-weight:700;color:${avgReturn >= 0 ? '#10b981' : '#ef4444'};">${avgReturn >= 0 ? '+' : ''}${avgReturn.toFixed(2)}% avg</td>
              <td style="font-weight:700;color:${totalPnl >= 0 ? '#10b981' : '#ef4444'};">${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }
};
