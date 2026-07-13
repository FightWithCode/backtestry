// lab-list.js — history of all parameter-sweep lab runs
const LabListPage = {
  _all: [],
  _filter: 'all',
  _search: '',

  async render(container) {
    container.innerHTML = `
      <div class="page-enter">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px;">
          <div>
            <h1 style="font-size:24px;font-weight:700;margin-bottom:4px;">Strategy Lab</h1>
            <p style="color:var(--text-muted);font-size:14px;">Multi-symbol, multi-variant parameter sweeps — compare indicator lengths and exit values without touching the saved strategy</p>
          </div>
          <a data-link href="/lab/new" class="btn-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Sweep
          </a>
        </div>

        <div style="display:flex;gap:12px;align-items:center;margin-bottom:20px;flex-wrap:wrap;">
          <div style="position:relative;flex:1;min-width:200px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--text-muted);pointer-events:none;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input id="lab-search" class="input-base" style="padding-left:36px;" placeholder="Search by strategy or symbol..." oninput="LabListPage._onSearch(this.value)" />
          </div>
          <div id="filter-pills" style="display:flex;gap:6px;flex-wrap:wrap;">
            ${['all', 'queued', 'running', 'completed', 'failed'].map(f => `
              <button class="filter-pill${f === this._filter ? ' active' : ''}" onclick="LabListPage._setFilter('${f}')">${f.charAt(0).toUpperCase() + f.slice(1)}</button>
            `).join('')}
          </div>
        </div>

        <div id="lab-table">
          <div class="skeleton" style="height:320px;"></div>
        </div>
      </div>
    `;

    try {
      this._all = await API.getLabRuns();
      this._renderTable();
    } catch (e) {
      Toast.error('Failed to load lab runs: ' + e.message);
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
    const el = document.getElementById('lab-table');
    if (!el) return;

    let list = this._all;
    if (this._filter !== 'all') list = list.filter(r => r.status === this._filter);
    if (this._search) {
      list = list.filter(r =>
        (r.strategy_name || '').toLowerCase().includes(this._search) ||
        (r.symbols || []).join(',').toLowerCase().includes(this._search)
      );
    }

    if (list.length === 0) {
      el.innerHTML = `
        <div class="card" style="padding:60px;text-align:center;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 16px;display:block;opacity:.25;color:var(--indigo)"><path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-4"/><path d="M9 3v6l3-2 3 2V3"/></svg>
          <p style="color:var(--text-muted);font-size:15px;margin-bottom:16px;">${this._search || this._filter !== 'all' ? 'No lab runs match your filter' : 'No parameter sweeps run yet'}</p>
          ${!this._search && this._filter === 'all' ? `<a data-link href="/lab/new" class="btn-primary" style="display:inline-flex;">Run your first sweep</a>` : ''}
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
              <th>Variants</th>
              <th>Date Range</th>
              <th>Status</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${list.map(r => `
              <tr>
                <td>${r.strategy_name || '—'}${r.name ? `<div style="font-size:11px;color:var(--text-muted);">${r.name}</div>` : ''}</td>
                <td>${(r.symbols || []).join(', ')}</td>
                <td>
                  <span style="background:rgba(99,102,241,.12);color:#818cf8;padding:2px 8px;border-radius:5px;font-size:11px;font-weight:600;">${r.variant_count}×${(r.symbols || []).length}</span>
                </td>
                <td style="white-space:nowrap;">${r.start_date} → ${r.end_date}</td>
                <td><span class="badge badge-${r.status}">${r.status}</span></td>
                <td style="white-space:nowrap;color:var(--text-muted);font-size:12px;">${new Date(r.created_at).toLocaleString()}</td>
                <td style="white-space:nowrap;">
                  <a data-link href="/lab/${r.id}" style="color:var(--indigo);font-size:13px;font-weight:500;">View →</a>
                  <button onclick="LabListPage._confirmDelete('${r.id}')" class="btn-secondary" style="padding:4px 7px;margin-left:8px;color:#ef4444;border-color:rgba(239,68,68,.25);" title="Delete lab run">
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
          <h3 style="font-size:16px;font-weight:600;">Delete Lab Run</h3>
        </div>
        <p style="font-size:14px;color:var(--text-muted);margin-bottom:6px;">Are you sure you want to delete this sweep?</p>
        <p style="font-size:14px;color:#fff;font-weight:600;margin-bottom:20px;">${run ? `${run.strategy_name || 'Strategy'} · ${(run.symbols || []).join(', ')}` : ''}</p>
        <p style="font-size:12px;color:var(--text-muted);margin-bottom:20px;">This will permanently delete all variants and results in this run.</p>
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
        await API.deleteLabRun(id);
        overlay.remove();
        Toast.success('Lab run deleted');
        this._all = this._all.filter(r => r.id !== id);
        this._renderTable();
      } catch (e) {
        Toast.error('Failed to delete: ' + e.message);
        overlay.remove();
      }
    };
  }
};
