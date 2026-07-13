// lab-new.js — create a new parameter-sweep lab run
const LabNewPage = {
  _strategies: [],
  _strategy: null,
  _tunables: [],
  _symbols: [],
  _maxVariants: 60,
  _maxTotal: 400,

  async render(container) {
    this._strategy = null;
    this._tunables = [];
    this._symbols = [];

    container.innerHTML = `
      <div class="page-enter" style="max-width:760px;margin:0 auto;">
        <div style="margin-bottom:28px;">
          <a data-link href="/lab" style="font-size:13px;color:var(--text-muted);text-decoration:none;display:inline-flex;align-items:center;gap:5px;margin-bottom:12px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            Back to Lab
          </a>
          <h1 style="font-size:24px;font-weight:700;margin-bottom:4px;">New Parameter Sweep</h1>
          <p style="color:var(--text-muted);font-size:14px;">Backtest one strategy across many symbols and many indicator/exit-value combinations at once. Overrides only apply for this run — the saved strategy is never modified.</p>
        </div>

        <div class="card" style="padding:28px;margin-bottom:20px;">
          <div style="margin-bottom:16px;">
            <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">Strategy</label>
            <select class="input-base" id="lab-strategy" style="font-size:13px;padding:9px 12px;" onchange="LabNewPage._onStrategyChange(this.value)">
              <option value="">Loading strategies...</option>
            </select>
          </div>

          <div style="margin-bottom:16px;">
            <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">Run label <span style="opacity:.6;">(optional)</span></label>
            <input class="input-base" id="lab-name" placeholder="e.g. RSI length sweep on tech names" style="font-size:13px;padding:9px 12px;" />
          </div>

          <div style="margin-bottom:16px;">
            <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:6px;">Symbols <span style="opacity:.6;">(as many as you like)</span></label>
            <div id="symbol-tags" style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:6px;"></div>
            <input class="input-base" id="symbol-input" placeholder="Add symbol (press Enter)" style="font-size:13px;padding:9px 12px;"
              onkeydown="LabNewPage._onSymbolKey(event)" oninput="LabNewPage._updateCount()" />
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
            <div>
              <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">Start Date</label>
              <input type="date" class="input-base" id="lab-start" value="${new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().split('T')[0]}" style="font-size:13px;padding:9px 12px;" />
            </div>
            <div>
              <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">End Date</label>
              <input type="date" class="input-base" id="lab-end" value="${new Date().toISOString().split('T')[0]}" style="font-size:13px;padding:9px 12px;" />
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;">
            <div>
              <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">Capital</label>
              <input type="number" class="input-base" id="lab-capital" value="100000" min="1" style="font-size:13px;padding:9px 12px;" />
            </div>
            <div>
              <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">Timeframe</label>
              <select class="input-base" id="lab-timeframe" style="font-size:13px;padding:9px 12px;">
                ${['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1wk', '1mo'].map(tf => `<option value="${tf}">${tf}</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">Commission %</label>
              <input type="number" class="input-base" id="lab-commission" value="0" min="0" step="0.01" style="font-size:13px;padding:9px 12px;" />
            </div>
            <div>
              <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">Slippage %</label>
              <input type="number" class="input-base" id="lab-slippage" value="0" min="0" step="0.01" style="font-size:13px;padding:9px 12px;" />
            </div>
          </div>
        </div>

        <div class="card" style="padding:28px;margin-bottom:20px;">
          <h3 style="font-size:14px;font-weight:600;margin-bottom:4px;">Parameter Sweep</h3>
          <p style="font-size:12px;color:var(--text-muted);margin-bottom:16px;">Only indicator lengths and exit stop/target/profit values can be swept — entry/exit conditions always stay exactly as the strategy defines them. The strategy's own unmodified config always runs alongside your overrides as a "Base" variant, so results are directly comparable against it.</p>
          <div id="tunables-panel">
            <div style="font-size:13px;color:var(--text-muted);">Select a strategy above to load its tunable parameters.</div>
          </div>
        </div>

        <div class="card" style="padding:20px 28px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;">
          <div id="variant-count-display" style="font-size:13px;color:var(--text-muted);">0 variant(s) × 0 symbol(s) = 0 backtest(s)</div>
          <button class="btn-primary" id="submit-lab-btn" onclick="LabNewPage._submit()" disabled>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Run Sweep
          </button>
        </div>
      </div>
    `;

    try {
      const strategies = (await API.getStrategies()).filter(s => s.script_status === 'generated');
      this._strategies = strategies;
      const select = document.getElementById('lab-strategy');
      if (!strategies.length) {
        select.innerHTML = `<option value="">No generated strategies available</option>`;
        return;
      }
      select.innerHTML = `<option value="">Select a strategy...</option>` +
        strategies.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    } catch (e) {
      Toast.error('Failed to load strategies: ' + e.message);
    }
  },

  async _onStrategyChange(id) {
    this._strategy = this._strategies.find(s => s.id === id) || null;
    this._tunables = [];
    const panel = document.getElementById('tunables-panel');

    if (!this._strategy) {
      panel.innerHTML = `<div style="font-size:13px;color:var(--text-muted);">Select a strategy above to load its tunable parameters.</div>`;
      this._updateCount();
      return;
    }

    const tfSelect = document.getElementById('lab-timeframe');
    if (tfSelect) {
      Array.from(tfSelect.options).forEach(o => { o.selected = o.value === this._strategy.timeframe; });
    }

    panel.innerHTML = `<div class="skeleton" style="height:100px;"></div>`;
    try {
      const data = await API.getTunables(id);
      this._tunables = data.tunables || [];
      this._renderTunables();
    } catch (e) {
      panel.innerHTML = `<div style="font-size:13px;color:#f87171;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:8px;padding:14px;">${e.message}</div>`;
    }
    this._updateCount();
  },

  _renderTunables() {
    const panel = document.getElementById('tunables-panel');
    if (!panel) return;

    if (!this._tunables.length) {
      panel.innerHTML = `<div style="font-size:13px;color:var(--text-muted);">This strategy has no numeric indicator or exit parameters to sweep.</div>`;
      return;
    }

    const groups = {};
    for (const k of this._tunables) (groups[k.group] = groups[k.group] || []).push(k);

    panel.innerHTML = Object.entries(groups).map(([group, knobs]) => `
      <div style="margin-bottom:16px;">
        <div style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">${group}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;">
          ${knobs.map(k => `
            <div>
              <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px;">${k.label} <span style="opacity:.6;">(current: ${k.current})</span></label>
              <input class="input-base" data-knob-path="${k.path}" id="knob-${k.path}" placeholder="Leave blank for ${k.current}" style="font-size:13px;padding:7px 10px;" oninput="LabNewPage._updateCount()" />
            </div>
          `).join('')}
        </div>
      </div>
    `).join('') + `<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Comma-separate multiple values to sweep them (e.g. "14, 21, 28"). A blank field keeps the strategy's current value.</div>`;
  },

  _parseKnobInput(raw, valueType) {
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
    const nums = [];
    const seen = new Set();
    for (const p of parts) {
      const n = valueType === 'int' ? parseInt(p, 10) : parseFloat(p);
      if (!isNaN(n) && !seen.has(n)) { nums.push(n); seen.add(n); }
    }
    return nums;
  },

  /** Committed symbol tags plus whatever's still sitting in the input box
   * (not yet confirmed with Enter) — this is also exactly what _submit() sends,
   * so the button's enabled state never disagrees with what submitting would do. */
  _effectiveSymbols() {
    const pending = document.getElementById('symbol-input')?.value?.trim()?.toUpperCase();
    const list = [...this._symbols];
    if (pending && !list.includes(pending)) list.push(pending);
    return list;
  },

  _computeCounts() {
    let sweepProduct = 1;
    let hasAnyOverride = false;
    const overrides = {};
    for (const knob of this._tunables) {
      const el = document.getElementById(`knob-${knob.path}`);
      if (!el) continue;
      const raw = el.value.trim();
      if (!raw) continue;
      const values = this._parseKnobInput(raw, knob.value_type);
      if (!values.length) continue;
      overrides[knob.path] = values;
      sweepProduct *= values.length;
      hasAnyOverride = true;
    }
    // The strategy's own unmodified config always runs alongside a sweep as an
    // explicit baseline (mirrors apps/lab/config_tools.py::generate_variants),
    // so the displayed count must include that +1 or it'll undercount vs. what
    // actually gets queued.
    const variantCount = hasAnyOverride ? sweepProduct + 1 : 1;
    const symbolCount = this._effectiveSymbols().length;
    return { variantCount, symbolCount, total: variantCount * symbolCount, overrides, sweepProduct };
  },

  _updateCount() {
    const el = document.getElementById('variant-count-display');
    const submitBtn = document.getElementById('submit-lab-btn');
    if (!el) return;

    const { variantCount, symbolCount, total, sweepProduct } = this._computeCounts();
    const overVariants = sweepProduct > this._maxVariants;
    const overTotal = total > this._maxTotal;
    const noSymbols = symbolCount === 0;
    const bad = overVariants || overTotal;

    el.innerHTML = `
      <span style="color:${bad ? '#ef4444' : '#818cf8'};font-weight:700;">${variantCount}</span> variant(s) ×
      <span style="font-weight:700;">${symbolCount}</span> symbol(s) =
      <span style="color:${bad ? '#ef4444' : '#10b981'};font-weight:700;">${total}</span> backtest(s)
      ${overVariants ? `<div style="color:#ef4444;font-size:11px;margin-top:4px;">Exceeds the ${this._maxVariants}-variant limit — reduce swept values.</div>` : ''}
      ${!overVariants && overTotal ? `<div style="color:#ef4444;font-size:11px;margin-top:4px;">Exceeds the ${this._maxTotal}-total-backtest limit — reduce symbols or swept values.</div>` : ''}
    `;
    if (submitBtn) submitBtn.disabled = bad || !this._strategy || noSymbols;
  },

  _onSymbolKey(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = e.target.value.trim().toUpperCase().replace(/,/g, '');
      if (val && !this._symbols.includes(val)) {
        this._symbols.push(val);
        this._renderSymbolTags();
        this._updateCount();
      }
      e.target.value = '';
    }
  },

  _renderSymbolTags() {
    const el = document.getElementById('symbol-tags');
    if (!el) return;
    el.innerHTML = this._symbols.map(sym => `
      <span class="tag">${sym}<button onclick="LabNewPage._removeSymbol('${sym}')">×</button></span>
    `).join('');
  },

  _removeSymbol(sym) {
    this._symbols = this._symbols.filter(s => s !== sym);
    this._renderSymbolTags();
    this._updateCount();
  },

  async _submit() {
    if (!this._strategy) { Toast.warning('Select a strategy'); return; }

    const symbols = this._effectiveSymbols();
    if (!symbols.length) { Toast.warning('Add at least one symbol'); return; }

    const start = document.getElementById('lab-start')?.value;
    const end = document.getElementById('lab-end')?.value;
    if (!start || !end) { Toast.warning('Select date range'); return; }

    const { total, overrides, sweepProduct } = this._computeCounts();
    if (sweepProduct > this._maxVariants || total > this._maxTotal) {
      Toast.warning('Reduce the sweep size before running');
      return;
    }

    const timeframeVal = document.getElementById('lab-timeframe')?.value;

    const payload = {
      strategy_id: this._strategy.id,
      name: document.getElementById('lab-name')?.value?.trim() || '',
      symbols,
      start_date: start,
      end_date: end,
      initial_capital: parseFloat(document.getElementById('lab-capital')?.value) || 100000,
      commission_pct: parseFloat(document.getElementById('lab-commission')?.value) || 0,
      slippage_pct: parseFloat(document.getElementById('lab-slippage')?.value) || 0,
      timeframe: timeframeVal && timeframeVal !== this._strategy.timeframe ? timeframeVal : '',
      overrides,
    };

    const btn = document.getElementById('submit-lab-btn');
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Queuing sweep (${total} backtests)...`;

    try {
      const run = await API.createLabRun(payload);
      Toast.success('Lab run queued!');
      App.navigate('/lab/' + run.id);
    } catch (e) {
      Toast.error('Failed to start sweep: ' + e.message);
      btn.disabled = false;
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run Sweep`;
    }
  }
};
