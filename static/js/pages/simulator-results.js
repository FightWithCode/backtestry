// simulator-results.js — full walk-forward simulation results: institutional
// metrics, equity/drawdown curves, and a cross-symbol trade log with a
// per-trade "why did this fire" breakdown.
const SimulatorResultsPage = {
  _run: null,
  _pollInterval: null,
  _detailOverlay: null,

  async render(container, params) {
    const id = params.id;
    this._cleanup();

    container.innerHTML = `
      <div class="page-enter">
        <div style="margin-bottom:20px;font-size:13px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">
          <a data-link href="/simulator" style="color:var(--text-muted);text-decoration:none;">Simulator</a>
          <span>›</span>
          <span>Simulation Results</span>
        </div>
        <div id="sim-content">
          <div class="skeleton" style="height:64px;margin-bottom:16px;"></div>
          <div class="skeleton" style="height:400px;"></div>
        </div>
      </div>
    `;

    try {
      this._run = await API.getSimulatorRun(id);
      if (['queued', 'running'].includes(this._run.status)) {
        this._renderRunning();
        this._startPoll(id);
      } else {
        this._renderResults();
      }
    } catch (e) {
      Toast.error('Failed to load simulation: ' + e.message);
    }
  },

  _renderRunning() {
    const run = this._run;
    document.getElementById('sim-content').innerHTML = `
      <div style="margin-bottom:20px;">
        <h1 style="font-size:20px;font-weight:700;margin-bottom:6px;">Simulation Running</h1>
        <div style="font-size:13px;color:var(--text-muted);">${run.strategy_name} · ${run.symbol_count} symbols · ${run.start_date} → ${run.end_date}</div>
      </div>
      <div class="card" style="padding:28px;max-width:600px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
          <span class="spinner spinner-lg"></span>
          <div>
            <div style="font-weight:600;margin-bottom:2px;">Walking forward across ${run.symbol_count} symbols...</div>
            <div style="font-size:13px;color:var(--text-muted);">Status: <span class="badge badge-${run.status}">${run.status}</span></div>
          </div>
        </div>
        <div class="progress-bar-wrap"><div class="progress-bar-indeterminate"></div></div>
      </div>
    `;
  },

  _startPoll(id) {
    this._pollInterval = setInterval(async () => {
      try {
        const s = await API.getSimulatorRunStatus(id);
        if (s.status === 'completed') {
          this._cleanup_poll();
          this._run = await API.getSimulatorRun(id);
          this._renderResults();
        } else if (s.status === 'failed') {
          this._cleanup_poll();
          this._run = await API.getSimulatorRun(id);
          this._renderFailed(s.error);
        }
      } catch (e) {}
    }, 3000);
  },

  _cleanup_poll() {
    if (this._pollInterval) { clearInterval(this._pollInterval); this._pollInterval = null; }
  },

  _renderFailed(error) {
    document.getElementById('sim-content').innerHTML = `
      <div style="margin-bottom:20px;"><h1 style="font-size:20px;font-weight:700;color:#ef4444;">Simulation Failed</h1></div>
      <div class="card" style="padding:24px;border-color:rgba(239,68,68,.3);background:rgba(239,68,68,.05);">
        <p style="font-size:14px;color:#f87171;margin-bottom:16px;">${error || 'An unknown error occurred while simulating.'}</p>
        <button class="btn-secondary" onclick="history.back()">← Go Back</button>
      </div>
    `;
  },

  _renderResults() {
    const run = this._run;
    const el = document.getElementById('sim-content');
    const gained = run.final_capital >= run.initial_capital;

    el.innerHTML = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:20px;">
        <div>
          <h1 style="font-size:20px;font-weight:700;margin-bottom:6px;">${run.strategy_name} — Simulation</h1>
          <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;font-size:13px;color:var(--text-muted);">
            <span>${run.universe_name || `${run.symbol_count} custom symbols`}</span>
            <span style="color:var(--border);">·</span>
            <span>${run.start_date} → ${run.end_date}</span>
            <span style="color:var(--border);">·</span>
            <span>risk ${run.risk_pct}%/trade</span>
            <span class="badge badge-completed">Completed</span>
          </div>
        </div>
        <button onclick="SimulatorResultsPage._confirmDelete()" class="btn-secondary" style="padding:5px 10px;color:#ef4444;border-color:rgba(239,68,68,.25);flex-shrink:0;" title="Delete simulation">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">
        <div class="metric-card" style="padding:14px 20px;">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Initial Capital</div>
          <div style="font-size:20px;font-weight:700;">$${run.initial_capital.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
        </div>
        <div class="metric-card" style="padding:14px 20px;">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Final Capital</div>
          <div style="font-size:20px;font-weight:700;color:${gained ? '#10b981' : '#ef4444'};">$${run.final_capital.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
        </div>
        <div class="metric-card" style="padding:14px 20px;">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Symbols Fetched / Traded</div>
          <div style="font-size:20px;font-weight:700;">${run.symbols_fetched} / ${(run.symbols_traded || []).length}</div>
        </div>
        <div class="metric-card" style="padding:14px 20px;">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Failed Fetches</div>
          <div style="font-size:20px;font-weight:700;color:${(run.symbols_failed || []).length ? '#f59e0b' : 'var(--text-muted)'};">${(run.symbols_failed || []).length}</div>
        </div>
      </div>

      <div style="margin-bottom:24px;">${MetricsCards.render(run)}</div>

      <div class="card" style="padding:20px;margin-bottom:16px;">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:16px;">Institutional Metrics</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;">
          ${[
            ['CAGR', `${run.annualized_return_pct >= 0 ? '+' : ''}${run.annualized_return_pct.toFixed(2)}%`],
            ['Sortino Ratio', run.sortino_ratio.toFixed(3)],
            ['Calmar Ratio', run.calmar_ratio.toFixed(3)],
            ['Risk/Reward', run.risk_reward_ratio.toFixed(3)],
            ['Avg Win', `+${run.avg_win_pct.toFixed(2)}%`],
            ['Avg Loss', `${run.avg_loss_pct.toFixed(2)}%`],
            ['Avg Trade Return', `${run.avg_trade_return_pct >= 0 ? '+' : ''}${run.avg_trade_return_pct.toFixed(2)}%`],
            ['Avg Trade Duration', `${run.avg_trade_duration_days.toFixed(1)}d`],
          ].map(([label, value]) => `
            <div style="padding:10px 14px;background:rgba(255,255,255,.02);border-radius:8px;">
              <div style="font-size:10px;color:var(--text-muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:.3px;">${label}</div>
              <div style="font-size:15px;font-weight:600;">${value}</div>
            </div>
          `).join('')}
        </div>
      </div>

      ${(run.symbols_failed || []).length ? `
      <details style="margin-bottom:20px;">
        <summary style="cursor:pointer;font-size:12px;color:var(--text-muted);">Show ${run.symbols_failed.length} failed fetch(es)</summary>
        <div style="font-size:12px;color:var(--text-muted);margin-top:8px;padding:10px 14px;background:rgba(255,255,255,.02);border-radius:8px;">${run.symbols_failed.join(', ')}</div>
      </details>` : ''}

      <div class="card" style="padding:20px;margin-bottom:16px;">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:16px;">Equity Curve</h3>
        <div class="chart-container" style="height:280px;"><canvas id="sim-equity-canvas"></canvas></div>
      </div>

      <div class="card" style="padding:20px;margin-bottom:16px;">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:16px;">Drawdown</h3>
        <div class="chart-container" style="height:180px;"><canvas id="sim-drawdown-canvas"></canvas></div>
      </div>

      <div class="card" style="padding:20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h3 style="font-size:14px;font-weight:600;">Trade Log (${(run.trade_log || []).length} trades)</h3>
          ${(run.trade_log || []).length ? `
          <button class="btn-secondary" style="padding:6px 12px;font-size:12px;gap:6px;" onclick="SimulatorResultsPage._downloadCsv()">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download CSV
          </button>` : ''}
        </div>
        <div id="sim-trade-table"></div>
      </div>
    `;

    requestAnimationFrame(() => {
      if (run.equity_curve?.length) EquityChart.render('sim-equity-canvas', run.equity_curve, run.initial_capital);
      if (run.drawdown_series?.length) DrawdownChart.render('sim-drawdown-canvas', run.drawdown_series);
    });

    this._renderTradeTable();
  },

  _renderTradeTable() {
    const el = document.getElementById('sim-trade-table');
    if (!el) return;
    const trades = this._run.trade_log || [];

    if (!trades.length) {
      el.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-muted);">No trades fired during this period</div>`;
      return;
    }

    el.innerHTML = `
      <div style="overflow:auto;border-radius:8px;border:1px solid var(--border);">
        <table class="data-table">
          <thead>
            <tr style="background:rgba(255,255,255,.02);">
              <th>#</th><th>Symbol</th><th>Type</th><th>Entry Date</th><th>Exit Date</th>
              <th>Entry</th><th>Exit</th><th>Qty</th><th>Return %</th><th>P&amp;L</th>
              <th>Capital After</th><th>Exit Reason</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${trades.map((t, i) => {
              const win = t.return_pct > 0;
              const isShort = (t.type || 'LONG').toUpperCase() === 'SHORT';
              return `
              <tr class="${win ? 'win' : 'loss'}">
                <td style="color:var(--text-muted);font-size:11px;">${i + 1}</td>
                <td style="font-weight:600;">${t.symbol}</td>
                <td>
                  <span style="display:inline-block;padding:2px 8px;border-radius:5px;font-size:11px;font-weight:700;
                    background:${isShort ? 'rgba(249,115,22,.15)' : 'rgba(99,102,241,.15)'};
                    color:${isShort ? '#f97316' : '#818cf8'};">${(t.type || 'LONG').toUpperCase()}</span>
                </td>
                <td>${t.entry_date}</td>
                <td>${t.exit_date}</td>
                <td>$${t.entry_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                <td>$${t.exit_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                <td style="color:var(--text-muted);font-size:12px;">${(t.quantity ?? 0).toFixed(2)}</td>
                <td style="color:${win ? '#10b981' : '#ef4444'};font-weight:600;">${t.return_pct >= 0 ? '+' : ''}${t.return_pct.toFixed(2)}%</td>
                <td style="color:${t.pnl >= 0 ? '#10b981' : '#ef4444'};font-weight:600;">${t.pnl >= 0 ? '+' : ''}$${Math.abs(t.pnl).toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                <td style="color:var(--text-muted);font-size:12px;">$${(t.capital_after ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                <td style="color:var(--text-muted);font-size:12px;">${t.exit_reason || ''}</td>
                <td><a href="javascript:void(0)" onclick="SimulatorResultsPage._openDetail(${i})" style="color:var(--indigo);font-size:12px;font-weight:500;">Why? →</a></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  _openDetail(index) {
    const t = (this._run.trade_log || [])[index];
    if (!t || !t.entry_reason) return;
    this._closeDetail();

    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1000;display:flex;align-items:flex-start;justify-content:center;backdrop-filter:blur(4px);overflow:auto;padding:32px 16px;`;
    overlay.innerHTML = `
      <div class="card" style="padding:24px;max-width:640px;width:100%;animation:pageEnter .2s ease;margin-bottom:32px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;gap:12px;">
          <div>
            <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">${(t.type || 'LONG').toUpperCase()} · ${t.entry_date}</div>
            <h3 style="font-size:18px;font-weight:700;">${t.symbol}</h3>
          </div>
          <button id="close-sim-detail-btn" class="btn-secondary" style="padding:6px 10px;">✕</button>
        </div>
        <div class="card" style="padding:16px;background:rgba(255,255,255,.02);font-size:13px;line-height:1.7;">
          ${RuleExplain.render(t.entry_reason)}
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    this._detailOverlay = overlay;
    document.getElementById('close-sim-detail-btn').onclick = () => this._closeDetail();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this._closeDetail(); });
  },

  _closeDetail() {
    if (this._detailOverlay) { this._detailOverlay.remove(); this._detailOverlay = null; }
  },

  _downloadCsv() {
    const trades = this._run.trade_log || [];
    if (!trades.length) return;
    const headers = ['Symbol', 'Type', 'Entry Date', 'Exit Date', 'Entry Price', 'Exit Price', 'Quantity', 'Exit Reason', 'Return %', 'P&L', 'Capital After'];
    const escape = (val) => {
      const s = String(val ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = trades.map(t => [
      t.symbol, (t.type || 'LONG').toUpperCase(), t.entry_date, t.exit_date,
      t.entry_price, t.exit_price, t.quantity ?? '', t.exit_reason || '',
      t.return_pct?.toFixed(2), t.pnl?.toFixed(2), t.capital_after ?? '',
    ].map(escape).join(','));
    const csv = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const strategySlug = (this._run.strategy_name || 'strategy').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${strategySlug}-simulation-trades.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  _confirmDelete() {
    const run = this._run;
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:1000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);`;
    overlay.innerHTML = `
      <div class="card" style="padding:28px;max-width:380px;width:90%;animation:pageEnter .2s ease;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          <div style="width:36px;height:36px;background:rgba(239,68,68,.12);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </div>
          <h3 style="font-size:16px;font-weight:600;">Delete Simulation</h3>
        </div>
        <p style="font-size:14px;color:var(--text-muted);margin-bottom:20px;">Delete this simulation of ${run.strategy_name} and its full trade log?</p>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button id="delete-sim-cancel-btn" class="btn-secondary" style="padding:8px 16px;">Cancel</button>
          <button id="delete-sim-confirm-btn" class="btn-primary" style="padding:8px 16px;background:#ef4444;">Delete</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('delete-sim-cancel-btn').onclick = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('delete-sim-confirm-btn').onclick = async () => {
      const btn = document.getElementById('delete-sim-confirm-btn');
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span> Deleting...`;
      try {
        await API.deleteSimulatorRun(run.id);
        overlay.remove();
        Toast.success('Simulation deleted');
        App.navigate('/simulator');
      } catch (e) {
        Toast.error('Failed to delete: ' + e.message);
        overlay.remove();
      }
    };
  },

  _cleanup() {
    this._cleanup_poll();
    this._closeDetail();
    EquityChart.destroy();
    DrawdownChart.destroy();
  }
};
