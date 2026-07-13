// lab-results.js — parameter-sweep results: sortable comparison table across every
// (variant, symbol) combination, an overlaid equity-curve comparison chart, and a
// per-combination drill-down (price/indicator chart, equity/drawdown, trade log).
const LabResultsPage = {
  _run: null,
  _pollInterval: null,
  _symbolFilter: 'all',
  _sortKey: 'total_return_pct',
  _sortDir: -1,
  _compareSelection: null,
  _detailOverlay: null,

  _sortableCols: [
    ['total_trades', 'Trades'],
    ['win_rate', 'Win Rate'],
    ['total_return_pct', 'Return %'],
    ['max_drawdown_pct', 'Max DD %'],
    ['sharpe_ratio', 'Sharpe'],
    ['profit_factor', 'Profit Factor'],
    ['avg_trade_return_pct', 'Avg Trade %'],
  ],
  _higherIsBetter: {
    total_trades: null, win_rate: true, total_return_pct: true,
    max_drawdown_pct: true, sharpe_ratio: true, profit_factor: true, avg_trade_return_pct: true,
  },

  async render(container, params) {
    const id = params.id;
    this._cleanup();
    this._compareSelection = new Set();
    this._symbolFilter = 'all';
    this._sortKey = 'total_return_pct';
    this._sortDir = -1;

    container.innerHTML = `
      <div class="page-enter">
        <div style="margin-bottom:20px;font-size:13px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">
          <a data-link href="/lab" style="color:var(--text-muted);text-decoration:none;">Lab</a>
          <span>›</span>
          <span id="lab-breadcrumb">Sweep Results</span>
        </div>
        <div id="lab-content">
          <div class="skeleton" style="height:64px;margin-bottom:16px;"></div>
          <div class="skeleton" style="height:400px;"></div>
        </div>
      </div>
    `;

    try {
      this._run = await API.getLabRun(id);
      if (['queued', 'running'].includes(this._run.status)) {
        this._renderRunning(container);
        this._startPoll(id);
      } else {
        this._renderResults(container);
      }
    } catch (e) {
      Toast.error('Failed to load lab run: ' + e.message);
    }
  },

  _renderRunning(container) {
    const run = this._run;
    document.getElementById('lab-content').innerHTML = `
      <div style="margin-bottom:20px;">
        <h1 style="font-size:20px;font-weight:700;margin-bottom:6px;">Sweep Running</h1>
        <div style="font-size:13px;color:var(--text-muted);">
          ${run.strategy_name || 'Strategy'} · ${(run.symbols || []).join(', ')} · ${run.variant_count} variant(s) × ${(run.symbols || []).length} symbol(s)
        </div>
      </div>
      <div class="card" style="padding:28px;max-width:600px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
          <span class="spinner spinner-lg"></span>
          <div>
            <div style="font-weight:600;margin-bottom:2px;">Running ${run.variant_count * (run.symbols || []).length} backtests...</div>
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
        const status = await API.getLabRunStatus(id);
        if (status.status === 'completed') {
          this._cleanup_poll();
          this._run = await API.getLabRun(id);
          this._renderResults(document.getElementById('lab-content')?.parentElement);
        } else if (status.status === 'failed') {
          this._cleanup_poll();
          this._run = await API.getLabRun(id);
          this._renderFailed(status.error);
        }
      } catch (e) {}
    }, 3000);
  },

  _cleanup_poll() {
    if (this._pollInterval) { clearInterval(this._pollInterval); this._pollInterval = null; }
  },

  _renderFailed(error) {
    document.getElementById('lab-content').innerHTML = `
      <div style="margin-bottom:20px;">
        <h1 style="font-size:20px;font-weight:700;color:#ef4444;margin-bottom:6px;">Sweep Failed</h1>
      </div>
      <div class="card" style="padding:24px;border-color:rgba(239,68,68,.3);background:rgba(239,68,68,.05);">
        <p style="font-size:14px;color:#f87171;margin-bottom:16px;">${error || 'An unknown error occurred while running the sweep.'}</p>
        <button class="btn-secondary" onclick="history.back()">← Go Back</button>
      </div>
    `;
  },

  _rows() {
    const rows = [];
    for (const variant of this._run.variants || []) {
      for (const result of variant.results || []) {
        rows.push({ variant, result });
      }
    }
    return rows;
  },

  _renderResults(container) {
    const run = this._run;
    const labContent = document.getElementById('lab-content') || container;
    const symbols = run.symbols || [];

    labContent.innerHTML = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:20px;">
        <div>
          <h1 style="font-size:20px;font-weight:700;margin-bottom:6px;">${run.name || run.strategy_name || 'Sweep Results'}</h1>
          <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;font-size:13px;color:var(--text-muted);">
            <span>${run.strategy_name}</span>
            <span style="color:var(--border);">·</span>
            <span>${symbols.join(', ')}</span>
            <span style="color:var(--border);">·</span>
            <span>${run.start_date} → ${run.end_date}</span>
            <span style="color:var(--border);">·</span>
            <span>${run.variant_count} variant(s)</span>
            <span class="badge badge-completed">Completed</span>
          </div>
        </div>
        <button onclick="LabResultsPage._confirmDelete()" class="btn-secondary" style="padding:5px 10px;color:#ef4444;border-color:rgba(239,68,68,.25);flex-shrink:0;" title="Delete lab run">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div>

      <div class="card" style="padding:20px;margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
          <h3 style="font-size:14px;font-weight:600;">Comparison</h3>
          <div style="display:flex;gap:8px;align-items:center;">
            <label style="font-size:12px;color:var(--text-muted);">Symbol:</label>
            <select class="input-base" id="symbol-filter" style="font-size:12px;padding:5px 10px;width:auto;" onchange="LabResultsPage._setSymbolFilter(this.value)">
              <option value="all">All symbols</option>
              ${symbols.map(s => `<option value="${s}">${s}</option>`).join('')}
            </select>
            <button class="btn-secondary" id="compare-btn" style="font-size:12px;padding:6px 12px;" onclick="LabResultsPage._renderCompareChart()" disabled>
              Compare Selected (<span id="compare-count">0</span>)
            </button>
          </div>
        </div>
        <div id="comparison-table"></div>
      </div>

      <div id="compare-chart-card" style="display:none;" class="card"></div>
    `;

    this._renderComparisonTable();
  },

  _setSymbolFilter(sym) {
    this._symbolFilter = sym;
    this._renderComparisonTable();
  },

  _sortBy(key) {
    if (this._sortKey === key) {
      this._sortDir *= -1;
    } else {
      this._sortKey = key;
      this._sortDir = -1;
    }
    this._renderComparisonTable();
  },

  _renderComparisonTable() {
    const el = document.getElementById('comparison-table');
    if (!el) return;

    let rows = this._rows();
    if (this._symbolFilter !== 'all') rows = rows.filter(r => r.result.symbol === this._symbolFilter);

    rows.sort((a, b) => (a.result[this._sortKey] - b.result[this._sortKey]) * this._sortDir);

    // Best-value highlighting within the currently visible rows.
    const bestByCol = {};
    for (const [key] of this._sortableCols) {
      if (this._higherIsBetter[key] === null || !rows.length) continue;
      const values = rows.map(r => r.result[key]);
      bestByCol[key] = this._higherIsBetter[key] ? Math.max(...values) : Math.min(...values);
    }

    if (!rows.length) {
      el.innerHTML = `<p style="color:var(--text-muted);font-size:14px;padding:20px 0;">No results for this filter.</p>`;
      return;
    }

    const arrow = (key) => this._sortKey === key ? (this._sortDir === 1 ? ' ▲' : ' ▼') : '';

    el.innerHTML = `
      <div style="overflow:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th></th>
              <th>Variant</th>
              <th>Symbol</th>
              ${this._sortableCols.map(([key, label]) => `
                <th style="cursor:pointer;user-select:none;" onclick="LabResultsPage._sortBy('${key}')">${label}${arrow(key)}</th>
              `).join('')}
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(({ variant, result }) => {
              const key = `${variant.id}:${result.symbol}`;
              const checked = this._compareSelection.has(key);
              return `
              <tr>
                <td><input type="checkbox" ${checked ? 'checked' : ''} onchange="LabResultsPage._toggleCompare('${key}', this.checked)" /></td>
                <td style="max-width:260px;">${variant.label}</td>
                <td>${result.symbol}</td>
                ${this._sortableCols.map(([colKey]) => {
                  const v = result[colKey];
                  const isBest = bestByCol[colKey] !== undefined && v === bestByCol[colKey];
                  const pctCols = ['win_rate', 'total_return_pct', 'max_drawdown_pct', 'avg_trade_return_pct'];
                  const display = pctCols.includes(colKey) ? `${v >= 0 && colKey !== 'max_drawdown_pct' ? '+' : ''}${v.toFixed(2)}%` : v.toFixed(colKey === 'total_trades' ? 0 : 3);
                  return `<td style="${isBest ? 'background:rgba(16,185,129,.1);color:#34d399;font-weight:700;' : ''}">${display}${isBest ? ' ★' : ''}</td>`;
                }).join('')}
                <td><a href="javascript:void(0)" onclick="LabResultsPage._openDetail('${variant.id}', '${result.symbol}')" style="color:var(--indigo);font-size:12px;font-weight:500;">View →</a></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    const compareBtn = document.getElementById('compare-btn');
    const compareCount = document.getElementById('compare-count');
    if (compareCount) compareCount.textContent = this._compareSelection.size;
    if (compareBtn) compareBtn.disabled = this._compareSelection.size < 2;
  },

  _toggleCompare(key, checked) {
    if (checked) {
      if (this._compareSelection.size >= 8) {
        Toast.warning('Compare up to 8 at a time');
        document.querySelector(`input[onchange*="${key}"]`).checked = false;
        return;
      }
      this._compareSelection.add(key);
    } else {
      this._compareSelection.delete(key);
    }
    const compareBtn = document.getElementById('compare-btn');
    const compareCount = document.getElementById('compare-count');
    if (compareCount) compareCount.textContent = this._compareSelection.size;
    if (compareBtn) compareBtn.disabled = this._compareSelection.size < 2;
  },

  _renderCompareChart() {
    const rows = this._rows();
    const selected = rows.filter(({ variant, result }) => this._compareSelection.has(`${variant.id}:${result.symbol}`));
    if (selected.length < 2) return;

    const card = document.getElementById('compare-chart-card');
    card.style.display = 'block';
    card.style.padding = '20px';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <h3 style="font-size:14px;font-weight:600;">Equity Curve Comparison</h3>
        <button class="btn-secondary" style="padding:4px 10px;font-size:11px;" onclick="LabCompareChart.resetZoom()">Reset Zoom</button>
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">Scroll or pinch to zoom, drag to pan.</div>
      <div class="chart-container" style="height:340px;">
        <canvas id="compare-chart-canvas"></canvas>
      </div>
    `;
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    const series = selected.map(({ variant, result }) => ({
      label: `${variant.label} — ${result.symbol}`,
      equityCurve: result.equity_curve,
    }));
    requestAnimationFrame(() => LabCompareChart.render('compare-chart-canvas', series));
  },

  _openDetail(variantId, symbol) {
    const variant = (this._run.variants || []).find(v => String(v.id) === String(variantId));
    const result = variant?.results.find(r => r.symbol === symbol);
    if (!variant || !result) return;

    this._closeDetail();

    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1000;display:flex;align-items:flex-start;justify-content:center;backdrop-filter:blur(4px);overflow:auto;padding:32px 16px;`;
    overlay.innerHTML = `
      <div class="card" style="padding:24px;max-width:920px;width:100%;animation:pageEnter .2s ease;margin-bottom:32px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;gap:12px;">
          <div>
            <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">${result.symbol}</div>
            <h3 style="font-size:16px;font-weight:600;">${variant.label}</h3>
          </div>
          <button id="close-detail-btn" class="btn-secondary" style="padding:6px 10px;">✕</button>
        </div>

        <div style="margin-bottom:20px;">${MetricsCards.render(result)}</div>

        ${result.chart_data?.price?.length ? `
        <div style="margin-bottom:20px;">
          <h4 style="font-size:13px;font-weight:600;margin-bottom:10px;">Price &amp; Trades</h4>
          ${LabPriceChart.controlsHtml(result.chart_data)}
          <div class="chart-container" style="height:300px;">
            <canvas id="detail-price-canvas"></canvas>
          </div>
        </div>` : ''}

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
          <div>
            <h4 style="font-size:13px;font-weight:600;margin-bottom:10px;">Equity Curve</h4>
            <div class="chart-container" style="height:220px;"><canvas id="detail-equity-canvas"></canvas></div>
          </div>
          <div>
            <h4 style="font-size:13px;font-weight:600;margin-bottom:10px;">Drawdown</h4>
            <div class="chart-container" style="height:220px;"><canvas id="detail-drawdown-canvas"></canvas></div>
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <h4 style="font-size:13px;font-weight:600;">Trade Log (${(result.trade_log || []).length} trades)</h4>
          ${(result.trade_log || []).length ? `
          <button class="btn-secondary" style="padding:6px 12px;font-size:12px;gap:6px;" onclick="LabResultsPage._downloadTradesCsv('${variant.id}', '${result.symbol}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download CSV
          </button>` : ''}
        </div>
        ${TradeLogTable.render(result.trade_log || [])}
      </div>
    `;
    document.body.appendChild(overlay);
    this._detailOverlay = overlay;

    document.getElementById('close-detail-btn').onclick = () => this._closeDetail();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this._closeDetail(); });

    requestAnimationFrame(() => {
      if (result.chart_data?.price?.length) {
        LabPriceChart.render('detail-price-canvas', result.chart_data, result.trade_log || []);
      }
      if (result.equity_curve?.length) {
        EquityChart.render('detail-equity-canvas', result.equity_curve, this._run.initial_capital || 100000);
      }
      if (result.drawdown_series?.length) {
        DrawdownChart.render('detail-drawdown-canvas', result.drawdown_series);
      }
    });
  },

  _closeDetail() {
    if (this._detailOverlay) {
      this._detailOverlay.remove();
      this._detailOverlay = null;
    }
    LabPriceChart.destroy();
    EquityChart.destroy();
    DrawdownChart.destroy();
  },

  _downloadTradesCsv(variantId, symbol) {
    const variant = (this._run.variants || []).find(v => String(v.id) === String(variantId));
    const result = variant?.results.find(r => r.symbol === symbol);
    if (!result) return;
    const strategySlug = (this._run.strategy_name || 'strategy').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const variantSlug = variant.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `variant-${variant.index}`;
    TradeLogTable.downloadCsv(result.trade_log || [], `${strategySlug}-${variantSlug}-${symbol}-trades.csv`);
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
          <h3 style="font-size:16px;font-weight:600;">Delete Lab Run</h3>
        </div>
        <p style="font-size:14px;color:var(--text-muted);margin-bottom:20px;">Permanently delete this sweep and all ${run.variant_count} variant(s)' results?</p>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button id="delete-lab-cancel-btn" class="btn-secondary" style="padding:8px 16px;">Cancel</button>
          <button id="delete-lab-confirm-btn" class="btn-primary" style="padding:8px 16px;background:#ef4444;">Delete</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('delete-lab-cancel-btn').onclick = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('delete-lab-confirm-btn').onclick = async () => {
      const btn = document.getElementById('delete-lab-confirm-btn');
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span> Deleting...`;
      try {
        await API.deleteLabRun(run.id);
        overlay.remove();
        Toast.success('Lab run deleted');
        App.navigate('/lab');
      } catch (e) {
        Toast.error('Failed to delete: ' + e.message);
        overlay.remove();
      }
    };
  },

  _cleanup() {
    this._cleanup_poll();
    this._closeDetail();
    LabCompareChart.destroy();
  }
};
