// new-strategy.js — create a new strategy with step progress
const NewStrategyPage = {
  _tab: 'youtube',
  _pollInterval: null,

  render(container) {
    this._cleanup();
    container.innerHTML = `
      <div class="page-enter" style="max-width:640px;margin:0 auto;">
        <div style="margin-bottom:28px;">
          <a data-link href="/strategies" style="font-size:13px;color:var(--text-muted);text-decoration:none;display:inline-flex;align-items:center;gap:5px;margin-bottom:12px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            Back to Strategies
          </a>
          <h1 style="font-size:24px;font-weight:700;margin-bottom:4px;">Add New Strategy</h1>
          <p style="color:var(--text-muted);font-size:14px;">Paste a YouTube URL, webpage, or describe the strategy with keywords</p>
        </div>

        <div class="card" style="padding:28px;">
          <!-- Source type tabs -->
          <div style="display:flex;gap:6px;background:rgba(255,255,255,.04);padding:4px;border-radius:10px;margin-bottom:24px;">
            ${[
              { id: 'youtube', label: 'YouTube URL', icon: '<path d="M23 7s-.3-1.9-1.2-2.7c-1.1-1.2-2.4-1.2-3-1.3C16.1 3 12 3 12 3s-4.1 0-6.8.2c-.6.1-1.9.1-3 1.3C1.3 5.2 1 7 1 7S.7 9.1.7 11.2v2c0 2.1.3 4.2.3 4.2s.3 1.9 1.2 2.7c1.1 1.2 2.6 1.2 3.3 1.2C7.2 21.4 12 21.4 12 21.4s4.1 0 6.8-.3c.6-.1 1.9-.1 3-1.3.9-.8 1.2-2.7 1.2-2.7s.3-2.1.3-4.2v-2C23.3 9.1 23 7 23 7zM9.7 15.5V8.4l8.1 3.6-8.1 3.5z"/>' },
              { id: 'webpage', label: 'Webpage URL', icon: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>' },
              { id: 'keyword', label: 'Keywords', icon: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>' },
            ].map(t => `
              <button onclick="NewStrategyPage._setTab('${t.id}')"
                id="tab-${t.id}"
                style="flex:1;padding:8px 0;border-radius:7px;border:none;cursor:pointer;font-size:13px;font-weight:500;display:flex;align-items:center;justify-content:center;gap:6px;transition:all .2s;
                  ${this._tab === t.id ? 'background:var(--indigo);color:#fff;' : 'background:transparent;color:var(--text-muted);'}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="${t.id === 'youtube' && this._tab === t.id ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round">${t.icon}</svg>
                ${t.label}
              </button>
            `).join('')}
          </div>

          <!-- Input area -->
          <div id="input-area" style="margin-bottom:20px;">
            ${this._renderInput()}
          </div>

          <button id="submit-btn" class="btn-primary" style="width:100%;justify-content:center;padding:12px;" onclick="NewStrategyPage._submit()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            Scrape & Analyse
          </button>
        </div>

        <!-- Progress panel (hidden initially) -->
        <div id="progress-panel" style="display:none;margin-top:20px;"></div>
      </div>
    `;
  },

  _renderInput() {
    if (this._tab === 'keyword') {
      return `<textarea class="input-base" id="source-input" rows="4" placeholder="e.g. RSI divergence strategy with EMA crossover on 15 minute chart..."></textarea>`;
    }
    const placeholder = this._tab === 'youtube'
      ? 'https://www.youtube.com/watch?v=...'
      : 'https://example.com/trading-strategy...';
    return `<input class="input-base" id="source-input" type="url" placeholder="${placeholder}" />`;
  },

  _setTab(tab) {
    this._tab = tab;
    document.querySelectorAll('[id^="tab-"]').forEach(btn => {
      const isActive = btn.id === `tab-${tab}`;
      btn.style.background = isActive ? 'var(--indigo)' : 'transparent';
      btn.style.color = isActive ? '#fff' : 'var(--text-muted)';
    });
    const area = document.getElementById('input-area');
    if (area) area.innerHTML = this._renderInput();
  },

  async _submit() {
    const input = document.getElementById('source-input');
    const val = input ? input.value.trim() : '';
    if (!val) { Toast.warning('Please enter a ' + (this._tab === 'keyword' ? 'keyword' : 'URL')); return; }

    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Creating...`;

    try {
      const payload = { source_type: this._tab };
      if (this._tab === 'keyword') payload.keywords = val;
      else payload.source_url = val;

      const strategy = await API.createStrategy(payload);
      this._showProgress(strategy.id);
    } catch (e) {
      Toast.error('Failed to create strategy: ' + e.message);
      btn.disabled = false;
      btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Scrape & Analyse`;
    }
  },

  _showProgress(strategyId) {
    const panel = document.getElementById('progress-panel');
    if (!panel) return;
    panel.style.display = 'block';

    const steps = [
      { id: 'step1', label: 'Scraping source content...' },
      { id: 'step2', label: 'Extracting strategy details with AI...' },
      { id: 'step3', label: 'Generating backtest script...' },
    ];

    panel.innerHTML = `
      <div class="card" style="padding:24px;">
        <h3 style="font-size:15px;font-weight:600;margin-bottom:16px;">Processing Strategy</h3>
        <div class="progress-bar-wrap" style="margin-bottom:20px;"><div class="progress-bar-indeterminate"></div></div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${steps.map((s, i) => `
            <div class="step-item active" id="${s.id}">
              <span class="spinner" id="${s.id}-icon"></span>
              <span id="${s.id}-text" style="font-size:14px;color:var(--text-muted);">Step ${i+1}: ${s.label}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    let lastStatus = 'generating';
    this._pollInterval = setInterval(async () => {
      try {
        const status = await API.getStrategyStatus(strategyId);
        const s = status.script_status;

        if (s === 'generated') {
          this._cleanup();
          steps.forEach((step, i) => this._markStepDone(step.id, i + 1, step.label.replace('...', '')));
          setTimeout(() => App.navigate('/strategies/' + strategyId), 600);
        } else if (s === 'failed') {
          this._cleanup();
          steps.forEach((step, i) => this._markStepDone(step.id, i + 1, step.label.replace('...', ''), false));
          panel.innerHTML += `<div style="margin-top:12px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);border-radius:8px;padding:12px 16px;font-size:13px;color:#f87171;">${status.script_error || 'Generation failed'}</div>`;
        }
        lastStatus = s;
      } catch (e) {
        // keep polling
      }
    }, 5000);
  },

  _markStepDone(stepId, num, label, success = true) {
    const item = document.getElementById(stepId);
    const icon = document.getElementById(`${stepId}-icon`);
    const text = document.getElementById(`${stepId}-text`);
    if (!item || !icon || !text) return;

    item.className = 'step-item done';
    icon.outerHTML = success
      ? `<svg id="${stepId}-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" style="flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>`
      : `<svg id="${stepId}-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" style="flex-shrink:0"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    text.textContent = `Step ${num}: ${label}`;
    text.style.color = success ? '#e2e8f0' : '#f87171';
  },

  _cleanup() {
    if (this._pollInterval) { clearInterval(this._pollInterval); this._pollInterval = null; }
  }
};
