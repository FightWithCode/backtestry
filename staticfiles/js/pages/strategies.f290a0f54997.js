// strategies.js — strategies list page
const StrategiesPage = {
  _all: [],
  _filter: 'all',
  _search: '',

  async render(container) {
    container.innerHTML = `
      <div class="page-enter">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
          <div>
            <h1 style="font-size:24px;font-weight:700;margin-bottom:4px;">Strategies</h1>
            <p style="color:var(--text-muted);font-size:14px;">Manage your AI-backtested trading strategies</p>
          </div>
          <a data-link href="/strategies/new" class="btn-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Strategy
          </a>
        </div>

        <!-- Search + filter -->
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:20px;flex-wrap:wrap;">
          <div style="position:relative;flex:1;min-width:200px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--text-muted);pointer-events:none;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input id="strat-search" class="input-base" style="padding-left:36px;" placeholder="Search strategies..." oninput="StrategiesPage._onSearch(this.value)" />
          </div>
          <div id="filter-pills" style="display:flex;gap:6px;flex-wrap:wrap;">
            ${['all','generated','pending','generating','failed'].map(f => `
              <button class="filter-pill${f === this._filter ? ' active' : ''}" onclick="StrategiesPage._setFilter('${f}')">${f.charAt(0).toUpperCase() + f.slice(1)}</button>
            `).join('')}
          </div>
        </div>

        <div id="strat-grid">
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;">
            ${[1,2,3,4,5,6].map(() => `<div class="skeleton" style="height:200px;"></div>`).join('')}
          </div>
        </div>
      </div>
    `;

    try {
      this._all = await API.getStrategies();
      this._renderGrid();
    } catch (e) {
      Toast.error('Failed to load strategies: ' + e.message);
    }
  },

  _onSearch(val) {
    this._search = val.toLowerCase();
    this._renderGrid();
  },

  _setFilter(f) {
    this._filter = f;
    document.querySelectorAll('.filter-pill').forEach(btn => {
      btn.classList.toggle('active', btn.textContent.toLowerCase() === f || (f === 'all' && btn.textContent.toLowerCase() === 'all'));
    });
    this._renderGrid();
  },

  _renderGrid() {
    const el = document.getElementById('strat-grid');
    if (!el) return;

    let list = this._all;
    if (this._filter !== 'all') {
      list = list.filter(s => s.script_status === this._filter);
    }
    if (this._search) {
      list = list.filter(s =>
        s.name.toLowerCase().includes(this._search) ||
        (s.description || '').toLowerCase().includes(this._search)
      );
    }

    if (list.length === 0) {
      el.innerHTML = `
        <div class="card" style="padding:60px;text-align:center;grid-column:1/-1;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 16px;display:block;opacity:.25;color:var(--indigo)"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          <p style="color:var(--text-muted);font-size:15px;margin-bottom:16px;">${this._search || this._filter !== 'all' ? 'No strategies match your filter' : 'No strategies yet'}</p>
          ${!this._search && this._filter === 'all' ? `<a data-link href="/strategies/new" class="btn-primary" style="display:inline-flex;">Create your first strategy</a>` : ''}
        </div>`;
      return;
    }

    el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;">${list.map(s => StrategyCard.render(s)).join('')}</div>`;
  }
};
