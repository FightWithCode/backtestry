// backtest-history.js — history of all backtest runs across every strategy
const BacktestHistoryPage = {
  _all: [],
  _filter: 'all',
  _search: '',

  async render(container) {
    container.innerHTML = `
      <div class="page-enter">
        <div style="margin-bottom:24px;">
          <h1 style="font-size:24px;font-weight:700;margin-bottom:4px;">Backtest History</h1>
          <p style="color:var(--text-muted);font-size:14px;">Every backtest run, across all strategies</p>
        </div>

        <div style="display:flex;gap:12px;align-items:center;margin-bottom:20px;flex-wrap:wrap;">
          <div style="position:relative;flex:1;min-width:200px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--text-muted);pointer-events:none;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input id="bt-search" class="input-base" style="padding-left:36px;" placeholder="Search by strategy or symbol..." oninput="BacktestHistoryPage._onSearch(this.value)" />
          </div>
          <div id="filter-pills" style="display:flex;gap:6px;flex-wrap:wrap;">
            ${['all', 'queued', 'running', 'completed', 'failed'].map(f => `
              <button class="filter-pill${f === this._filter ? ' active' : ''}" onclick="BacktestHistoryPage._setFilter('${f}')">${f.charAt(0).toUpperCase() + f.slice(1)}</button>
            `).join('')}
          </div>
        </div>

        <div id="bt-history-table">
          <div class="skeleton" style="height:320px;"></div>
        </div>
      </div>
    `;

    try {
      this._all = await API.getBacktests();
      this._renderTable();
    } catch (e) {
      Toast.error('Failed to load backtest history: ' + e.message);
    }
  },

  _onSearch(val) {
    this._search = val.toLowerCase();
    this._renderTable();
  },

  _setFilter(f) {
    this._filter = f;
    document.querySelectorAll('.filter-pill').forEach(btn => {
      btn.classList.toggle('active', btn.textContent.toLowerCase() === f);
    });
    this._renderTable();
  },

  _renderTable() {
    const el = document.getElementById('bt-history-table');
    if (!el) return;

    let list = this._all;
    if (this._filter !== 'all') {
      list = list.filter(r => r.status === this._filter);
    }
    if (this._search) {
      list = list.filter(r =>
        (r.strategy_name || '').toLowerCase().includes(this._search) ||
        (r.symbols || []).join(',').toLowerCase().includes(this._search)
      );
    }

    if (list.length === 0) {
      el.innerHTML = `
        <div class="card" style="padding:60px;text-align:center;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 16px;display:block;opacity:.25;color:var(--indigo)"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
          <p style="color:var(--text-muted);font-size:15px;">${this._search || this._filter !== 'all' ? 'No backtests match your filter' : 'No backtests run yet'}</p>
        </div>`;
      return;
    }

    el.innerHTML = `
      <div class="card" style="overflow:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Strategy</th>
              <th>Symbols</th>
              <th>Date Range</th>
              <th>Capital</th>
              <th>Costs</th>
              <th>Status</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${list.map(r => `
              <tr>
                <td>${r.strategy_name || '—'}</td>
                <td>${(r.symbols || []).join(', ')}</td>
                <td style="white-space:nowrap;">${r.start_date} → ${r.end_date}</td>
                <td>$${(r.initial_capital || 0).toLocaleString()}</td>
                <td style="color:var(--text-muted);font-size:12px;">${(r.commission_pct || r.slippage_pct)
                  ? `${r.commission_pct}% comm / ${r.slippage_pct}% slip` : '—'}</td>
                <td><span class="badge badge-${r.status}">${r.status}</span></td>
                <td style="white-space:nowrap;color:var(--text-muted);font-size:12px;">${new Date(r.created_at).toLocaleString()}</td>
                <td><a data-link href="/backtests/${r.id}" style="color:var(--indigo);font-size:13px;font-weight:500;">View →</a></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
};
