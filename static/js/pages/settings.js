// settings.js — runtime data-provider switch (yfinance <-> Upstox), no restart needed
const SettingsPage = {
  async render(container) {
    container.innerHTML = `
      <div class="page-enter" style="max-width:560px;margin:0 auto;">
        <div style="margin-bottom:28px;">
          <h1 style="font-size:24px;font-weight:700;margin-bottom:4px;">Settings</h1>
          <p style="color:var(--text-muted);font-size:14px;">Applies immediately to the next backtest, screener, or lab run — no restart needed.</p>
        </div>

        <div class="card" style="padding:28px;margin-bottom:20px;">
          <div style="margin-bottom:20px;">
            <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">OHLCV Data Provider</label>
            <select class="input-base" id="set-provider" style="font-size:13px;padding:9px 12px;">
              <option value="yfinance">yfinance (global symbols)</option>
              <option value="upstox">Upstox (NSE/BSE only)</option>
            </select>
          </div>

          <div id="set-upstox-fields" style="display:none;">
            <div style="margin-bottom:6px;">
              <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">
                Upstox Access Token
                <span id="set-token-status" style="opacity:.6;"></span>
              </label>
              <input type="password" class="input-base" id="set-token" placeholder="Leave blank to keep the current token" style="font-size:13px;padding:9px 12px;" autocomplete="off" />
              <p style="font-size:11px;color:var(--text-muted);margin-top:6px;">Generated via Upstox's OAuth login flow. Expires daily around 3:30am IST — comes back here to paste a new one, or set UPSTOX_ACCESS_TOKEN in .env as a fallback.</p>
            </div>
          </div>
        </div>

        <button class="btn-primary" id="set-save-btn" style="width:100%;justify-content:center;padding:12px;" onclick="SettingsPage._save()">
          Save
        </button>
      </div>
    `;

    document.getElementById('set-provider').addEventListener('change', (e) => this._toggleUpstoxFields(e.target.value));

    try {
      const s = await API.getDataProviderSettings();
      document.getElementById('set-provider').value = s.data_provider || 'yfinance';
      document.getElementById('set-token-status').textContent = s.upstox_access_token_set ? '(currently set)' : '(not set)';
      this._toggleUpstoxFields(s.data_provider || 'yfinance');
    } catch (e) {
      Toast.error('Failed to load settings: ' + e.message);
    }
  },

  _toggleUpstoxFields(provider) {
    const el = document.getElementById('set-upstox-fields');
    if (el) el.style.display = provider === 'upstox' ? '' : 'none';
  },

  async _save() {
    const btn = document.getElementById('set-save-btn');
    const payload = {
      data_provider: document.getElementById('set-provider')?.value,
    };
    const token = document.getElementById('set-token')?.value;
    if (token) payload.upstox_access_token = token;

    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Saving...`;

    try {
      const s = await API.updateDataProviderSettings(payload);
      Toast.success('Settings saved — takes effect on the next run');
      document.getElementById('set-token').value = '';
      document.getElementById('set-token-status').textContent = s.upstox_access_token_set ? '(currently set)' : '(not set)';
    } catch (e) {
      Toast.error('Failed to save: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = 'Save';
    }
  },
};
