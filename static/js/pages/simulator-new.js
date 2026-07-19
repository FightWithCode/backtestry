// simulator-new.js — configure and launch a walk-forward simulation
const SimulatorNewPage = {
  _strategies: [],
  _universes: [],
  _strategy: null,
  _useCustomSymbols: false,

  async render(container) {
    this._strategy = null;
    this._useCustomSymbols = false;

    const today = new Date().toISOString().split('T')[0];
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().split('T')[0];

    container.innerHTML = `
      <div class="page-enter" style="max-width:680px;margin:0 auto;">
        <div style="margin-bottom:28px;">
          <a data-link href="/simulator" style="font-size:13px;color:var(--text-muted);text-decoration:none;display:inline-flex;align-items:center;gap:5px;margin-bottom:12px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            Back to Simulator
          </a>
          <h1 style="font-size:24px;font-weight:700;margin-bottom:4px;">New Simulation</h1>
          <p style="color:var(--text-muted);font-size:14px;">Walks forward day by day across the whole universe, holding at most one position at a time, sized by risk, compounding capital trade to trade.</p>
        </div>

        <div class="card" style="padding:28px;margin-bottom:20px;">
          <div style="margin-bottom:16px;">
            <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">Strategy</label>
            <select class="input-base" id="sim-strategy" style="font-size:13px;padding:9px 12px;" onchange="SimulatorNewPage._onStrategyChange(this.value)">
              <option value="">Loading strategies...</option>
            </select>
          </div>

          <div style="margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
              <label style="font-size:12px;color:var(--text-muted);">Universe</label>
              <label style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:5px;cursor:pointer;">
                <input type="checkbox" id="sim-custom-toggle" onchange="SimulatorNewPage._toggleCustom(this.checked)" />
                Use a custom list instead
              </label>
            </div>
            <select class="input-base" id="sim-universe" style="font-size:13px;padding:9px 12px;">
              <option value="">Loading universes...</option>
            </select>
            <div id="sim-symbols-wrap" style="display:none;margin-top:8px;">
              <div style="display:flex;justify-content:flex-end;margin-bottom:5px;">
                <button type="button" class="btn-secondary" style="padding:2px 8px;font-size:11px;" onclick="SimulatorNewPage._clearSymbols()">Clear</button>
              </div>
              <textarea class="input-base" id="sim-symbols" rows="5" style="font-size:12px;font-family:monospace;padding:8px 10px;" placeholder="RELIANCE, TCS, INFY&#10;(comma or newline separated — bare NSE symbols; a trailing .NS/.BO is stripped automatically)"></textarea>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
            <div>
              <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">Start Date</label>
              <input type="date" class="input-base" id="sim-start" value="${oneYearAgo}" style="font-size:13px;padding:9px 12px;" />
            </div>
            <div>
              <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">End Date</label>
              <input type="date" class="input-base" id="sim-end" value="${today}" style="font-size:13px;padding:9px 12px;" />
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
            <div>
              <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">Initial Capital</label>
              <div style="position:relative;">
                <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:13px;">$</span>
                <input type="number" class="input-base" id="sim-capital" value="100000" min="1" style="font-size:13px;padding:9px 12px;padding-left:26px;" />
              </div>
            </div>
            <div>
              <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">Risk per Trade (%)</label>
              <input type="number" class="input-base" id="sim-risk" value="2" min="0.1" max="100" step="0.1" style="font-size:13px;padding:9px 12px;" />
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:6px;">
            <div>
              <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">Timeframe</label>
              <select class="input-base" id="sim-timeframe" style="font-size:13px;padding:9px 12px;">
                ${['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1wk', '1mo'].map(tf => `<option value="${tf}" ${tf === '1d' ? 'selected' : ''}>${tf}</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">Commission %</label>
              <input type="number" class="input-base" id="sim-commission" value="0" min="0" step="0.01" style="font-size:13px;padding:9px 12px;" />
            </div>
            <div>
              <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">Slippage %</label>
              <input type="number" class="input-base" id="sim-slippage" value="0" min="0" step="0.01" style="font-size:13px;padding:9px 12px;" />
            </div>
          </div>
        </div>

        <div class="card" style="padding:16px 20px;margin-bottom:20px;font-size:12px;color:var(--text-muted);background:rgba(245,158,11,.06);border-color:rgba(245,158,11,.2);">
          Position size is risk-based: qty = (available capital × risk%) ÷ (entry price − stop price), capped at what current capital can actually buy — no margin. If the matched entry has no declared stop, sizing falls back to full-capital notional. Only one position is ever open; ties on the same day are broken by universe order. Simulating a large universe over a long date range fetches every symbol sequentially and can take a while.
        </div>

        <button class="btn-primary" id="submit-sim-btn" style="width:100%;justify-content:center;padding:12px;" onclick="SimulatorNewPage._submit()" disabled>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Run Simulation
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

      const stratSelect = document.getElementById('sim-strategy');
      stratSelect.innerHTML = strategies.length
        ? `<option value="">Select a strategy...</option>` + strategies.map(s => `<option value="${s.id}">${s.name}</option>`).join('')
        : `<option value="">No generated strategies available</option>`;

      const uniSelect = document.getElementById('sim-universe');
      uniSelect.innerHTML = UniversePicker.optionsHtml(universes, 'Select a universe...');

      this._updateSubmitState();
    } catch (e) {
      Toast.error('Failed to load: ' + e.message);
    }
  },

  _onStrategyChange(id) {
    this._strategy = this._strategies.find(s => s.id === id) || null;
    const tfSelect = document.getElementById('sim-timeframe');
    if (this._strategy && tfSelect) {
      Array.from(tfSelect.options).forEach(o => { o.selected = o.value === this._strategy.timeframe; });
    }
    this._updateSubmitState();
  },

  _toggleCustom(checked) {
    this._useCustomSymbols = checked;
    document.getElementById('sim-universe').style.display = checked ? 'none' : '';
    document.getElementById('sim-symbols-wrap').style.display = checked ? '' : 'none';
    this._updateSubmitState();
  },

  _clearSymbols() {
    const el = document.getElementById('sim-symbols');
    if (el) el.value = '';
  },

  _updateSubmitState() {
    const btn = document.getElementById('submit-sim-btn');
    if (!btn) return;
    btn.disabled = !this._strategy;
  },

  async _submit() {
    if (!this._strategy) { Toast.warning('Select a strategy'); return; }

    const start = document.getElementById('sim-start')?.value;
    const end = document.getElementById('sim-end')?.value;
    if (!start || !end) { Toast.warning('Select a date range'); return; }
    if (start >= end) { Toast.warning('End date must be after start date'); return; }

    let payload = {
      strategy_id: this._strategy.id,
      timeframe: document.getElementById('sim-timeframe')?.value || '',
      start_date: start,
      end_date: end,
      initial_capital: parseFloat(document.getElementById('sim-capital')?.value) || 100000,
      risk_pct: parseFloat(document.getElementById('sim-risk')?.value) || 2,
      commission_pct: parseFloat(document.getElementById('sim-commission')?.value) || 0,
      slippage_pct: parseFloat(document.getElementById('sim-slippage')?.value) || 0,
    };

    if (this._useCustomSymbols) {
      const raw = document.getElementById('sim-symbols')?.value || '';
      const symbols = raw.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
      if (!symbols.length) { Toast.warning('Enter at least one symbol'); return; }
      payload.symbols = symbols;
    } else {
      const universeId = document.getElementById('sim-universe')?.value;
      if (!universeId) { Toast.warning('Select a universe (or switch to a custom list)'); return; }
      payload.universe_id = universeId;
    }

    const btn = document.getElementById('submit-sim-btn');
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Queuing simulation...`;

    try {
      const run = await API.createSimulatorRun(payload);
      Toast.success('Simulation queued!');
      App.navigate('/simulator/' + run.id);
    } catch (e) {
      Toast.error('Failed to start simulation: ' + e.message);
      btn.disabled = false;
      btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run Simulation`;
    }
  }
};
