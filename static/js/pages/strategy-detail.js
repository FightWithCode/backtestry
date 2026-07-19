// strategy-detail.js — full strategy detail page
const StrategyDetailPage = {
  _strategy: null,
  _activeTab: 'overview',
  _pollInterval: null,
  _symbols: [],
  _universes: [],

  async render(container, params) {
    const id = params.id;
    this._cleanup();
    this._activeTab = 'overview';
    this._symbols = [];
    this._universes = [];

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
      const [strategy, universes] = await Promise.all([API.getStrategy(id), UniversePicker.fetch()]);
      this._strategy = strategy;
      this._universes = universes;
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
              <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
                <span class="badge badge-${s.script_status}">${s.script_status.replace('_',' ')}</span>
                <button onclick="StrategyDetailPage._openEditModal()" class="btn-secondary" style="padding:5px 10px;" title="Edit strategy">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button onclick="StrategyDetailPage._confirmDelete()" class="btn-secondary" style="padding:5px 10px;color:#ef4444;border-color:rgba(239,68,68,.25);" title="Delete strategy">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                </button>
              </div>
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
            ${[['overview','Overview'],['config','Config'],['history','History']].map(([id,label]) => `
              <button class="tab-btn ${this._activeTab === id ? 'active' : ''}" id="tab-${id}" onclick="StrategyDetailPage._switchTab('${id}')" style="border-radius:8px 8px 0 0;">${label}</button>
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

        ${Array.isArray(s.step_wise_process) && s.step_wise_process.length ? `
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

        ${Array.isArray(s.entry_rules) && s.entry_rules.length ? `
        <div style="margin-bottom:20px;">
          <h3 style="font-size:13px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">Entry Rules</h3>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${s.entry_rules.map(r => `<div class="card rule-card-entry" style="padding:10px 14px;font-size:13px;color:#e2e8f0;line-height:1.5;">${r}</div>`).join('')}
          </div>
        </div>` : ''}

        ${Array.isArray(s.exit_rules) && s.exit_rules.length ? `
        <div style="margin-bottom:20px;">
          <h3 style="font-size:13px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">Exit Rules</h3>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${s.exit_rules.map(r => `<div class="card rule-card-exit" style="padding:10px 14px;font-size:13px;color:#e2e8f0;line-height:1.5;">${r}</div>`).join('')}
          </div>
        </div>` : ''}

        <div style="display:flex;gap:20px;flex-wrap:wrap;">
          ${Array.isArray(s.indicators) && s.indicators.length ? `
          <div style="flex:1;min-width:200px;">
            <h3 style="font-size:13px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">Indicators</h3>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">${s.indicators.map(i => `<span style="background:rgba(99,102,241,.12);color:#818cf8;padding:4px 12px;border-radius:6px;font-size:12px;">${i}</span>`).join('')}</div>
          </div>` : ''}

          ${Array.isArray(s.candle_patterns) && s.candle_patterns.length ? `
          <div style="flex:1;min-width:200px;">
            <h3 style="font-size:13px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">Candle Patterns</h3>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">${s.candle_patterns.map(p => `<span style="background:rgba(245,158,11,.1);color:#fbbf24;padding:4px 12px;border-radius:6px;font-size:12px;">${p}</span>`).join('')}</div>
          </div>` : ''}
        </div>
      `;
    } else if (tab === 'config') {
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <span style="font-size:13px;color:var(--text-muted);">
            ${s.script_generated_at ? `Generated ${new Date(s.script_generated_at).toLocaleString()}` : ''}
          </span>
          <div style="display:flex;gap:8px;">
            <button class="btn-secondary" style="font-size:12px;gap:5px;" onclick="StrategyDetailPage._toggleConfigEdit()" id="edit-config-btn"
              ${s.script_status === 'generating' || !s.backtest_script ? 'disabled' : ''}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit
            </button>
            <button class="btn-secondary" style="font-size:12px;gap:5px;" onclick="StrategyDetailPage._regenerate()" id="regen-btn"
              ${s.script_status === 'generating' ? 'disabled' : ''}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              Regenerate
            </button>
          </div>
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

  _toggleConfigEdit() {
    const s = this._strategy;
    const panel = document.getElementById('script-panel');
    if (!panel) return;

    let formatted = s.backtest_script || '';
    try { formatted = JSON.stringify(JSON.parse(s.backtest_script), null, 2); } catch (_) {}

    panel.innerHTML = `
      <textarea id="config-editor" class="input-base" spellcheck="false"
        style="font-family:'SF Mono',Consolas,monospace;font-size:12.5px;line-height:1.6;width:100%;min-height:420px;resize:vertical;padding:14px;">${formatted.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
      <div id="config-edit-error" style="display:none;font-size:12px;color:#f87171;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:6px;padding:8px 12px;margin-top:10px;"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;">
        <button class="btn-secondary" style="padding:7px 14px;font-size:13px;" onclick="StrategyDetailPage._cancelConfigEdit()">Cancel</button>
        <button class="btn-primary" style="padding:7px 14px;font-size:13px;" id="save-config-btn" onclick="StrategyDetailPage._saveConfig()">Save Config</button>
      </div>
    `;

    document.getElementById('edit-config-btn')?.setAttribute('disabled', 'true');
    document.getElementById('regen-btn')?.setAttribute('disabled', 'true');
  },

  _cancelConfigEdit() {
    this._renderTab('config');
  },

  async _saveConfig() {
    const textarea = document.getElementById('config-editor');
    const errorBox = document.getElementById('config-edit-error');
    const raw = textarea.value;

    try {
      JSON.parse(raw);
    } catch (e) {
      errorBox.style.display = 'block';
      errorBox.textContent = 'Invalid JSON: ' + e.message;
      return;
    }

    const btn = document.getElementById('save-config-btn');
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Saving...`;
    errorBox.style.display = 'none';

    try {
      this._strategy = await API.updateConfig(this._strategy.id, raw);
      Toast.success('Config updated');
      this._renderTab('config');
    } catch (e) {
      errorBox.style.display = 'block';
      errorBox.textContent = e.message;
      btn.disabled = false;
      btn.innerHTML = 'Save Config';
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

        ${disabled ? `<div style="font-size:12px;color:var(--text-muted);background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:6px;padding:8px 12px;margin-bottom:14px;">Config must be generated before running a backtest.</div>` : ''}

        <div style="margin-bottom:12px;">
          <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">Timeframe</label>
          <select class="input-base" id="bt-timeframe" style="font-size:13px;padding:8px 12px;" ${disabled ? 'disabled' : ''}>
            ${['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1wk', '1mo'].map(tf => `<option value="${tf}" ${s.timeframe === tf ? 'selected' : ''}>${tf}${s.timeframe === tf ? ' (strategy default)' : ''}</option>`).join('')}
          </select>
          <div style="font-size:11px;color:var(--text-muted);margin-top:5px;">Runs the same rules on different candle sizes — indicator lengths (e.g. RSI 5) stay in bars, so results will differ from the strategy's native timeframe. Intraday intervals are limited to the last 59 days of history.</div>
        </div>

        <div style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <label style="font-size:12px;color:var(--text-muted);">Symbols</label>
            <button type="button" class="btn-secondary" style="padding:2px 8px;font-size:11px;" onclick="StrategyDetailPage._clearSymbols()" ${disabled ? 'disabled' : ''}>Clear</button>
          </div>
          <select class="input-base" id="bt-universe-picker" style="font-size:12px;padding:7px 10px;margin-bottom:8px;" onchange="StrategyDetailPage._loadUniverseSymbols(this.value)" ${disabled ? 'disabled' : ''}>
            ${UniversePicker.optionsHtml(this._universes)}
          </select>
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

  async _loadUniverseSymbols(universeId) {
    if (!universeId) return;
    const universe = UniversePicker.find(this._universes, universeId);
    if (!universe) return;
    const provider = await UniversePicker.getEffectiveProvider();
    const symbols = UniversePicker.adaptSymbols(universe.symbols, provider);
    let added = 0;
    for (const sym of symbols) {
      if (!this._symbols.includes(sym)) { this._symbols.push(sym); added++; }
    }
    this._renderSymbolTags();
    const picker = document.getElementById('bt-universe-picker');
    if (picker) picker.value = '';
    Toast.success(`Added ${added} symbol(s) from ${universe.name}`);
  },

  _clearSymbols() {
    if (!this._symbols.length) return;
    this._symbols = [];
    this._renderSymbolTags();
    const input = document.getElementById('symbol-input');
    if (input) input.value = '';
  },

  async _runBacktest() {
    const symbols = [...this._symbols];
    const inline = document.getElementById('symbol-input')?.value?.trim()?.toUpperCase();
    if (inline) symbols.push(inline);

    if (!symbols.length) { Toast.warning('Add at least one symbol'); return; }

    const start = document.getElementById('bt-start')?.value;
    const end = document.getElementById('bt-end')?.value;
    const capital = parseFloat(document.getElementById('bt-capital')?.value);
    const timeframe = document.getElementById('bt-timeframe')?.value;

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
        timeframe: timeframe && timeframe !== this._strategy.timeframe ? timeframe : '',
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

  _openEditModal() {
    const s = this._strategy;
    const timeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1wk', '1mo'];

    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:1000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);padding:20px;`;
    overlay.innerHTML = `
      <div class="card" style="padding:28px;max-width:560px;width:100%;max-height:85vh;overflow:auto;animation:pageEnter .2s ease;">
        <h3 style="font-size:16px;font-weight:600;margin-bottom:18px;">Edit Strategy</h3>

        <div style="margin-bottom:14px;">
          <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">Name</label>
          <input class="input-base" id="edit-name" value="${(s.name || '').replace(/"/g, '&quot;')}" style="font-size:13px;padding:8px 12px;" />
        </div>

        <div style="margin-bottom:14px;">
          <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">Timeframe</label>
          <select class="input-base" id="edit-timeframe" style="font-size:13px;padding:8px 12px;">
            ${timeframes.map(tf => `<option value="${tf}" ${s.timeframe === tf ? 'selected' : ''}>${tf}</option>`).join('')}
          </select>
        </div>

        <div style="margin-bottom:14px;">
          <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">Description</label>
          <textarea class="input-base" id="edit-description" rows="3" style="font-size:13px;padding:8px 12px;resize:vertical;">${s.description || ''}</textarea>
        </div>

        <div style="margin-bottom:14px;">
          <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">Entry Rules <span style="opacity:.6;">(one per line)</span></label>
          <textarea class="input-base" id="edit-entry-rules" rows="4" style="font-size:13px;padding:8px 12px;resize:vertical;">${(s.entry_rules || []).join('\n')}</textarea>
        </div>

        <div style="margin-bottom:14px;">
          <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">Exit Rules <span style="opacity:.6;">(one per line)</span></label>
          <textarea class="input-base" id="edit-exit-rules" rows="4" style="font-size:13px;padding:8px 12px;resize:vertical;">${(s.exit_rules || []).join('\n')}</textarea>
        </div>

        <div style="margin-bottom:14px;">
          <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">Indicators <span style="opacity:.6;">(comma-separated)</span></label>
          <input class="input-base" id="edit-indicators" value="${(s.indicators || []).join(', ')}" style="font-size:13px;padding:8px 12px;" />
        </div>

        <div style="margin-bottom:18px;">
          <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">Candle Patterns <span style="opacity:.6;">(comma-separated)</span></label>
          <input class="input-base" id="edit-candle-patterns" value="${(s.candle_patterns || []).join(', ')}" style="font-size:13px;padding:8px 12px;" />
        </div>

        <div style="font-size:12px;color:var(--text-muted);background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:6px;padding:8px 12px;margin-bottom:20px;">
          Editing rules, indicators, or timeframe only updates the stored description — hit <strong>Regenerate</strong> on the Config tab afterward to rebuild the backtest logic from your changes.
        </div>

        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button id="edit-cancel-btn" class="btn-secondary" style="padding:8px 16px;">Cancel</button>
          <button id="edit-save-btn" class="btn-primary" style="padding:8px 16px;">Save Changes</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('edit-cancel-btn').onclick = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    document.getElementById('edit-save-btn').onclick = async () => {
      const name = document.getElementById('edit-name').value.trim();
      if (!name) { Toast.warning('Name cannot be blank'); return; }

      const payload = {
        name,
        timeframe: document.getElementById('edit-timeframe').value,
        description: document.getElementById('edit-description').value.trim(),
        entry_rules: document.getElementById('edit-entry-rules').value.split('\n').map(r => r.trim()).filter(Boolean),
        exit_rules: document.getElementById('edit-exit-rules').value.split('\n').map(r => r.trim()).filter(Boolean),
        indicators: document.getElementById('edit-indicators').value.split(',').map(r => r.trim()).filter(Boolean),
        candle_patterns: document.getElementById('edit-candle-patterns').value.split(',').map(r => r.trim()).filter(Boolean),
      };

      const btn = document.getElementById('edit-save-btn');
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span> Saving...`;
      try {
        this._strategy = await API.updateStrategy(s.id, payload);
        overlay.remove();
        Toast.success('Strategy updated');
        const container = document.getElementById('detail-content')?.parentElement;
        if (container) this._renderFull(container);
      } catch (e) {
        Toast.error('Failed to save: ' + e.message);
        btn.disabled = false;
        btn.innerHTML = 'Save Changes';
      }
    };
  },

  _confirmDelete() {
    const s = this._strategy;
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:1000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);`;
    overlay.innerHTML = `
      <div class="card" style="padding:28px;max-width:380px;width:90%;animation:pageEnter .2s ease;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          <div style="width:36px;height:36px;background:rgba(239,68,68,.12);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </div>
          <h3 style="font-size:16px;font-weight:600;">Delete Strategy</h3>
        </div>
        <p style="font-size:14px;color:var(--text-muted);margin-bottom:6px;">Are you sure you want to delete</p>
        <p style="font-size:14px;color:#fff;font-weight:600;margin-bottom:20px;">"${s.name}"?</p>
        <p style="font-size:12px;color:var(--text-muted);margin-bottom:20px;">This will permanently delete the strategy and all its backtest history.</p>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button id="delete-cancel-btn" class="btn-secondary" style="padding:8px 16px;">Cancel</button>
          <button id="delete-confirm-btn" class="btn-primary" style="padding:8px 16px;background:#ef4444;">Delete</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('delete-cancel-btn').onclick = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    document.getElementById('delete-confirm-btn').onclick = async () => {
      const btn = document.getElementById('delete-confirm-btn');
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span> Deleting...`;
      try {
        await API.deleteStrategy(s.id);
        overlay.remove();
        Toast.success('Strategy deleted');
        App.navigate('/strategies');
      } catch (e) {
        Toast.error('Failed to delete: ' + e.message);
        overlay.remove();
      }
    };
  },

  _cleanup() {
    if (this._pollInterval) { clearInterval(this._pollInterval); this._pollInterval = null; }
  }
};
