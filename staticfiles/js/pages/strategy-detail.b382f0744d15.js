// strategy-detail.js — full strategy detail page
const StrategyDetailPage = {
  _strategy: null,
  _activeTab: 'overview',
  _pollInterval: null,
  _symbols: [],

  async render(container, params) {
    const id = params.id;
    this._cleanup();
    this._activeTab = 'overview';
    this._symbols = [];

    container.innerHTML = `
      <div class="page-enter">
        <div style="margin-bottom:20px;font-size:13px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">
          <a data-link href="/strategies" style="color:var(--text-muted);text-decoration:none;">Strategies</a>
          <span>›</span>
          <span id="breadcrumb-name" style="color:#e2e8f0;">Loading...</span>
        </div>
        <div id="detail-content">
          <div style="display:grid;grid-template-columns:1fr 340px;gap:24px;">
            <div>${[1,2,3].map(() => `<div class="skeleton" style="height:80px;margin-bottom:12px;"></div>`).join('')}</div>
            <div>${[1,2].map(() => `<div class="skeleton" style="height:120px;margin-bottom:12px;"></div>`).join('')}</div>
          </div>
        </div>
      </div>
    `;

    try {
      this._strategy = await API.getStrategy(id);
      this._renderFull(container);
    } catch (e) {
      Toast.error('Failed to load strategy: ' + e.message);
      document.getElementById('detail-content').innerHTML = `<p style="color:var(--text-muted);">Strategy not found.</p>`;
    }
  },

  _renderFull(container) {
    const s = this._strategy;
    document.getElementById('breadcrumb-name').textContent = s.name;

    document.getElementById('detail-content').innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 340px;gap:24px;align-items:start;">

        <!-- Left column -->
        <div>
          <div style="margin-bottom:20px;">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:8px;">
              <h1 style="font-size:22px;font-weight:700;">${s.name}</h1>
              <span class="badge badge-${s.script_status}">${s.script_status.replace('_',' ')}</span>
            </div>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
              ${s.source_url ? `<a href="${s.source_url}" target="_blank" rel="noopener" style="font-size:13px;color:var(--indigo);text-decoration:none;display:flex;align-items:center;gap:4px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                Source
              </a>` : ''}
              <span style="background:rgba(99,102,241,.12);color:#818cf8;padding:3px 10px;border-radius:5px;font-size:12px;font-weight:600;">${s.timeframe}</span>
              <span style="font-size:12px;color:var(--text-muted);">v${s.script_version}</span>
            </div>
          </div>

          <!-- Tabs -->
          <div style="display:flex;gap:4px;margin-bottom:20px;border-bottom:1px solid var(--border);padding-bottom:0;">
            ${['overview','script','history'].map(t => `
              <button class="tab-btn ${this._activeTab === t ? 'active' : ''}" id="tab-${t}" onclick="StrategyDetailPage._switchTab('${t}')" style="border-radius:8px 8px 0 0;">${t.charAt(0).toUpperCase() + t.slice(1)}</button>
            `).join('')}
          </div>

          <div id="tab-content"></div>
        </div>

        <!-- Right column -->
        <div style="position:sticky;top:80px;">
          ${this._renderBacktestCard()}
          <div style="margin-top:16px;" id="recent-backtests-section">
            ${this._renderRecentBacktests()}
          </div>
        </div>
      </div>
    `;

    this._renderTab(this._activeTab);
    if (s.script_status === 'generating') this._startPoll();
  },

  _switchTab(tab) {
    this._activeTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.id === `tab-${tab}`));
    this._renderTab(tab);
  },

  _renderTab(tab) {
    const el = document.getElementById('tab-content');
    if (!el) return;
    const s = this._strategy;

    if (tab === 'overview') {
      el.innerHTML = `
        <div style="color:var(--text-muted);font-size:14px;line-height:1.7;margin-bottom:20px;">${s.description || 'No description available.'}</div>

        ${s.step_wise_process?.length ? `
        <div style="margin-bottom:20px;">
          <h3 style="font-size:13px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">Step-by-Step Process</h3>
          <ol style="list-style:none;display:flex;flex-direction:column;gap:8px;">
            ${s.step_wise_process.map((step, i) => `
              <li style="display:flex;gap:12px;font-size:14px;">
                <span style="min-width:24px;height:24px;background:rgba(99,102,241,.15);color:#818cf8;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;flex-shrink:0;">${i+1}</span>
                <span style="color:#e2e8f0;line-height:1.5;">${step}</span>
              </li>`).join('')}
          </ol>
        </div>` : ''}

        ${s.entry_rules?.length ? `
        <div style="margin-bottom:20px;">
          <h3 style="font-size:13px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">Entry Rules</h3>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${s.entry_rules.map(r => `<div class="card rule-card-entry" style="padding:10px 14px;font-size:13px;color:#e2e8f0;line-height:1.5;">${r}</div>`).join('')}
          </div>
        </div>` : ''}

        ${s.exit_rules?.length ? `
        <div style="margin-bottom:20px;">
          <h3 style="font-size:13px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">Exit Rules</h3>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${s.exit_rules.map(r => `<div class="card rule-card-exit" style="padding:10px 14px;font-size:13px;color:#e2e8f0;line-height:1.5;">${r}</div>`).join('')}
          </div>
        </div>` : ''}

        <div style="display:flex;gap:20px;flex-wrap:wrap;">
          ${s.indicators?.length ? `
          <div style="flex:1;min-width:200px;">
            <h3 style="font-size:13px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">Indicators</h3>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">${s.indicators.map(i => `<span style="background:rgba(99,102,241,.12);color:#818cf8;padding:4px 12px;border-radius:6px;font-size:12px;">${i}</span>`).join('')}</div>
          </div>` : ''}

          ${s.candle_patterns?.length ? `
          <div style="flex:1;min-width:200px;">
            <h3 style="font-size:13px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">Candle Patterns</h3>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">${s.candle_patterns.map(p => `<span style="background:rgba(245,158,11,.1);color:#fbbf24;padding:4px 12px;border-radius:6px;font-size:12px;">${p}</span>`).join('')}</div>
          </div>` : ''}
        </div>
      `;
    } else if (tab === 'script') {
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <span style="font-size:13px;color:var(--text-muted);">
            ${s.script_generated_at ? `Generated ${new Date(s.script_generated_at).toLocaleString()}` : ''}
          </span>
          <button class="btn-secondary" style="font-size:12px;gap:5px;" onclick="StrategyDetailPage._regenerate()" id="regen-btn"
            ${s.script_status === 'generating' ? 'disabled' : ''}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Regenerate
          </button>
        </div>
        <div id="script-panel">${ScriptViewer.render(s.backtest_script)}</div>
      `;
      ScriptViewer.highlight();
    } else if (tab === 'history') {
      el.innerHTML = `<div id="history-list"><div class="skeleton" style="height:80px;"></div></div>`;
      this._loadHistory();
    }
  },

  async _loadHistory() {
    try {
      const history = await API.getScriptHistory(this._strategy.id);
      const el = document.getElementById('history-list');
      if (!el) return;
      if (!history.length) { el.innerHTML = `<p style="color:var(--text-muted);font-size:14px;">No history yet.</p>`; return; }
      el.innerHTML = history.map(h => `
        <div class="card" style="padding:16px;margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-size:14px;font-weight:600;">Version ${h.version}</span>
            <div style="display:flex;gap:8px;align-items:center;">
              <span style="background:rgba(99,102,241,.1);color:#818cf8;padding:2px 8px;border-radius:4px;font-size:11px;">${h.reason}</span>
              <span style="font-size:12px;color:var(--text-muted);">${new Date(h.generated_at).toLocaleString()}</span>
            </div>
          </div>
          <details style="cursor:pointer;">
            <summary style="font-size:12px;color:var(--text-muted);">View script</summary>
            <pre style="margin-top:10px;background:#0d0d17;border-radius:6px;padding:12px;font-size:12px;overflow:auto;max-height:300px;"><code class="language-python">${(h.script || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code></pre>
          </details>
        </div>
      `).join('');
      document.querySelectorAll('#history-list code').forEach(b => hljs && hljs.highlightElement(b));
    } catch (e) {
      Toast.error('Failed to load history');
    }
  },

  _renderBacktestCard() {
    const s = this._strategy;
    const disabled = s.script_status !== 'generated';
    const today = new Date().toISOString().split('T')[0];
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().split('T')[0];

    return `
      <div class="card" style="padding:20px;">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:16px;display:flex;align-items:center;gap:6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--indigo)" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>
          Run Backtest
        </h3>

        ${disabled ? `<div style="font-size:12px;color:var(--text-muted);background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:6px;padding:8px 12px;margin-bottom:14px;">Script must be generated before running a backtest.</div>` : ''}

        <div style="margin-bottom:12px;">
          <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:6px;">Symbols</label>
          <div id="symbol-tags" style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:6px;"></div>
          <input class="input-base" id="symbol-input" placeholder="Add symbol (press Enter)" style="font-size:13px;padding:8px 12px;"
            onkeydown="StrategyDetailPage._onSymbolKey(event)" ${disabled ? 'disabled' : ''} />
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
          <div>
            <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">Start Date</label>
            <input type="date" class="input-base" id="bt-start" value="${oneYearAgo}" style="font-size:13px;padding:8px 12px;" ${disabled ? 'disabled' : ''} />
          </div>
          <div>
            <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">End Date</label>
            <input type="date" class="input-base" id="bt-end" value="${today}" style="font-size:13px;padding:8px 12px;" ${disabled ? 'disabled' : ''} />
          </div>
        </div>

        <div style="margin-bottom:16px;">
          <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">Initial Capital</label>
          <div style="position:relative;">
            <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:13px;">$</span>
            <input type="number" class="input-base" id="bt-capital" value="100000" min="1" style="font-size:13px;padding:8px 12px;padding-left:26px;" ${disabled ? 'disabled' : ''} />
          </div>
        </div>

        <button class="btn-primary" style="width:100%;justify-content:center;" onclick="StrategyDetailPage._runBacktest()" ${disabled ? 'disabled' : ''} id="run-bt-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Run Backtest
        </button>
      </div>
    `;
  },

  _renderRecentBacktests() {
    const s = this._strategy;
    if (!s.backtests || s.backtests.length === 0) return '';
    return `
      <div class="card" style="padding:16px;">
        <h4 style="font-size:13px;font-weight:600;margin-bottom:12px;color:var(--text-muted);">Recent Backtests</h4>
        ${s.backtests.slice(0, 5).map(b => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
            <div>
              <div style="font-size:12px;font-weight:500;">${(b.symbols || []).join(', ')}</div>
              <div style="font-size:11px;color:var(--text-muted);">${b.start_date} → ${b.end_date}</div>
            </div>
            <div style="display:flex;gap:6px;align-items:center;">
              <span class="badge badge-${b.status}" style="font-size:10px;">${b.status}</span>
              <a data-link href="/backtests/${b.id}" style="font-size:11px;color:var(--indigo);">View</a>
            </div>
          </div>`).join('')}
      </div>
    `;
  },

  _onSymbolKey(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = e.target.value.trim().toUpperCase().replace(/,/g, '');
      if (val && !this._symbols.includes(val)) {
        this._symbols.push(val);
        this._renderSymbolTags();
      }
      e.target.value = '';
    }
  },

  _renderSymbolTags() {
    const el = document.getElementById('symbol-tags');
    if (!el) return;
    el.innerHTML = this._symbols.map(sym => `
      <span class="tag">${sym}<button onclick="StrategyDetailPage._removeSymbol('${sym}')">×</button></span>
    `).join('');
  },

  _removeSymbol(sym) {
    this._symbols = this._symbols.filter(s => s !== sym);
    this._renderSymbolTags();
  },

  async _runBacktest() {
    const symbols = [...this._symbols];
    const inline = document.getElementById('symbol-input')?.value?.trim()?.toUpperCase();
    if (inline) symbols.push(inline);

    if (!symbols.length) { Toast.warning('Add at least one symbol'); return; }

    const start = document.getElementById('bt-start')?.value;
    const end = document.getElementById('bt-end')?.value;
    const capital = parseFloat(document.getElementById('bt-capital')?.value);

    if (!start || !end) { Toast.warning('Select date range'); return; }

    const btn = document.getElementById('run-bt-btn');
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Queuing...`;

    try {
      const run = await API.createBacktest({
        strategy_id: this._strategy.id,
        symbols,
        start_date: start,
        end_date: end,
        initial_capital: capital || 100000,
      });
      Toast.success('Backtest queued!');
      App.navigate('/backtests/' + run.id);
    } catch (e) {
      Toast.error('Failed to start backtest: ' + e.message);
      btn.disabled = false;
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run Backtest`;
    }
  },

  async _regenerate() {
    const btn = document.getElementById('regen-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> Starting...`; }
    try {
      await API.regenerateScript(this._strategy.id);
      Toast.info('Script regeneration started');
      this._strategy.script_status = 'generating';
      this._startPoll();
    } catch (e) {
      Toast.error('Failed to start regeneration: ' + e.message);
      if (btn) { btn.disabled = false; btn.innerHTML = `Regenerate`; }
    }
  },

  _startPoll() {
    this._cleanup();
    this._pollInterval = setInterval(async () => {
      try {
        const status = await API.getStrategyStatus(this._strategy.id);
        if (status.script_status !== 'generating') {
          this._cleanup();
          this._strategy = await API.getStrategy(this._strategy.id);
          const container = document.getElementById('detail-content')?.parentElement;
          if (container) this._renderFull(container);
          if (status.script_status === 'generated') Toast.success('Script generated!');
          else if (status.script_status === 'failed') Toast.error('Script generation failed: ' + status.script_error);
        }
      } catch (e) {}
    }, 5000);
  },

  _cleanup() {
    if (this._pollInterval) { clearInterval(this._pollInterval); this._pollInterval = null; }
  }
};
