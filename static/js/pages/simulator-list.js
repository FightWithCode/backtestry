// simulator-list.js — history of simulator runs
const SimulatorListPage = {
  _all: [],
  _filter: 'all',
  _search: '',

  async render(container) {
    container.innerHTML = `
      <div class="page-enter">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px;">
          <div>
            <h1 style="font-size:24px;font-weight:700;margin-bottom:4px;">Simulator</h1>
            <p style="color:var(--text-muted);font-size:14px;">Deploy capital into one strategy across a universe, one position at a time, and see what it would actually have returned</p>
          </div>
          <a data-link href="/simulator/new" class="btn-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Simulation
          </a>
        </div>

        <div style="display:flex;gap:12px;align-items:center;margin-bottom:20px;flex-wrap:wrap;">
          <div style="position:relative;flex:1;min-width:200px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--text-muted);pointer-events:none;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input id="sim-search" class="input-base" style="padding-left:36px;" placeholder="Search by strategy..." oninput="SimulatorListPage._onSearch(this.value)" />
          </div>
          <div id="filter-pills" style="display:flex;gap:6px;flex-wrap:wrap;">
            ${['all', 'queued', 'running', 'completed', 'failed'].map(f => `
              <button class="filter-pill${f === this._filter ? ' active' : ''}" onclick="SimulatorListPage._setFilter('${f}')">${f.charAt(0).toUpperCase() + f.slice(1)}</button>
            `).join('')}
          </div>
        </div>

        <div id="sim-table">
          <div class="skeleton" style="height:320px;"></div>
        </div>
      </div>
    `;

    try {
      this._all = await API.getSimulatorRuns();
      this._renderTable();
    } catch (e) {
      Toast.error('Failed to load simulations: ' + e.message);
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
    const el = document.getElementById('sim-table');
    if (!el) return;

    let list = this._all;
    if (this._filter !== 'all') list = list.filter(r => r.status === this._filter);
    if (this._search) list = list.filter(r => (r.strategy_name || '').toLowerCase().includes(this._search));

    if (list.length === 0) {
      el.innerHTML = `
        <div class="card" style="padding:60px;text-align:center;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 16px;display:block;opacity:.25;color:var(--indigo)"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
          <p style="color:var(--text-muted);font-size:15px;margin-bottom:16px;">${this._search || this._filter !== 'all' ? 'No simulations match your filter' : 'No simulations run yet'}</p>
          ${!this._search && this._filter === 'all' ? `<a data-link href="/simulator/new" class="btn-primary" style="display:inline-flex;">Run your first simulation</a>` : ''}
        </div>`;
      return;
    }

    el.innerHTML = `
      <div class="card" style="overflow:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Strategy</th>
              <th>Universe</th>
              <th>Date Range</th>
              <th>Capital</th>
              <th>Risk %</th>
              <th>Trades</th>
              <th>Return</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${list.map(r => `
              <tr>
                <td>${r.strategy_name || '—'}</td>
                <td>${r.universe_name || `${r.symbol_count} symbols`}</td>
                <td style="white-space:nowrap;">${r.start_date} → ${r.end_date}</td>
                <td>$${(r.initial_capital || 0).toLocaleString()}</td>
                <td>${r.risk_pct}%</td>
                <td>${r.total_trades}</td>
                <td style="color:${r.total_return_pct >= 0 ? '#10b981' : '#ef4444'};font-weight:600;">${r.status === 'completed' ? `${r.total_return_pct >= 0 ? '+' : ''}${r.total_return_pct.toFixed(2)}%` : '—'}</td>
                <td><span class="badge badge-${r.status}">${r.status}</span></td>
                <td style="white-space:nowrap;">
                  <a data-link href="/simulator/${r.id}" style="color:var(--indigo);font-size:13px;font-weight:500;">View →</a>
                  <button onclick="SimulatorListPage._confirmDelete('${r.id}')" class="btn-secondary" style="padding:4px 7px;margin-left:8px;color:#ef4444;border-color:rgba(239,68,68,.25);" title="Delete simulation">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  _confirmDelete(id) {
    const run = this._all.find(r => r.id === id);
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
        <p style="font-size:14px;color:var(--text-muted);margin-bottom:20px;">Delete this simulation${run ? ` of ${run.strategy_name || 'strategy'}` : ''} and its full trade log?</p>
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
        await API.deleteSimulatorRun(id);
        overlay.remove();
        Toast.success('Simulation deleted');
        this._all = this._all.filter(r => r.id !== id);
        this._renderTable();
      } catch (e) {
        Toast.error('Failed to delete: ' + e.message);
        overlay.remove();
      }
    };
  }
};
