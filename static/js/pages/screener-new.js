// screener-new.js — configure and launch a screener scan
const ScreenerNewPage = {
  _strategies: [],
  _universes: [],
  _strategy: null,
  _useCustomSymbols: false,

  async render(container) {
    this._strategy = null;
    this._useCustomSymbols = false;

    container.innerHTML = `
      <div class="page-enter" style="max-width:680px;margin:0 auto;">
        <div style="margin-bottom:28px;">
          <a data-link href="/screener" style="font-size:13px;color:var(--text-muted);text-decoration:none;display:inline-flex;align-items:center;gap:5px;margin-bottom:12px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            Back to Screener
          </a>
          <h1 style="font-size:24px;font-weight:700;margin-bottom:4px;">New Scan</h1>
          <p style="color:var(--text-muted);font-size:14px;">Checks every symbol in a universe against a strategy's entry rules, evaluated at the latest available bar.</p>
        </div>

        <div class="card" style="padding:28px;margin-bottom:20px;">
          <div style="margin-bottom:16px;">
            <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">Strategy</label>
            <select class="input-base" id="scr-strategy" style="font-size:13px;padding:9px 12px;" onchange="ScreenerNewPage._onStrategyChange(this.value)">
              <option value="">Loading strategies...</option>
            </select>
          </div>

          <div style="margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
              <label style="font-size:12px;color:var(--text-muted);">Universe</label>
              <label style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:5px;cursor:pointer;">
                <input type="checkbox" id="scr-custom-toggle" onchange="ScreenerNewPage._toggleCustom(this.checked)" />
                Use a custom list instead
              </label>
            </div>
            <select class="input-base" id="scr-universe" style="font-size:13px;padding:9px 12px;">
              <option value="">Loading universes...</option>
            </select>
            <div id="scr-symbols-wrap" style="display:none;margin-top:8px;">
              <div style="display:flex;justify-content:flex-end;margin-bottom:5px;">
                <button type="button" class="btn-secondary" style="padding:2px 8px;font-size:11px;" onclick="ScreenerNewPage._clearSymbols()">Clear</button>
              </div>
              <textarea class="input-base" id="scr-symbols" rows="5" style="font-size:12px;font-family:monospace;padding:8px 10px;" placeholder="RELIANCE, TCS, INFY&#10;(comma or newline separated — bare NSE symbols; a trailing .NS/.BO is stripped automatically)"></textarea>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
            <div>
              <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">As Of Date</label>
              <input type="date" class="input-base" id="scr-asof" value="${new Date().toISOString().split('T')[0]}" style="font-size:13px;padding:9px 12px;" />
            </div>
            <div>
              <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">Timeframe</label>
              <select class="input-base" id="scr-timeframe" style="font-size:13px;padding:9px 12px;">
                ${['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1wk', '1mo'].map(tf => `<option value="${tf}" ${tf === '1d' ? 'selected' : ''}>${tf}</option>`).join('')}
              </select>
            </div>
          </div>

          <div style="margin-bottom:6px;">
            <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">Lookback Days <span style="opacity:.6;">(history fetched to warm up indicators)</span></label>
            <input type="number" class="input-base" id="scr-lookback" value="400" min="60" max="1500" style="font-size:13px;padding:9px 12px;" />
          </div>
        </div>

        <div class="card" style="padding:16px 20px;margin-bottom:20px;font-size:12px;color:var(--text-muted);background:rgba(245,158,11,.06);border-color:rgba(245,158,11,.2);">
          Scanning a large universe fetches data for every symbol sequentially and can take a while — the page will show a running state and poll until it's done. Only entry rules are checked; stop/target levels shown per signal are computed from the strategy's own exit rules against the latest close.
        </div>

        <button class="btn-primary" id="submit-scr-btn" style="width:100%;justify-content:center;padding:12px;" onclick="ScreenerNewPage._submit()" disabled>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          Run Scan
        </button>
      </div>
    `;

    try {
      const [strategies, universes] = await Promise.all([
        API.getStrategies().then(list => list.filter(s => s.script_status === 'generated')),
        API.getUniverses(),
      ]);
      this._strategies = strategies;
      this._universes = universes;

      const stratSelect = document.getElementById('scr-strategy');
      stratSelect.innerHTML = strategies.length
        ? `<option value="">Select a strategy...</option>` + strategies.map(s => `<option value="${s.id}">${s.name}</option>`).join('')
        : `<option value="">No generated strategies available</option>`;

      const uniSelect = document.getElementById('scr-universe');
      uniSelect.innerHTML = UniversePicker.optionsHtml(universes, 'Select a universe...');

      this._updateSubmitState();
    } catch (e) {
      Toast.error('Failed to load: ' + e.message);
    }
  },

  _onStrategyChange(id) {
    this._strategy = this._strategies.find(s => s.id === id) || null;
    const tfSelect = document.getElementById('scr-timeframe');
    if (this._strategy && tfSelect) {
      Array.from(tfSelect.options).forEach(o => { o.selected = o.value === this._strategy.timeframe; });
    }
    this._updateSubmitState();
  },

  _toggleCustom(checked) {
    this._useCustomSymbols = checked;
    document.getElementById('scr-universe').style.display = checked ? 'none' : '';
    document.getElementById('scr-symbols-wrap').style.display = checked ? '' : 'none';
    this._updateSubmitState();
  },

  _clearSymbols() {
    const el = document.getElementById('scr-symbols');
    if (el) el.value = '';
  },

  _updateSubmitState() {
    const btn = document.getElementById('submit-scr-btn');
    if (!btn) return;
    btn.disabled = !this._strategy;
  },

  async _submit() {
    if (!this._strategy) { Toast.warning('Select a strategy'); return; }

    let payload = {
      strategy_id: this._strategy.id,
      timeframe: document.getElementById('scr-timeframe')?.value || '',
      as_of_date: document.getElementById('scr-asof')?.value,
      lookback_days: parseInt(document.getElementById('scr-lookback')?.value, 10) || 400,
    };

    if (this._useCustomSymbols) {
      const raw = document.getElementById('scr-symbols')?.value || '';
      const symbols = raw.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
      if (!symbols.length) { Toast.warning('Enter at least one symbol'); return; }
      payload.symbols = symbols;
    } else {
      const universeId = document.getElementById('scr-universe')?.value;
      if (!universeId) { Toast.warning('Select a universe (or switch to a custom list)'); return; }
      payload.universe_id = universeId;
    }

    const btn = document.getElementById('submit-scr-btn');
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Queuing scan...`;

    try {
      const run = await API.createScreenerRun(payload);
      Toast.success('Scan queued!');
      App.navigate('/screener/' + run.id);
    } catch (e) {
      Toast.error('Failed to start scan: ' + e.message);
      btn.disabled = false;
      btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Run Scan`;
    }
  }
};
