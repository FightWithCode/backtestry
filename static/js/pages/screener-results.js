// screener-results.js — signals found by a scan, with a per-signal "why did this
// qualify" breakdown of the exact rule values that triggered it.
const ScreenerResultsPage = {
  _run: null,
  _pollInterval: null,
  _directionFilter: 'all',
  _detailOverlay: null,

  _opLabels: {
    gt: '>', lt: '<', gte: '≥', lte: '≤', eq: '=', neq: '≠',
    add: '+', sub: '−', mul: '×', div: '÷',
    crosses_above: 'crosses above', crosses_below: 'crosses below',
    prev: 'prev', rising: 'rising', falling: 'falling',
  },

  async render(container, params) {
    const id = params.id;
    this._cleanup();
    this._directionFilter = 'all';

    container.innerHTML = `
      <div class="page-enter">
        <div style="margin-bottom:20px;font-size:13px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">
          <a data-link href="/screener" style="color:var(--text-muted);text-decoration:none;">Screener</a>
          <span>›</span>
          <span>Scan Results</span>
        </div>
        <div id="scr-content">
          <div class="skeleton" style="height:64px;margin-bottom:16px;"></div>
          <div class="skeleton" style="height:400px;"></div>
        </div>
      </div>
    `;

    try {
      this._run = await API.getScreenerRun(id);
      if (['queued', 'running'].includes(this._run.status)) {
        this._renderRunning();
        this._startPoll(id);
      } else {
        this._renderResults();
      }
    } catch (e) {
      Toast.error('Failed to load scan: ' + e.message);
    }
  },

  _renderRunning() {
    const run = this._run;
    document.getElementById('scr-content').innerHTML = `
      <div style="margin-bottom:20px;">
        <h1 style="font-size:20px;font-weight:700;margin-bottom:6px;">Scan Running</h1>
        <div style="font-size:13px;color:var(--text-muted);">${run.strategy_name} · ${run.symbol_count} symbols · as of ${run.as_of_date}</div>
      </div>
      <div class="card" style="padding:28px;max-width:600px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
          <span class="spinner spinner-lg"></span>
          <div>
            <div style="font-weight:600;margin-bottom:2px;">Scanning ${run.symbol_count} symbols...</div>
            <div style="font-size:13px;color:var(--text-muted);">Status: <span class="badge badge-${run.status}">${run.status}</span></div>
          </div>
        </div>
        <div class="progress-bar-wrap"><div class="progress-bar-indeterminate"></div></div>
      </div>
    `;
  },

  _startPoll(id) {
    this._pollInterval = setInterval(async () => {
      try {
        const s = await API.getScreenerRunStatus(id);
        if (s.status === 'completed') {
          this._cleanup_poll();
          this._run = await API.getScreenerRun(id);
          this._renderResults();
        } else if (s.status === 'failed') {
          this._cleanup_poll();
          this._run = await API.getScreenerRun(id);
          this._renderFailed(s.error);
        }
      } catch (e) {}
    }, 3000);
  },

  _cleanup_poll() {
    if (this._pollInterval) { clearInterval(this._pollInterval); this._pollInterval = null; }
  },

  _renderFailed(error) {
    document.getElementById('scr-content').innerHTML = `
      <div style="margin-bottom:20px;"><h1 style="font-size:20px;font-weight:700;color:#ef4444;">Scan Failed</h1></div>
      <div class="card" style="padding:24px;border-color:rgba(239,68,68,.3);background:rgba(239,68,68,.05);">
        <p style="font-size:14px;color:#f87171;margin-bottom:16px;">${error || 'An unknown error occurred while scanning.'}</p>
        <button class="btn-secondary" onclick="history.back()">← Go Back</button>
      </div>
    `;
  },

  _renderResults() {
    const run = this._run;
    const el = document.getElementById('scr-content');

    el.innerHTML = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:20px;">
        <div>
          <h1 style="font-size:20px;font-weight:700;margin-bottom:6px;">${run.strategy_name} — Scan Results</h1>
          <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;font-size:13px;color:var(--text-muted);">
            <span>${run.universe_name || `${run.symbol_count} custom symbols`}</span>
            <span style="color:var(--border);">·</span>
            <span>as of ${run.as_of_date}</span>
            <span style="color:var(--border);">·</span>
            <span>${run.symbols_scanned}/${run.symbol_count} scanned${(run.symbols_failed || []).length ? `, ${run.symbols_failed.length} failed` : ''}</span>
            <span class="badge badge-completed">Completed</span>
          </div>
        </div>
        <button onclick="ScreenerResultsPage._confirmDelete()" class="btn-secondary" style="padding:5px 10px;color:#ef4444;border-color:rgba(239,68,68,.25);flex-shrink:0;" title="Delete scan">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;">
        <div class="metric-card" style="padding:14px 20px;">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Signals Found</div>
          <div style="font-size:22px;font-weight:700;color:#34d399;">${run.signals_found}</div>
        </div>
        <div class="metric-card" style="padding:14px 20px;">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Symbols Scanned</div>
          <div style="font-size:22px;font-weight:700;">${run.symbols_scanned}</div>
        </div>
        <div class="metric-card" style="padding:14px 20px;">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Failed</div>
          <div style="font-size:22px;font-weight:700;color:${(run.symbols_failed || []).length ? '#f59e0b' : 'var(--text-muted)'};">${(run.symbols_failed || []).length}</div>
        </div>
      </div>

      ${(run.symbols_failed || []).length ? `
      <details style="margin-bottom:20px;">
        <summary style="cursor:pointer;font-size:12px;color:var(--text-muted);">Show ${run.symbols_failed.length} failed symbol(s)</summary>
        <div style="font-size:12px;color:var(--text-muted);margin-top:8px;padding:10px 14px;background:rgba(255,255,255,.02);border-radius:8px;">${run.symbols_failed.join(', ')}</div>
      </details>` : ''}

      <div class="card" style="padding:20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
          <h3 style="font-size:14px;font-weight:600;">Signals</h3>
          <div id="direction-pills" style="display:flex;gap:6px;">
            ${['all', 'long', 'short'].map(d => `<button class="filter-pill${d === this._directionFilter ? ' active' : ''}" onclick="ScreenerResultsPage._setDirectionFilter('${d}')">${d.charAt(0).toUpperCase() + d.slice(1)}</button>`).join('')}
          </div>
        </div>
        <div id="signals-table"></div>
      </div>
    `;

    this._renderSignalsTable();
  },

  _setDirectionFilter(d) {
    this._directionFilter = d;
    document.querySelectorAll('#direction-pills .filter-pill').forEach(btn => {
      btn.classList.toggle('active', btn.textContent.toLowerCase() === d);
    });
    this._renderSignalsTable();
  },

  _renderSignalsTable() {
    const el = document.getElementById('signals-table');
    if (!el) return;

    let signals = this._run.signals || [];
    if (this._directionFilter !== 'all') signals = signals.filter(s => s.direction === this._directionFilter);

    if (!signals.length) {
      el.innerHTML = `<p style="color:var(--text-muted);font-size:14px;padding:24px 0;text-align:center;">No signals${this._directionFilter !== 'all' ? ` (${this._directionFilter})` : ''} — no symbols in this universe currently qualify.</p>`;
      return;
    }

    el.innerHTML = `
      <div style="overflow:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Direction</th>
              <th>Entry Price</th>
              <th>Stop</th>
              <th>Target(s)</th>
              <th>Matched Entry</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${signals.map(sig => {
              const isLong = sig.direction === 'long';
              const stops = (sig.exit_plan || []).filter(x => x.type === 'stop');
              const targets = (sig.exit_plan || []).filter(x => x.type === 'target');
              return `
              <tr>
                <td style="font-weight:600;">${sig.symbol}</td>
                <td>
                  <span style="display:inline-block;padding:2px 8px;border-radius:5px;font-size:11px;font-weight:700;
                    background:${isLong ? 'rgba(99,102,241,.15)' : 'rgba(249,115,22,.15)'};
                    color:${isLong ? '#818cf8' : '#f97316'};">${sig.direction.toUpperCase()}</span>
                </td>
                <td>$${sig.entry_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                <td style="color:#ef4444;font-size:12px;">${stops.length ? stops.map(s => `$${s.price}`).join(', ') : '—'}</td>
                <td style="color:#10b981;font-size:12px;">${targets.length ? targets.map(t => `$${t.price}`).join(', ') : '—'}</td>
                <td style="color:var(--text-muted);font-size:12px;">${sig.entry_tag}</td>
                <td><a href="javascript:void(0)" onclick="ScreenerResultsPage._openDetail('${sig.id}')" style="color:var(--indigo);font-size:12px;font-weight:500;">Why? →</a></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  _renderExplainNode(node) {
    if (!node) return '';
    if (node.kind === 'literal') return `<span style="color:#94a3b8;">${node.value}</span>`;
    if (node.kind === 'ref') return `<span style="color:#818cf8;font-weight:600;">${node.ref}</span><span style="color:var(--text-muted);">(${node.value})</span>`;

    if (node.kind === 'comparison' || node.kind === 'arithmetic' || node.kind === 'cross' || node.kind === 'lookback') {
      const opLabel = ScreenerResultsPage._opLabels[node.op] || node.op;
      const isBoolNode = node.kind === 'comparison' || node.kind === 'cross';
      const icon = isBoolNode ? (node.result ? '✓' : '✗') : '';
      const iconColor = node.result ? '#10b981' : '#ef4444';
      if (node.kind === 'lookback') {
        return `<span style="display:inline-flex;align-items:center;gap:5px;">
          <span style="color:var(--text-muted);">${opLabel}(</span>${ScreenerResultsPage._renderExplainNode(node.inner)}<span style="color:var(--text-muted);">) = ${node.result}</span>
        </span>`;
      }
      return `<span style="display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap;">
        ${icon ? `<span style="color:${iconColor};font-weight:700;">${icon}</span>` : ''}
        ${ScreenerResultsPage._renderExplainNode(node.left)}
        <span style="color:var(--text-muted);font-weight:600;">${opLabel}</span>
        ${ScreenerResultsPage._renderExplainNode(node.right)}
        ${!isBoolNode ? `<span style="color:var(--text-muted);">= ${node.result}</span>` : ''}
      </span>`;
    }

    if (node.kind === 'logic') {
      const iconColor = node.result ? '#10b981' : '#ef4444';
      if (node.op === 'not') {
        return `<div style="display:flex;align-items:center;gap:6px;">
          <span style="color:${iconColor};font-weight:700;">${node.result ? '✓' : '✗'}</span>
          <span style="color:var(--text-muted);font-weight:600;">NOT</span>
          ${ScreenerResultsPage._renderExplainNode(node.children[0])}
        </div>`;
      }
      return `
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <span style="color:${iconColor};font-weight:700;">${node.result ? '✓' : '✗'}</span>
          <span style="color:var(--text-muted);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;">${node.op}</span>
        </div>
        <div style="padding-left:18px;border-left:2px solid var(--border);display:flex;flex-direction:column;gap:6px;">
          ${node.children.map(c => `<div>${ScreenerResultsPage._renderExplainNode(c)}</div>`).join('')}
        </div>
      `;
    }
    return '';
  },

  _openDetail(signalId) {
    const sig = (this._run.signals || []).find(s => String(s.id) === String(signalId));
    if (!sig) return;
    this._closeDetail();

    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1000;display:flex;align-items:flex-start;justify-content:center;backdrop-filter:blur(4px);overflow:auto;padding:32px 16px;`;
    overlay.innerHTML = `
      <div class="card" style="padding:24px;max-width:720px;width:100%;animation:pageEnter .2s ease;margin-bottom:32px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;gap:12px;">
          <div>
            <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">${sig.direction.toUpperCase()} · ${sig.as_of_date}</div>
            <h3 style="font-size:18px;font-weight:700;">${sig.symbol}</h3>
          </div>
          <button id="close-scr-detail-btn" class="btn-secondary" style="padding:6px 10px;">✕</button>
        </div>

        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px;">
          <div class="metric-card" style="padding:12px 14px;">
            <div style="font-size:10px;color:var(--text-muted);margin-bottom:3px;">Open</div>
            <div style="font-size:14px;font-weight:600;">$${sig.bar.open}</div>
          </div>
          <div class="metric-card" style="padding:12px 14px;">
            <div style="font-size:10px;color:var(--text-muted);margin-bottom:3px;">High</div>
            <div style="font-size:14px;font-weight:600;">$${sig.bar.high}</div>
          </div>
          <div class="metric-card" style="padding:12px 14px;">
            <div style="font-size:10px;color:var(--text-muted);margin-bottom:3px;">Low</div>
            <div style="font-size:14px;font-weight:600;">$${sig.bar.low}</div>
          </div>
          <div class="metric-card" style="padding:12px 14px;">
            <div style="font-size:10px;color:var(--text-muted);margin-bottom:3px;">Close (entry)</div>
            <div style="font-size:14px;font-weight:600;color:#818cf8;">$${sig.bar.close}</div>
          </div>
        </div>

        <div style="margin-bottom:20px;">
          <h4 style="font-size:13px;font-weight:600;margin-bottom:10px;">Exit Plan</h4>
          <div style="overflow:auto;">
            <table class="data-table">
              <thead><tr><th>Tag</th><th>Type</th><th>Price</th><th>Close %</th><th>Note</th></tr></thead>
              <tbody>
                ${(sig.exit_plan || []).map(x => `
                  <tr>
                    <td>${x.tag}</td>
                    <td><span style="color:${x.type === 'stop' ? '#ef4444' : x.type === 'target' ? '#10b981' : 'var(--text-muted)'};">${x.type}</span></td>
                    <td>${x.price !== undefined ? `$${x.price}` : (x.bars !== undefined ? `${x.bars} bars` : '—')}</td>
                    <td>${x.close_pct}%</td>
                    <td style="color:var(--text-muted);font-size:12px;">${x.note || ''}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div style="margin-bottom:20px;">
          <h4 style="font-size:13px;font-weight:600;margin-bottom:10px;">Indicator Values (as of ${sig.as_of_date})</h4>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            ${Object.entries(sig.indicator_snapshot || {}).map(([id, val]) => `
              <span style="background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.15);padding:5px 12px;border-radius:6px;font-size:12px;">
                <span style="color:#818cf8;font-weight:600;">${id}</span> = ${val}
              </span>
            `).join('')}
          </div>
        </div>

        <div>
          <h4 style="font-size:13px;font-weight:600;margin-bottom:10px;">Why This Qualified</h4>
          <div class="card" style="padding:16px;background:rgba(255,255,255,.02);font-size:13px;line-height:1.7;">
            ${ScreenerResultsPage._renderExplainNode(sig.rule_explanation.when)}
            ${sig.rule_explanation.guard ? `
              <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">
                <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;margin-bottom:8px;">Guard</div>
                ${ScreenerResultsPage._renderExplainNode(sig.rule_explanation.guard)}
              </div>` : ''}
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    this._detailOverlay = overlay;
    document.getElementById('close-scr-detail-btn').onclick = () => this._closeDetail();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this._closeDetail(); });
  },

  _closeDetail() {
    if (this._detailOverlay) { this._detailOverlay.remove(); this._detailOverlay = null; }
  },

  _confirmDelete() {
    const run = this._run;
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
        <p style="font-size:14px;color:var(--text-muted);margin-bottom:20px;">Delete this scan of ${run.strategy_name} and all ${run.signals_found} signal(s)?</p>
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
        await API.deleteScreenerRun(run.id);
        overlay.remove();
        Toast.success('Scan deleted');
        App.navigate('/screener');
      } catch (e) {
        Toast.error('Failed to delete: ' + e.message);
        overlay.remove();
      }
    };
  },

  _cleanup() {
    this._cleanup_poll();
    this._closeDetail();
  }
};
