// screener-list.js — history of screener runs + universe (symbol list) management
const ScreenerListPage = {
  _all: [],
  _filter: 'all',
  _search: '',

  async render(container) {
    container.innerHTML = `
      <div class="page-enter">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px;">
          <div>
            <h1 style="font-size:24px;font-weight:700;margin-bottom:4px;">Screener</h1>
            <p style="color:var(--text-muted);font-size:14px;">Scan a symbol universe for stocks that currently qualify under a strategy's entry rules</p>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn-secondary" onclick="ScreenerListPage._openUniverses()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
              Manage Universes
            </button>
            <a data-link href="/screener/new" class="btn-primary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Scan
            </a>
          </div>
        </div>

        <div style="display:flex;gap:12px;align-items:center;margin-bottom:20px;flex-wrap:wrap;">
          <div style="position:relative;flex:1;min-width:200px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--text-muted);pointer-events:none;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input id="scr-search" class="input-base" style="padding-left:36px;" placeholder="Search by strategy..." oninput="ScreenerListPage._onSearch(this.value)" />
          </div>
          <div id="filter-pills" style="display:flex;gap:6px;flex-wrap:wrap;">
            ${['all', 'queued', 'running', 'completed', 'failed'].map(f => `
              <button class="filter-pill${f === this._filter ? ' active' : ''}" onclick="ScreenerListPage._setFilter('${f}')">${f.charAt(0).toUpperCase() + f.slice(1)}</button>
            `).join('')}
          </div>
        </div>

        <div id="scr-table">
          <div class="skeleton" style="height:320px;"></div>
        </div>
      </div>
    `;

    try {
      this._all = await API.getScreenerRuns();
      this._renderTable();
    } catch (e) {
      Toast.error('Failed to load screener runs: ' + e.message);
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
    const el = document.getElementById('scr-table');
    if (!el) return;

    let list = this._all;
    if (this._filter !== 'all') list = list.filter(r => r.status === this._filter);
    if (this._search) list = list.filter(r => (r.strategy_name || '').toLowerCase().includes(this._search));

    if (list.length === 0) {
      el.innerHTML = `
        <div class="card" style="padding:60px;text-align:center;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 16px;display:block;opacity:.25;color:var(--indigo)"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <p style="color:var(--text-muted);font-size:15px;margin-bottom:16px;">${this._search || this._filter !== 'all' ? 'No scans match your filter' : 'No scans run yet'}</p>
          ${!this._search && this._filter === 'all' ? `<a data-link href="/screener/new" class="btn-primary" style="display:inline-flex;">Run your first scan</a>` : ''}
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
              <th>As Of</th>
              <th>Scanned</th>
              <th>Signals</th>
              <th>Status</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${list.map(r => `
              <tr>
                <td>${r.strategy_name || '—'}</td>
                <td>${r.universe_name || `${r.symbol_count} symbols`}</td>
                <td>${r.as_of_date}</td>
                <td style="color:var(--text-muted);font-size:12px;">${r.symbols_scanned}/${r.symbol_count}${(r.symbols_failed || []).length ? ` <span style="color:#f59e0b;">(${r.symbols_failed.length} failed)</span>` : ''}</td>
                <td>
                  <span style="background:rgba(16,185,129,.12);color:#34d399;padding:2px 8px;border-radius:5px;font-size:11px;font-weight:700;">${r.signals_found}</span>
                </td>
                <td><span class="badge badge-${r.status}">${r.status}</span></td>
                <td style="white-space:nowrap;color:var(--text-muted);font-size:12px;">${new Date(r.created_at).toLocaleString()}</td>
                <td style="white-space:nowrap;">
                  <a data-link href="/screener/${r.id}" style="color:var(--indigo);font-size:13px;font-weight:500;">View →</a>
                  <button onclick="ScreenerListPage._confirmDelete('${r.id}')" class="btn-secondary" style="padding:4px 7px;margin-left:8px;color:#ef4444;border-color:rgba(239,68,68,.25);" title="Delete scan">
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
          <h3 style="font-size:16px;font-weight:600;">Delete Scan</h3>
        </div>
        <p style="font-size:14px;color:var(--text-muted);margin-bottom:20px;">Delete this scan${run ? ` of ${run.strategy_name || 'strategy'}` : ''} and all its signals?</p>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button id="delete-scr-cancel-btn" class="btn-secondary" style="padding:8px 16px;">Cancel</button>
          <button id="delete-scr-confirm-btn" class="btn-primary" style="padding:8px 16px;background:#ef4444;">Delete</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('delete-scr-cancel-btn').onclick = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('delete-scr-confirm-btn').onclick = async () => {
      const btn = document.getElementById('delete-scr-confirm-btn');
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span> Deleting...`;
      try {
        await API.deleteScreenerRun(id);
        overlay.remove();
        Toast.success('Scan deleted');
        this._all = this._all.filter(r => r.id !== id);
        this._renderTable();
      } catch (e) {
        Toast.error('Failed to delete: ' + e.message);
        overlay.remove();
      }
    };
  },

  async _openUniverses() {
    const overlay = document.createElement('div');
    overlay.id = 'universe-overlay';
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:1000;display:flex;align-items:flex-start;justify-content:center;backdrop-filter:blur(4px);overflow:auto;padding:32px 16px;`;
    overlay.innerHTML = `
      <div class="card" style="padding:24px;max-width:640px;width:100%;animation:pageEnter .2s ease;margin-bottom:32px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h3 style="font-size:16px;font-weight:600;">Manage Universes</h3>
          <button onclick="document.getElementById('universe-overlay').remove()" class="btn-secondary" style="padding:6px 10px;">✕</button>
        </div>
        <div id="universe-list"><div class="skeleton" style="height:100px;"></div></div>
        <button class="btn-secondary" style="width:100%;justify-content:center;margin-top:14px;" onclick="ScreenerListPage._openUniverseForm()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Universe
        </button>
        <div id="universe-form-panel" style="margin-top:14px;"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    await this._loadUniverseList();
  },

  async _loadUniverseList() {
    const el = document.getElementById('universe-list');
    if (!el) return;
    try {
      const universes = await API.getUniverses();
      this._universes = universes;
      el.innerHTML = universes.map(u => `
        <div class="card" style="padding:14px;margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
            <div>
              <div style="font-size:14px;font-weight:600;display:flex;align-items:center;gap:6px;">
                ${u.name}
                ${u.is_default ? `<span style="font-size:10px;background:rgba(99,102,241,.12);color:#818cf8;padding:1px 6px;border-radius:4px;">default</span>` : ''}
              </div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${u.symbol_count} symbols</div>
              ${u.description ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px;max-width:440px;">${u.description}</div>` : ''}
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;">
              <button class="btn-secondary" style="padding:5px 9px;font-size:11px;" onclick="ScreenerListPage._openUniverseForm('${u.id}')">Edit</button>
              <button class="btn-secondary" style="padding:5px 9px;font-size:11px;color:#ef4444;border-color:rgba(239,68,68,.25);" onclick="ScreenerListPage._deleteUniverse('${u.id}')">Delete</button>
            </div>
          </div>
        </div>
      `).join('');
    } catch (e) {
      el.innerHTML = `<p style="color:#f87171;font-size:13px;">${e.message}</p>`;
    }
  },

  _openUniverseForm(id) {
    const universe = id ? (this._universes || []).find(u => u.id === id) : null;
    const panel = document.getElementById('universe-form-panel');
    if (!panel) return;
    panel.innerHTML = `
      <div class="card" style="padding:16px;background:rgba(99,102,241,.04);">
        <h4 style="font-size:13px;font-weight:600;margin-bottom:12px;">${universe ? 'Edit' : 'New'} Universe</h4>
        <div style="margin-bottom:10px;">
          <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px;">Name</label>
          <input class="input-base" id="uni-name" value="${universe ? universe.name.replace(/"/g, '&quot;') : ''}" style="font-size:13px;padding:7px 10px;" />
        </div>
        <div style="margin-bottom:10px;">
          <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px;">Description <span style="opacity:.6;">(optional)</span></label>
          <input class="input-base" id="uni-description" value="${universe ? (universe.description || '').replace(/"/g, '&quot;') : ''}" style="font-size:13px;padding:7px 10px;" />
        </div>
        <div style="margin-bottom:12px;">
          <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px;">Symbols <span style="opacity:.6;">(comma or newline separated — .NS added automatically)</span></label>
          <textarea class="input-base" id="uni-symbols" rows="6" style="font-size:12px;font-family:monospace;padding:8px 10px;">${universe ? universe.symbols.join('\n') : ''}</textarea>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn-secondary" style="padding:6px 14px;font-size:12px;" onclick="document.getElementById('universe-form-panel').innerHTML=''">Cancel</button>
          <button class="btn-primary" style="padding:6px 14px;font-size:12px;" id="uni-save-btn" onclick="ScreenerListPage._saveUniverse('${universe ? universe.id : ''}')">Save</button>
        </div>
      </div>
    `;
  },

  async _saveUniverse(id) {
    const name = document.getElementById('uni-name').value.trim();
    const description = document.getElementById('uni-description').value.trim();
    const symbolsRaw = document.getElementById('uni-symbols').value;
    const symbols = symbolsRaw.split(/[\n,]/).map(s => s.trim()).filter(Boolean);

    if (!name) { Toast.warning('Name is required'); return; }
    if (!symbols.length) { Toast.warning('At least one symbol is required'); return; }

    const btn = document.getElementById('uni-save-btn');
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Saving...`;
    try {
      if (id) {
        await API.updateUniverse(id, { name, description, symbols });
      } else {
        await API.createUniverse({ name, description, symbols });
      }
      Toast.success('Universe saved');
      document.getElementById('universe-form-panel').innerHTML = '';
      await this._loadUniverseList();
    } catch (e) {
      Toast.error('Failed to save: ' + e.message);
      btn.disabled = false;
      btn.innerHTML = 'Save';
    }
  },

  async _deleteUniverse(id) {
    if (!confirm('Delete this universe? Existing scans that used it keep their own symbol snapshot and are unaffected.')) return;
    try {
      await API.deleteUniverse(id);
      Toast.success('Universe deleted');
      await this._loadUniverseList();
    } catch (e) {
      Toast.error('Failed to delete: ' + e.message);
    }
  }
};
