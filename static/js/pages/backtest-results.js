// backtest-results.js — backtest results page with charts
const BacktestResultsPage = {
  _run: null,
  _activeSymbol: null,
  _pollInterval: null,

  async render(container, params) {
    const id = params.id;
    this._cleanup();

    container.innerHTML = `
      <div class="page-enter">
        <div style="margin-bottom:20px;font-size:13px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">
          <a data-link href="/strategies" style="color:var(--text-muted);text-decoration:none;">Strategies</a>
          <span>›</span>
          <span id="bt-breadcrumb">Backtest Results</span>
        </div>
        <div id="bt-content">
          <div class="skeleton" style="height:64px;margin-bottom:16px;"></div>
          <div class="skeleton" style="height:400px;"></div>
        </div>
      </div>
    `;

    try {
      this._run = await API.getBacktest(id);
      if (['queued', 'running'].includes(this._run.status)) {
        this._renderRunning(container);
        this._startPoll(id);
      } else {
        this._renderResults(container);
      }
    } catch (e) {
      Toast.error('Failed to load backtest: ' + e.message);
    }
  },

  _renderRunning(container) {
    const run = this._run;
    document.getElementById('bt-content').innerHTML = `
      <div style="margin-bottom:20px;">
        <h1 style="font-size:20px;font-weight:700;margin-bottom:6px;">Backtest Running</h1>
        <div style="font-size:13px;color:var(--text-muted);">
          ${run.strategy_name || 'Strategy'} · ${(run.symbols || []).join(', ')} · ${run.start_date} → ${run.end_date}
        </div>
      </div>

      <div class="card" style="padding:28px;max-width:600px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
          <span class="spinner spinner-lg"></span>
          <div>
            <div style="font-weight:600;margin-bottom:2px;">Processing backtest...</div>
            <div style="font-size:13px;color:var(--text-muted);">Status: <span id="status-badge" class="badge badge-${run.status}">${run.status}</span></div>
          </div>
        </div>

        <div class="progress-bar-wrap" style="margin-bottom:20px;">
          <div class="progress-bar-indeterminate"></div>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px;">
          <div class="step-item active" id="bt-step1">
            <span class="spinner" style="width:14px;height:14px;border-width:2px;"></span>
            <span style="font-size:13px;color:var(--text-muted);">Fetching market data...</span>
          </div>
          <div class="step-item" id="bt-step2" style="opacity:.4">
            <span style="width:14px;height:14px;border:2px solid var(--border);border-radius:50%;flex-shrink:0;"></span>
            <span style="font-size:13px;color:var(--text-muted);">Executing strategy signals...</span>
          </div>
          <div class="step-item" id="bt-step3" style="opacity:.4">
            <span style="width:14px;height:14px;border:2px solid var(--border);border-radius:50%;flex-shrink:0;"></span>
            <span style="font-size:13px;color:var(--text-muted);">Computing metrics...</span>
          </div>
        </div>
      </div>
    `;
  },

  _startPoll(id) {
    let tick = 0;
    this._pollInterval = setInterval(async () => {
      tick++;
      try {
        const status = await API.getBacktestStatus(id);
        this._run.status = status.status;

        // Animate steps
        const step = Math.min(tick, 3);
        for (let i = 1; i <= 3; i++) {
          const el = document.getElementById(`bt-step${i}`);
          if (!el) continue;
          if (i < step) {
            el.className = 'step-item done';
            el.style.opacity = '1';
            el.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg><span style="font-size:13px;">${el.querySelector('span:last-child').textContent}</span>`;
          } else if (i === step) {
            el.style.opacity = '1';
          }
        }

        if (status.status === 'completed') {
          this._cleanup();
          this._run = await API.getBacktest(id);
          this._renderResults(document.getElementById('bt-content')?.parentElement);
        } else if (status.status === 'failed') {
          this._cleanup();
          this._renderFailed(status.error);
        }
      } catch (e) {}
    }, 3000);
  },

  _renderFailed(error) {
    document.getElementById('bt-content').innerHTML = `
      <div style="margin-bottom:20px;">
        <h1 style="font-size:20px;font-weight:700;color:#ef4444;margin-bottom:6px;">Backtest Failed</h1>
      </div>
      <div class="card" style="padding:24px;border-color:rgba(239,68,68,.3);background:rgba(239,68,68,.05);">
        <p style="font-size:14px;color:#f87171;margin-bottom:16px;">${error || 'An unknown error occurred during backtesting.'}</p>
        <button class="btn-secondary" onclick="history.back()">← Go Back</button>
      </div>
    `;
  },

  _renderResults(container) {
    const run = this._run;
    const results = run.results || [];

    if (!results.length) {
      this._renderFailed('No results were generated.');
      return;
    }

    this._activeSymbol = this._activeSymbol || results[0].symbol;

    const btContent = document.getElementById('bt-content') || container;

    btContent.innerHTML = `
      <!-- Header -->
      <div style="margin-bottom:24px;">
        <h1 style="font-size:20px;font-weight:700;margin-bottom:6px;">${run.strategy_name || 'Backtest Results'}</h1>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;font-size:13px;color:var(--text-muted);">
          <span>${(run.symbols || []).join(', ')}</span>
          <span style="color:var(--border);">·</span>
          <span>${run.start_date} → ${run.end_date}</span>
          <span style="color:var(--border);">·</span>
          <span>$${(run.initial_capital || 0).toLocaleString()}</span>
          <span class="badge badge-completed">Completed</span>
        </div>
      </div>

      <!-- Symbol tabs -->
      ${results.length > 1 ? `
      <div style="display:flex;gap:4px;margin-bottom:20px;border-bottom:1px solid var(--border);padding-bottom:0;">
        ${results.map(r => `
          <button class="tab-btn ${this._activeSymbol === r.symbol ? 'active' : ''}" id="sym-tab-${r.symbol}"
            onclick="BacktestResultsPage._switchSymbol('${r.symbol}')">
            ${r.symbol}
            <span style="font-size:11px;margin-left:4px;color:${r.total_return_pct >= 0 ? '#10b981' : '#ef4444'};">${r.total_return_pct >= 0 ? '+' : ''}${r.total_return_pct.toFixed(1)}%</span>
          </button>
        `).join('')}
      </div>` : ''}

      <!-- Result content for active symbol -->
      <div id="symbol-result-content"></div>
    `;

    this._renderSymbolResult(this._activeSymbol);
  },

  _downloadTradesCsv(symbol) {
    const result = (this._run.results || []).find(r => r.symbol === symbol);
    if (!result) return;
    const strategySlug = (this._run.strategy_name || 'strategy').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    TradeLogTable.downloadCsv(result.trade_log || [], `${strategySlug}-${symbol}-trades.csv`);
  },

  _switchSymbol(symbol) {
    this._activeSymbol = symbol;
    document.querySelectorAll('[id^="sym-tab-"]').forEach(btn => {
      btn.classList.toggle('active', btn.id === `sym-tab-${symbol}`);
    });
    PriceChart.destroy();
    EquityChart.destroy();
    DrawdownChart.destroy();
    this._renderSymbolResult(symbol);
  },

  _renderSymbolResult(symbol) {
    const result = (this._run.results || []).find(r => r.symbol === symbol);
    const el = document.getElementById('symbol-result-content');
    if (!el || !result) return;

    el.innerHTML = `
      <!-- Metrics -->
      <div style="margin-bottom:24px;">
        ${MetricsCards.render(result)}
      </div>

      <!-- Price & Trades Chart -->
      ${result.chart_data?.price?.length ? `
      <div class="card" style="padding:20px;margin-bottom:16px;">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:16px;display:flex;align-items:center;gap:6px;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--indigo)" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 15l3-4 3 2 4-6"/></svg>
          Price &amp; Trades
        </h3>
        ${PriceChart.controlsHtml(result.chart_data)}
        <div class="chart-container" style="height:320px;">
          <canvas id="price-chart-canvas"></canvas>
        </div>
      </div>` : ''}

      <!-- Equity Chart -->
      <div class="card" style="padding:20px;margin-bottom:16px;">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:16px;display:flex;align-items:center;gap:6px;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--indigo)" stroke-width="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>
          Equity Curve
        </h3>
        <div class="chart-container" style="height:280px;">
          <canvas id="equity-chart-canvas"></canvas>
        </div>
      </div>

      <!-- Drawdown Chart -->
      <div class="card" style="padding:20px;margin-bottom:16px;">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:16px;display:flex;align-items:center;gap:6px;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/></svg>
          Drawdown
        </h3>
        <div class="chart-container" style="height:180px;">
          <canvas id="drawdown-chart-canvas"></canvas>
        </div>
      </div>

      <!-- Trade Log -->
      <div class="card" style="padding:20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h3 style="font-size:14px;font-weight:600;display:flex;align-items:center;gap:6px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--indigo)" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
            Trade Log (${(result.trade_log || []).length} trades)
          </h3>
          ${(result.trade_log || []).length ? `
          <button class="btn-secondary" style="padding:6px 12px;font-size:12px;gap:6px;" onclick="BacktestResultsPage._downloadTradesCsv('${symbol}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download CSV
          </button>` : ''}
        </div>
        ${TradeLogTable.render(result.trade_log || [])}
      </div>
    `;

    // Render charts after DOM is ready
    requestAnimationFrame(() => {
      if (result.chart_data?.price?.length) {
        PriceChart.render('price-chart-canvas', result.chart_data, result.trade_log || []);
      }
      if (result.equity_curve?.length) {
        EquityChart.render('equity-chart-canvas', result.equity_curve, this._run.initial_capital || 100000);
      }
      if (result.drawdown_series?.length) {
        DrawdownChart.render('drawdown-chart-canvas', result.drawdown_series);
      }
    });
  },

  _cleanup() {
    if (this._pollInterval) { clearInterval(this._pollInterval); this._pollInterval = null; }
    PriceChart.destroy();
    EquityChart.destroy();
    DrawdownChart.destroy();
  }
};
